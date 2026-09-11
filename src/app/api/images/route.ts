import { IMAGE_REQUESTS_PER_MINUTE, ImageInputError, parseImageOptions } from '@/lib/image-options';
import { createImageQuota } from '@/lib/image-quota';
import crypto from 'crypto';
import fs from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import path from 'path';
import sharp from 'sharp';

type StreamingEvent = {
    type: 'partial_image' | 'completed' | 'error' | 'done';
    index?: number;
    partial_image_index?: number;
    b64_json?: string;
    filename?: string;
    path?: string;
    output_format?: string;
    usage?: ApiUsage;
    images?: SavedImageData[];
    failures?: GenerationFailure[];
    error?: string;
};

type ApiUsage = {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: {
        text_tokens?: number;
        image_tokens?: number;
        cached_tokens?: number;
    };
};

type SavedImageData = {
    filename: string;
    b64_json: string;
    path?: string;
    output_format: string;
};

type GenerationFailure = {
    index: number;
    error: string;
    status?: number;
    retryAfter?: number;
};

function addUsageValue(left?: number, right?: number): number | undefined {
    if (left === undefined && right === undefined) {
        return undefined;
    }

    return (left ?? 0) + (right ?? 0);
}

function mergeUsage(total: ApiUsage | undefined, next: ApiUsage | undefined): ApiUsage | undefined {
    if (!next) {
        return total;
    }

    return {
        input_tokens: addUsageValue(total?.input_tokens, next.input_tokens),
        output_tokens: addUsageValue(total?.output_tokens, next.output_tokens),
        total_tokens: addUsageValue(total?.total_tokens, next.total_tokens),
        input_tokens_details:
            total?.input_tokens_details || next.input_tokens_details
                ? {
                      text_tokens: addUsageValue(
                          total?.input_tokens_details?.text_tokens,
                          next.input_tokens_details?.text_tokens
                      ),
                      image_tokens: addUsageValue(
                          total?.input_tokens_details?.image_tokens,
                          next.input_tokens_details?.image_tokens
                      ),
                      cached_tokens: addUsageValue(
                          total?.input_tokens_details?.cached_tokens,
                          next.input_tokens_details?.cached_tokens
                      )
                  }
                : undefined
    };
}

const config = {
    apiKey: process.env.AZURE_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.AZURE_OPENAI_ENDPOINT || process.env.OPENAI_API_BASE_URL
};

const useCustomEndpoint = Boolean(process.env.AZURE_OPENAI_ENDPOINT);
const responseModel = process.env.AZURE_OPENAI_TEXT_MODEL || 'gpt-chat-latest';

const outputDir = path.resolve(process.cwd(), 'generated-images');
const imageQuota = createImageQuota();

const VALID_OUTPUT_FORMATS = ['png', 'jpeg', 'webp'] as const;
type ValidOutputFormat = (typeof VALID_OUTPUT_FORMATS)[number];

function createApiClient(imageDeployment?: string) {
    const defaultHeaders = useCustomEndpoint
        ? {
              'api-key': config.apiKey!,
              ...(imageDeployment ? { 'x-ms-oai-image-generation-deployment': imageDeployment } : {}),
              api_version: 'preview'
          }
        : undefined;

    return new OpenAI({
        apiKey: useCustomEndpoint ? 'unused' : config.apiKey,
        baseURL: config.baseURL,
        defaultHeaders,
        maxRetries: 0,
        timeout: 600_000
    });
}

function validateOutputFormat(format: unknown): ValidOutputFormat {
    const normalized = String(format || 'png').toLowerCase();
    const mapped = normalized === 'jpg' ? 'jpeg' : normalized;

    if (VALID_OUTPUT_FORMATS.includes(mapped as ValidOutputFormat)) {
        return mapped as ValidOutputFormat;
    }

    return 'png';
}

async function ensureOutputDirExists() {
    try {
        await fs.access(outputDir);
    } catch (error: unknown) {
        if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            (error as { code?: string }).code === 'ENOENT'
        ) {
            await fs.mkdir(outputDir, { recursive: true });
            console.log(`Created output directory: ${outputDir}`);
        } else {
            console.error(`Error accessing output directory ${outputDir}:`, error);
            throw new Error(
                `Failed to access or ensure image output directory exists. Original error: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
}

function sha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
}

async function persistGeneratedImage(
    filename: string,
    b64_json: string,
    output_format: ValidOutputFormat,
    effectiveStorageMode: 'fs' | 'indexeddb',
    outputCompression?: number
): Promise<SavedImageData> {
    // The gateway accepts PNG/JPEG only. Encode WebP locally from lossless PNG.
    if (output_format === 'webp') {
        b64_json = (
            await sharp(Buffer.from(b64_json, 'base64'))
                .webp({ quality: outputCompression ?? 100 })
                .toBuffer()
        ).toString('base64');
    }
    if (effectiveStorageMode === 'fs') {
        const buffer = Buffer.from(b64_json, 'base64');
        const filepath = path.join(outputDir, filename);
        await fs.writeFile(filepath, buffer);
    }

    return {
        filename,
        b64_json,
        output_format,
        ...(effectiveStorageMode === 'fs' ? { path: `/api/image/${filename}` } : {})
    };
}

// Helper to send SSE event
function sseEvent(event: StreamingEvent): string {
    return `data: ${JSON.stringify(event)}\n\n`;
}

type GenerateImageOptions = {
    index: number;
    apiClient: OpenAI;
    inputContent: string | OpenAI.Responses.ResponseInputItem[];
    imageGenTool: OpenAI.Responses.Tool;
    timestamp: string;
    fileExtension: ValidOutputFormat;
    effectiveStorageMode: 'fs' | 'indexeddb';
    signal?: AbortSignal;
    outputCompression?: number;
};

type GeneratedImageResult = {
    index: number;
    savedImage: SavedImageData;
    usage?: ApiUsage;
};

type SettledGenerationBatch = {
    results: GeneratedImageResult[];
    failures: GenerationFailure[];
    usage?: ApiUsage;
};

const IMAGE_GENERATION_INSTRUCTIONS = `Use the image_generation tool to create the requested visual result. Follow the user's brief without adding a new creative direction. Render only text intended to appear in the image, preserving its exact wording unless translation or replacement is requested. Use numbered reference images for their assigned roles. For local edits, preserve unrelated details while allowing the requested change and its necessary effects on lighting, shadows, and contact. For a new scene or style transfer, borrow only the requested reference features; do not freeze the source composition. Honor explicit preservation constraints and requested transparency.`;

const IMAGE_GENERATION_TOOL_CHOICE: OpenAI.Responses.ToolChoiceAllowed = {
    type: 'allowed_tools',
    mode: 'required',
    tools: [{ type: 'image_generation' }]
};

function toRequestOptions(signal?: AbortSignal): { signal: AbortSignal } | undefined {
    return signal ? { signal } : undefined;
}

function createImageGenerationResponse({
    apiClient,
    inputContent,
    imageGenTool,
    signal
}: Pick<GenerateImageOptions, 'apiClient' | 'inputContent' | 'imageGenTool' | 'signal'>) {
    return apiClient.responses.create(
        {
            model: responseModel,
            instructions: IMAGE_GENERATION_INSTRUCTIONS,
            input: inputContent,
            tools: [imageGenTool],
            tool_choice: IMAGE_GENERATION_TOOL_CHOICE
        },
        toRequestOptions(signal)
    );
}

function getErrorMessage(error: unknown): string {
    if (error instanceof OpenAI.APIError && error.status === 429) {
        const seconds = getRetryAfter(error);
        return `Model quota reached. Wait ${seconds} seconds, then try again.`;
    }
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    return 'Unknown image generation error.';
}

function getRetryAfter(error: InstanceType<typeof OpenAI.APIError>): number {
    const value = error.headers?.get('retry-after');
    const seconds = value && /^\d+$/.test(value) ? Number(value) : value ? (Date.parse(value) - Date.now()) / 1000 : 60;
    return Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : 60;
}

function formatFailureMessage(failures: GenerationFailure[], totalRequested: number): string {
    if (failures.length === 0) {
        return '';
    }

    if (failures.length === totalRequested) {
        if (failures.length === 1) {
            return failures[0].error;
        }

        return `Failed to generate all ${totalRequested} images. ${failures[0].error}`;
    }

    const failedImages = failures.map((failure) => `#${failure.index + 1}`).join(', ');
    return `${failures.length} of ${totalRequested} image${failures.length === 1 ? '' : 's'} failed (${failedImages}). ${failures[0].error} Successful images are shown below.`;
}

async function settleGenerationTasks(tasks: Promise<GeneratedImageResult>[]): Promise<SettledGenerationBatch> {
    const settledTasks = await Promise.allSettled(tasks);
    const results: GeneratedImageResult[] = [];
    const failures: GenerationFailure[] = [];
    let usage: ApiUsage | undefined;

    settledTasks.forEach((task, index) => {
        if (task.status === 'fulfilled') {
            results.push(task.value);
            usage = mergeUsage(usage, task.value.usage);
            return;
        }

        if (!(task.reason instanceof Error && task.reason.name === 'AbortError')) {
            console.error(`Image generation failed for index ${index}:`, task.reason);
        }

        failures.push({
            index,
            error: getErrorMessage(task.reason),
            ...(task.reason instanceof OpenAI.APIError
                ? {
                      status: task.reason.status,
                      ...(task.reason.status === 429 ? { retryAfter: getRetryAfter(task.reason) } : {})
                  }
                : {})
        });
    });

    return {
        results: results.toSorted((left, right) => left.index - right.index),
        failures,
        usage
    };
}

async function generateSingleImage({
    index,
    apiClient,
    inputContent,
    imageGenTool,
    timestamp,
    fileExtension,
    effectiveStorageMode,
    signal,
    outputCompression
}: GenerateImageOptions): Promise<GeneratedImageResult> {
    const response = await createImageGenerationResponse({ apiClient, inputContent, imageGenTool, signal });

    const imageOutput = response.output?.find((item) => item.type === 'image_generation_call');

    if (!imageOutput?.result) {
        // Try to extract a text explanation from the model responses
        const textOutput = response.output_text;
        const detail = textOutput ? `: ${textOutput}` : '.';
        throw new Error(`No image was generated${detail}`);
    }

    const filename = `${timestamp}-${index}.${fileExtension}`;
    const savedImage = await persistGeneratedImage(
        filename,
        imageOutput.result,
        fileExtension,
        effectiveStorageMode,
        outputCompression
    );

    return {
        index,
        savedImage,
        usage: (response.usage as ApiUsage | null | undefined) ?? undefined
    };
}

async function generateSingleImageWithPartialStreaming(
    options: GenerateImageOptions & {
        onPartialImage: (payload: { partialImageB64: string; partialImageIndex: number }) => void;
    }
): Promise<GeneratedImageResult> {
    const {
        index,
        apiClient,
        inputContent,
        imageGenTool,
        timestamp,
        fileExtension,
        effectiveStorageMode,
        signal,
        onPartialImage,
        outputCompression
    } = options;

    const response = await apiClient.responses.create(
        {
            model: responseModel,
            instructions: IMAGE_GENERATION_INSTRUCTIONS,
            input: inputContent,
            tools: [imageGenTool],
            tool_choice: IMAGE_GENERATION_TOOL_CHOICE,
            stream: true
        },
        toRequestOptions(signal)
    );

    let finalImageB64: string | undefined;
    let partialImageCount = 0;
    let usage: ApiUsage | undefined;
    let textContent = '';

    for await (const event of response) {
        if (event.type === 'error') {
            throw new Error(event.message);
        }
        if (event.type === 'response.failed' || event.type === 'response.incomplete') {
            throw new Error(event.response.error?.message || `Image response ${event.response.status}.`);
        }
        if (event.type === 'response.image_generation_call.partial_image') {
            const partialB64 = event.partial_image_b64 as string | undefined;
            const partialIndex = event.partial_image_index as number | undefined;

            if (partialB64) {
                onPartialImage({
                    partialImageB64: partialB64,
                    partialImageIndex: partialIndex ?? partialImageCount
                });
                partialImageCount++;
            }
        } else if (event.type === 'response.output_item.done') {
            const item = event.item as { type?: string; result?: string; text?: string } | undefined;
            if (item?.type === 'image_generation_call' && item.result) {
                finalImageB64 = item.result;
            } else if (item?.type === 'message' || item?.text) {
                textContent += item.text ?? '';
            }
        } else if (event.type === 'response.output_text.delta') {
            const delta = event.delta as string | undefined;
            if (delta) textContent += delta;
        } else if (event.type === 'response.completed') {
            const completedResponse = event.response as { usage?: ApiUsage; output_text?: string } | undefined;
            usage = completedResponse?.usage;
            if (!textContent && completedResponse?.output_text) {
                textContent = completedResponse.output_text;
            }
        }
    }

    if (!finalImageB64) {
        const detail = textContent ? `: ${textContent}` : '.';
        throw new Error(`No image was generated${detail}`);
    }

    const filename = `${timestamp}-${index}.${fileExtension}`;
    const savedImage = await persistGeneratedImage(
        filename,
        finalImageB64,
        fileExtension,
        effectiveStorageMode,
        outputCompression
    );

    return {
        index,
        savedImage,
        usage
    };
}

export async function POST(request: NextRequest) {
    console.log('Received POST request to /api/images');

    if (!config.apiKey) {
        console.error('API key is not set.');
        return NextResponse.json({ error: 'Server configuration error: API key not found.' }, { status: 500 });
    }

    try {
        let effectiveStorageMode: 'fs' | 'indexeddb';
        const explicitMode = process.env.NEXT_PUBLIC_IMAGE_STORAGE_MODE;
        const isOnVercel = process.env.VERCEL === '1';

        if (explicitMode === 'fs') {
            effectiveStorageMode = 'fs';
        } else if (explicitMode === 'indexeddb') {
            effectiveStorageMode = 'indexeddb';
        } else if (isOnVercel) {
            effectiveStorageMode = 'indexeddb';
        } else {
            effectiveStorageMode = 'fs';
        }
        console.log(
            `Effective Image Storage Mode: ${effectiveStorageMode} (Explicit: ${explicitMode || 'unset'}, Vercel: ${isOnVercel})`
        );

        if (effectiveStorageMode === 'fs') {
            await ensureOutputDirExists();
        }

        const formData = await request.formData();

        if (process.env.APP_PASSWORD) {
            const clientPasswordHash = formData.get('passwordHash') as string | null;
            if (!clientPasswordHash) {
                return NextResponse.json({ error: 'Unauthorized: Missing password hash.' }, { status: 401 });
            }
            const serverPasswordHash = sha256(process.env.APP_PASSWORD);
            if (clientPasswordHash !== serverPasswordHash) {
                return NextResponse.json({ error: 'Unauthorized: Invalid password.' }, { status: 401 });
            }
        }

        const options = parseImageOptions(formData);
        const { prompt, model, n, size, quality, output_format, background, partialImages, output_compression } =
            options;
        const imageDeployment = useCustomEndpoint ? model : undefined;
        const apiClient = createApiClient(imageDeployment);

        console.log(
            `Image request resolved to model ${model}${imageDeployment ? ` (Azure deployment: ${imageDeployment})` : ''}.`
        );

        const useStreaming = options.stream;
        const usePartialImageStreaming = useStreaming && partialImages > 0;

        // Build the image generation tool with parameters
        const imageGenTool: OpenAI.Responses.Tool = {
            type: 'image_generation',
            ...(!useCustomEndpoint ? { model } : {}),
            size,
            quality: quality === 'auto' ? undefined : quality,
            background: background === 'auto' ? undefined : background,
            output_format: output_format === 'webp' ? 'png' : output_format,
            ...(output_format === 'jpeg' && output_compression !== undefined ? { output_compression } : {}),
            ...(usePartialImageStreaming ? { partial_images: partialImages } : {})
        };

        // Build input: check for optional reference images
        let inputContent: string | OpenAI.Responses.ResponseInputItem[];

        const imageFiles = options.references;

        if (imageFiles.length > 0) {
            // Build multimodal input with reference images + text prompt
            const imageContents: OpenAI.Responses.ResponseInputContent[] = [];
            for (const [index, file] of imageFiles.entries()) {
                imageContents.push({ type: 'input_text', text: `Image ${index + 1}:` });
                const arrayBuffer = await file.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                const mimeType = file.type || 'image/png';
                imageContents.push({
                    type: 'input_image',
                    image_url: `data:${mimeType};base64,${base64}`,
                    detail: 'auto'
                });
            }
            imageContents.push({ type: 'input_text', text: prompt });
            inputContent = [{ role: 'user', content: imageContents }];
        } else {
            inputContent = prompt;
        }

        const timestamp = `${Date.now()}-${crypto.randomUUID()}`;
        const fileExtension = validateOutputFormat(output_format);
        const maxImages = n;
        const retryAfter = imageQuota.reserve(model, n);
        if (retryAfter) {
            return NextResponse.json(
                {
                    error: `This model allows ${IMAGE_REQUESTS_PER_MINUTE} image requests per minute. Wait ${retryAfter} seconds, or choose the other model.`,
                    retryAfter
                },
                { status: 429, headers: { 'Retry-After': String(retryAfter) } }
            );
        }
        const recordQuotaFailures = (batch: SettledGenerationBatch) => {
            const retryAfter = Math.max(0, ...batch.failures.map((failure) => failure.retryAfter ?? 0));
            if (retryAfter) imageQuota.defer(model, retryAfter);
        };

        // Streaming response
        if (useStreaming) {
            console.log(
                usePartialImageStreaming
                    ? `Using model-streamed image mode with partial_images: ${partialImages}`
                    : `Using server-streamed batch mode for ${n} image(s).`
            );

            const encoder = new TextEncoder();
            const clientAbort = request.signal;
            const upstreamController = new AbortController();
            let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
            const stream = new ReadableStream({
                async start(controller) {
                    let closed = false;
                    let clientDisconnected = false;
                    const safeEnqueue = (chunk: Uint8Array) => {
                        if (closed) return;
                        try {
                            controller.enqueue(chunk);
                        } catch {
                            // Controller already closed (e.g. client disconnected)
                            closed = true;
                        }
                    };
                    const safeClose = () => {
                        if (closed) return;
                        closed = true;
                        if (heartbeatInterval) {
                            clearInterval(heartbeatInterval);
                            heartbeatInterval = null;
                        }
                        try {
                            controller.close();
                        } catch {
                            // ignore
                        }
                    };

                    // Send a comment heartbeat every 15s so reverse proxies (nginx, CDN)
                    // don't buffer or close the connection during long generations.
                    heartbeatInterval = setInterval(() => {
                        safeEnqueue(encoder.encode(`: keep-alive ${Date.now()}\n\n`));
                    }, 15000);

                    // Abort upstream call if the browser disconnects.
                    const onClientAbort = () => {
                        clientDisconnected = true;
                        upstreamController.abort();
                        safeClose();
                    };
                    if (clientAbort.aborted) {
                        onClientAbort();
                        return;
                    }
                    clientAbort.addEventListener('abort', onClientAbort, { once: true });

                    try {
                        let generationResults: GeneratedImageResult[];

                        if (usePartialImageStreaming) {
                            const generationTasks = Array.from({ length: maxImages }, (_, index) =>
                                generateSingleImageWithPartialStreaming({
                                    index,
                                    apiClient,
                                    inputContent,
                                    imageGenTool,
                                    timestamp,
                                    fileExtension,
                                    effectiveStorageMode,
                                    outputCompression: output_compression,
                                    signal: upstreamController.signal,
                                    onPartialImage: ({ partialImageB64, partialImageIndex }) => {
                                        if (closed) {
                                            return;
                                        }

                                        safeEnqueue(
                                            encoder.encode(
                                                sseEvent({
                                                    type: 'partial_image',
                                                    index,
                                                    partial_image_index: partialImageIndex,
                                                    b64_json: partialImageB64
                                                })
                                            )
                                        );
                                    }
                                }).then((result) => {
                                    if (!closed) {
                                        safeEnqueue(
                                            encoder.encode(
                                                sseEvent({
                                                    type: 'completed',
                                                    index: result.index,
                                                    ...result.savedImage
                                                })
                                            )
                                        );
                                    }
                                    return result;
                                })
                            );

                            const settledBatch = await settleGenerationTasks(generationTasks);
                            recordQuotaFailures(settledBatch);
                            generationResults = settledBatch.results;

                            if (closed) {
                                return;
                            }

                            const failureMessage = formatFailureMessage(settledBatch.failures, maxImages);
                            const savedImagesData = settledBatch.results.map((result) => result.savedImage);

                            if (savedImagesData.length === 0) {
                                safeEnqueue(
                                    encoder.encode(
                                        sseEvent({
                                            type: 'error',
                                            error: failureMessage || 'No image was generated',
                                            ...(settledBatch.failures.length > 0
                                                ? { failures: settledBatch.failures }
                                                : {})
                                        })
                                    )
                                );
                                safeClose();
                                return;
                            }

                            safeEnqueue(
                                encoder.encode(
                                    sseEvent({
                                        type: 'done',
                                        images: savedImagesData,
                                        usage: settledBatch.usage,
                                        ...(failureMessage
                                            ? { error: failureMessage, failures: settledBatch.failures }
                                            : {})
                                    })
                                )
                            );
                            safeClose();
                            return;
                        } else {
                            const generationTasks = Array.from({ length: maxImages }, (_, index) =>
                                generateSingleImage({
                                    index,
                                    apiClient,
                                    inputContent,
                                    imageGenTool,
                                    timestamp,
                                    fileExtension,
                                    effectiveStorageMode,
                                    outputCompression: output_compression,
                                    signal: upstreamController.signal
                                }).then((result) => {
                                    if (!closed) {
                                        safeEnqueue(
                                            encoder.encode(
                                                sseEvent({
                                                    type: 'completed',
                                                    index: result.index,
                                                    ...result.savedImage
                                                })
                                            )
                                        );
                                    }
                                    return result;
                                })
                            );

                            const settledBatch = await settleGenerationTasks(generationTasks);
                            recordQuotaFailures(settledBatch);
                            generationResults = settledBatch.results;

                            if (closed) {
                                return;
                            }

                            const failureMessage = formatFailureMessage(settledBatch.failures, maxImages);
                            const savedImagesData = settledBatch.results.map((result) => result.savedImage);

                            if (savedImagesData.length === 0) {
                                safeEnqueue(
                                    encoder.encode(
                                        sseEvent({
                                            type: 'error',
                                            error: failureMessage || 'No image was generated',
                                            ...(settledBatch.failures.length > 0
                                                ? { failures: settledBatch.failures }
                                                : {})
                                        })
                                    )
                                );
                                safeClose();
                                return;
                            }

                            safeEnqueue(
                                encoder.encode(
                                    sseEvent({
                                        type: 'done',
                                        images: savedImagesData,
                                        usage: settledBatch.usage,
                                        ...(failureMessage
                                            ? { error: failureMessage, failures: settledBatch.failures }
                                            : {})
                                    })
                                )
                            );
                            safeClose();
                            return;
                        }
                    } catch (error) {
                        // Suppress noise from intentional client-disconnect aborts.
                        const isAbort = clientDisconnected || (error instanceof Error && error.name === 'AbortError');
                        if (!isAbort) {
                            console.error('Streaming error:', error);
                            safeEnqueue(
                                encoder.encode(
                                    sseEvent({
                                        type: 'error',
                                        error: error instanceof Error ? error.message : 'Unknown streaming error'
                                    })
                                )
                            );
                        }
                        safeClose();
                    } finally {
                        clientAbort.removeEventListener('abort', onClientAbort);
                    }
                },
                cancel() {
                    upstreamController.abort();
                    if (heartbeatInterval) {
                        clearInterval(heartbeatInterval);
                        heartbeatInterval = null;
                    }
                }
            });

            return new Response(stream, {
                headers: {
                    'Content-Type': 'text/event-stream; charset=utf-8',
                    'Cache-Control': 'no-cache, no-transform',
                    Connection: 'keep-alive',
                    // Disable proxy buffering (nginx, Vercel, etc.) so SSE events flush immediately.
                    'X-Accel-Buffering': 'no'
                }
            });
        }

        // Non-streaming response
        const settledBatch = await settleGenerationTasks(
            Array.from({ length: maxImages }, (_, index) =>
                generateSingleImage({
                    index,
                    apiClient,
                    inputContent,
                    imageGenTool,
                    timestamp,
                    fileExtension,
                    effectiveStorageMode,
                    outputCompression: output_compression,
                    signal: request.signal
                })
            )
        );
        recordQuotaFailures(settledBatch);

        const savedImagesData = settledBatch.results.map((result) => result.savedImage);
        const failureMessage = formatFailureMessage(settledBatch.failures, maxImages);

        if (savedImagesData.length === 0) {
            return NextResponse.json(
                {
                    error: failureMessage || 'Failed to generate any images.',
                    ...(settledBatch.failures.length > 0 ? { failures: settledBatch.failures } : {})
                },
                {
                    status: settledBatch.failures.every((failure) => failure.status === 429) ? 429 : 502,
                    ...(settledBatch.failures.some((failure) => failure.retryAfter)
                        ? {
                              headers: {
                                  'Retry-After': String(
                                      Math.max(...settledBatch.failures.map((failure) => failure.retryAfter ?? 0))
                                  )
                              }
                          }
                        : {})
                }
            );
        }

        return NextResponse.json({
            images: savedImagesData,
            usage: settledBatch.usage,
            ...(failureMessage ? { error: failureMessage, failures: settledBatch.failures } : {})
        });
    } catch (error: unknown) {
        console.error('Error in /api/images:', error);

        let errorMessage = 'An unexpected error occurred.';
        let status = error instanceof ImageInputError ? 400 : 500;

        if (error instanceof Error) {
            errorMessage = error.message;
            if (typeof (error as { status?: number }).status === 'number') {
                status = (error as { status?: number }).status as number;
            }
        }

        return NextResponse.json({ error: errorMessage }, { status });
    }
}

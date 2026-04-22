import { GPT_IMAGE_MODELS, isGptImageModel, type GptImageModel } from '@/lib/cost-utils';
import crypto from 'crypto';
import fs from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import path from 'path';

type StreamingEvent = {
    type: 'partial_image' | 'completed' | 'error' | 'done';
    index?: number;
    partial_image_index?: number;
    b64_json?: string;
    filename?: string;
    path?: string;
    output_format?: string;
    usage?: ApiUsage;
    images?: Array<{
        filename: string;
        b64_json: string;
        path?: string;
        output_format: string;
    }>;
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
    baseURL: process.env.AZURE_OPENAI_ENDPOINT || process.env.OPENAI_API_BASE_URL,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME
};

const useCustomEndpoint = Boolean(process.env.AZURE_OPENAI_ENDPOINT);

const outputDir = path.resolve(process.cwd(), 'generated-images');

const VALID_OUTPUT_FORMATS = ['png', 'jpeg', 'webp'] as const;
type ValidOutputFormat = (typeof VALID_OUTPUT_FORMATS)[number];

function parseRequestedModel(value: FormDataEntryValue | null): GptImageModel | null {
    return isGptImageModel(value) ? value : null;
}

function resolveAzureImageDeployment(requestedModel: GptImageModel): string | undefined {
    const configuredDeployment = config.deployment?.trim();

    if (!configuredDeployment) {
        return requestedModel;
    }

    if (isGptImageModel(configuredDeployment)) {
        return requestedModel;
    }

    return configuredDeployment;
}

function createApiClient(imageDeployment?: string) {
    const defaultHeaders = useCustomEndpoint
        ? {
              'api-key': config.apiKey!,
              ...(imageDeployment ? { 'x-ms-oai-image-generation-deployment': imageDeployment } : {}),
              api_version: 'preview'
          }
        : undefined;

    return new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        defaultHeaders
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

// Helper to send SSE event
function sseEvent(event: StreamingEvent): string {
    return `data: ${JSON.stringify(event)}\n\n`;
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

        const mode = formData.get('mode') as 'generate' | 'edit' | null;
        const prompt = formData.get('prompt') as string | null;
        const model = parseRequestedModel(formData.get('model'));

        if (!mode || !prompt) {
            return NextResponse.json({ error: 'Missing required parameters: mode and prompt' }, { status: 400 });
        }

        if (!model) {
            return NextResponse.json(
                { error: `Missing or invalid model. Expected one of: ${GPT_IMAGE_MODELS.join(', ')}` },
                { status: 400 }
            );
        }

        const imageDeployment = useCustomEndpoint ? resolveAzureImageDeployment(model) : undefined;
        const apiClient = createApiClient(imageDeployment);

        console.log(
            `Image request resolved to model ${model}${imageDeployment ? ` (Azure deployment: ${imageDeployment})` : ''}.`
        );

        const n = parseInt((formData.get('n') as string) || '1', 10);
        const size = (formData.get('size') as string) || '1024x1024';
        const quality = (formData.get('quality') as 'auto' | 'low' | 'medium' | 'high') || 'auto';
        const output_format = (formData.get('output_format') as 'png' | 'jpeg' | 'webp') || 'png';
        const background = (formData.get('background') as 'auto' | 'opaque' | 'transparent') || 'auto';
        const effectiveBackground = model === 'gpt-image-2' ? 'auto' : background;
        const partialImages = parseInt((formData.get('partial_images') as string) || '0', 10);
        const useStreaming = partialImages > 0 && n === 1;

        // Build the image generation tool with parameters
        const imageGenTool = {
            type: 'image_generation',
            model,
            size,
            quality: quality === 'auto' ? undefined : quality,
            background: effectiveBackground === 'auto' ? undefined : effectiveBackground,
            output_format,
            ...(useStreaming ? { partial_images: partialImages } : {})
        } as OpenAI.Responses.Tool;

        // For edit mode, we need to include the image(s) in the input
        let inputContent: string | OpenAI.Responses.ResponseInputItem[];

        if (mode === 'edit') {
            const imageFiles: File[] = [];
            for (const [key, value] of formData.entries()) {
                if (key.startsWith('image_') && value instanceof File) {
                    imageFiles.push(value);
                }
            }

            if (imageFiles.length === 0) {
                return NextResponse.json({ error: 'No image file provided for editing.' }, { status: 400 });
            }

            // Convert images to base64 data URLs
            const imageContents: OpenAI.Responses.ResponseInputContent[] = [];
            for (const file of imageFiles) {
                const arrayBuffer = await file.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                const mimeType = file.type || 'image/png';
                imageContents.push({
                    type: 'input_image',
                    image_url: `data:${mimeType};base64,${base64}`,
                    detail: 'auto'
                });
            }

            // Include mask image if provided
            const maskFile = formData.get('mask');
            if (maskFile instanceof File) {
                const maskBuffer = await maskFile.arrayBuffer();
                const maskBase64 = Buffer.from(maskBuffer).toString('base64');
                imageContents.push({
                    type: 'input_image',
                    image_url: `data:image/png;base64,${maskBase64}`,
                    detail: 'auto'
                });
            }

            imageContents.push({ type: 'input_text', text: prompt });
            inputContent = [{ role: 'user', content: imageContents }];
        } else {
            inputContent = prompt;
        }

        const timestamp = Date.now();
        const fileExtension = validateOutputFormat(output_format);

        // Streaming response
        if (useStreaming) {
            console.log('Using streaming mode with partial_images:', partialImages);

            const encoder = new TextEncoder();
            const clientAbort = request.signal;
            let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
            const stream = new ReadableStream({
                async start(controller) {
                    let closed = false;
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
                    const upstreamController = new AbortController();
                    const onClientAbort = () => {
                        upstreamController.abort();
                        safeClose();
                    };
                    if (clientAbort.aborted) {
                        onClientAbort();
                        return;
                    }
                    clientAbort.addEventListener('abort', onClientAbort, { once: true });

                    try {
                        const response = await apiClient.responses.create(
                            {
                                model: 'gpt-5.3-chat',
                                input: inputContent,
                                tools: [imageGenTool],
                                stream: true
                            },
                            { signal: upstreamController.signal }
                        );

                        let finalImageB64: string | undefined;
                        let partialImageCount = 0;
                        let usage: ApiUsage | undefined;

                        // Process stream events
                        for await (const event of response as AsyncIterable<{ type: string; [key: string]: unknown }>) {
                            if (closed) break;
                            if (event.type === 'response.image_generation_call.partial_image') {
                                // Partial image event
                                const partialB64 = event.partial_image_b64 as string | undefined;
                                const partialIndex = event.partial_image_index as number | undefined;
                                if (partialB64) {
                                    safeEnqueue(
                                        encoder.encode(
                                            sseEvent({
                                                type: 'partial_image',
                                                index: 0,
                                                partial_image_index: partialIndex ?? partialImageCount,
                                                b64_json: partialB64
                                            })
                                        )
                                    );
                                    partialImageCount++;
                                }
                            } else if (event.type === 'response.output_item.done') {
                                // Check if this is the final image
                                const item = event.item as { type?: string; result?: string } | undefined;
                                if (item?.type === 'image_generation_call' && item.result) {
                                    finalImageB64 = item.result;
                                }
                            } else if (event.type === 'response.completed' || event.type === 'response.done') {
                                // Extract usage from completed response
                                const completedResponse = event.response as { usage?: ApiUsage } | undefined;
                                usage = completedResponse?.usage;
                            }
                        }

                        if (closed) {
                            return;
                        }

                        // Save final image and send done event
                        if (finalImageB64) {
                            const filename = `${timestamp}-0.${fileExtension}`;

                            if (effectiveStorageMode === 'fs') {
                                const buffer = Buffer.from(finalImageB64, 'base64');
                                const filepath = path.join(outputDir, filename);
                                await fs.writeFile(filepath, buffer);
                            }

                            safeEnqueue(
                                encoder.encode(
                                    sseEvent({
                                        type: 'completed',
                                        index: 0,
                                        filename,
                                        output_format: fileExtension
                                    })
                                )
                            );

                            safeEnqueue(
                                encoder.encode(
                                    sseEvent({
                                        type: 'done',
                                        images: [
                                            {
                                                filename,
                                                b64_json: finalImageB64,
                                                output_format: fileExtension,
                                                ...(effectiveStorageMode === 'fs'
                                                    ? { path: `/api/image/${filename}` }
                                                    : {})
                                            }
                                        ],
                                        usage
                                    })
                                )
                            );
                        } else {
                            safeEnqueue(
                                encoder.encode(
                                    sseEvent({
                                        type: 'error',
                                        error: 'No image was generated'
                                    })
                                )
                            );
                        }

                        safeClose();
                    } catch (error) {
                        // Suppress noise from intentional client-disconnect aborts.
                        const isAbort =
                            (error instanceof Error && error.name === 'AbortError') ||
                            upstreamController.signal.aborted;
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
        const savedImagesData: Array<{
            filename: string;
            b64_json: string;
            path?: string;
            output_format: string;
        }> = [];
        let aggregatedUsage: ApiUsage | undefined;

        // Generate n images (Responses API generates one at a time)
        for (let i = 0; i < Math.min(n, 5); i++) {
            const response = await apiClient.responses.create({
                model: 'gpt-5.3-chat',
                input: inputContent,
                tools: [imageGenTool]
            });
            aggregatedUsage = mergeUsage(aggregatedUsage, (response.usage as ApiUsage | null | undefined) ?? undefined);

            // Extract image from response
            const imageOutput = response.output?.find((item) => item.type === 'image_generation_call') as
                | { type: 'image_generation_call'; result?: string }
                | undefined;

            if (imageOutput?.result) {
                const filename = `${timestamp}-${i}.${fileExtension}`;
                const b64_json = imageOutput.result;

                if (effectiveStorageMode === 'fs') {
                    const buffer = Buffer.from(b64_json, 'base64');
                    const filepath = path.join(outputDir, filename);
                    await fs.writeFile(filepath, buffer);
                }

                savedImagesData.push({
                    filename,
                    b64_json,
                    output_format: fileExtension,
                    ...(effectiveStorageMode === 'fs' ? { path: `/api/image/${filename}` } : {})
                });
            }
        }

        if (savedImagesData.length === 0) {
            return NextResponse.json({ error: 'Failed to generate any images.' }, { status: 500 });
        }

        return NextResponse.json({ images: savedImagesData, usage: aggregatedUsage });
    } catch (error: unknown) {
        console.error('Error in /api/images:', error);

        let errorMessage = 'An unexpected error occurred.';
        let status = 500;

        if (error instanceof Error) {
            errorMessage = error.message;
            if (typeof (error as { status?: number }).status === 'number') {
                status = (error as { status?: number }).status as number;
            }
        }

        return NextResponse.json({ error: errorMessage }, { status });
    }
}

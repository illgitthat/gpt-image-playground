import crypto from 'crypto';
import fs from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import sharp from 'sharp';

const outputDir = path.resolve(/* turbopackIgnore: true */ process.cwd(), 'generated-images');

const config = {
    apiKey: process.env.AZURE_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.AZURE_OPENAI_ENDPOINT || process.env.OPENAI_API_BASE_URL
};

const soraModel = process.env.AZURE_OPENAI_SORA_MODEL || 'sora-2';
const validSizes = new Set(['1280x720', '720x1280']);

function parseSize(size: string): { width: number; height: number } {
    const [w, h] = size.split('x').map((v) => parseInt(v, 10));
    if (!w || !h) {
        throw new Error('Invalid size format. Expected WIDTHxHEIGHT.');
    }
    return { width: w, height: h };
}

function sha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
}

async function ensureOutputDirExists() {
    try {
        await fs.access(outputDir);
    } catch (error: unknown) {
        const isENOENT = typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT';
        if (isENOENT) {
            await fs.mkdir(outputDir, { recursive: true });
            console.log(`Created output directory: ${outputDir}`);
        } else {
            console.error(`Error accessing output directory ${outputDir}:`, error);
            throw new Error('Failed to access output directory');
        }
    }
}

function getBaseUrl(): string {
    const endpoint = config.baseURL?.replace(/\/$/, '');
    if (!endpoint) {
        throw new Error('API endpoint is not configured.');
    }
    return endpoint;
}

async function fetchVideoStatus(jobId: string) {
    const baseUrl = getBaseUrl();
    const statusUrl = `${baseUrl}/videos/${jobId}`;

    const statusResp = await fetch(statusUrl, {
        method: 'GET',
        headers: {
            'api-key': config.apiKey || ''
        }
    });

    if (!statusResp.ok) {
        const errorText = await statusResp.text().catch(() => '');
        throw new Error(`Failed to poll video status: ${statusResp.status} ${statusResp.statusText} ${errorText}`);
    }

    return statusResp.json();
}

async function downloadVideo(jobId: string, baseUrl: string) {
    const downloadUrl = `${baseUrl}/videos/${jobId}/content?variant=video`;
    const downloadResp = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
            'api-key': config.apiKey || '',
            Accept: 'application/octet-stream'
        }
    });

    if (!downloadResp.ok) {
        const errorData = await downloadResp.text().catch(() => '');
        throw new Error(`Failed to download video content: ${downloadResp.status} ${downloadResp.statusText} ${errorData}`);
    }

    const arrayBuffer = await downloadResp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await ensureOutputDirExists();

    const filename = `${jobId}-sora.mp4`;
    const filepath = path.join(outputDir, filename);
    await fs.writeFile(filepath, buffer);

    return { filename, path: `/api/image/${filename}` };
}

export async function POST(request: NextRequest) {
    if (!config.apiKey || !config.baseURL) {
        console.error('API credentials are missing for Sora video generation.');
        return NextResponse.json({ error: 'Server configuration error: API credentials are incomplete.' }, { status: 500 });
    }

    try {
        await ensureOutputDirExists();

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

        const prompt = (formData.get('prompt') as string | null)?.trim();
        const size = (formData.get('size') as string | null) || '1280x720';
        const secondsInput = parseInt((formData.get('seconds') as string) || '8', 10);
        const allowedSeconds = [4, 8, 12];
        const seconds = allowedSeconds.includes(secondsInput)
            ? secondsInput
            : allowedSeconds.reduce((prev, curr) => (Math.abs(curr - secondsInput) < Math.abs(prev - secondsInput) ? curr : prev), 8);
        const referenceImage = formData.get('reference_image');
        const hasReferenceImage = referenceImage instanceof File && referenceImage.size > 0;

        if (!prompt) {
            return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
        }

        if (!validSizes.has(size)) {
            return NextResponse.json({ error: 'Invalid size. Supported sizes are 1280x720 and 720x1280.' }, { status: 400 });
        }

        if (referenceImage && !(referenceImage instanceof File)) {
            return NextResponse.json({ error: 'Invalid reference image payload.' }, { status: 400 });
        }

        const baseUrl = getBaseUrl();
        const createUrl = `${baseUrl}/videos`;

        const { width, height } = parseSize(size);
        let resizedFile: File | null = null;

        if (hasReferenceImage) {
            const refArrayBuffer = await (referenceImage as File).arrayBuffer();
            const refBuffer = Buffer.from(refArrayBuffer);

            const resizedBuffer = await sharp(refBuffer)
                .resize(width, height, { fit: 'cover', position: 'center' })
                .png()
                .toBuffer();

            resizedFile = new File([new Uint8Array(resizedBuffer)], 'reference.png', { type: 'image/png' });
        }

        const requestForm = new FormData();
        requestForm.append('model', soraModel);
        requestForm.append('prompt', prompt);
        requestForm.append('size', size);
        requestForm.append('seconds', seconds.toString());
        if (resizedFile) {
            requestForm.append('input_reference', resizedFile, resizedFile.name);
        }

        const createResp = await fetch(createUrl, {
            method: 'POST',
            headers: {
                'api-key': config.apiKey || ''
            },
            body: requestForm
        });

        if (!createResp.ok) {
            const errorData = await createResp.text().catch(() => '');
            console.error('Video creation error:', errorData);
            return NextResponse.json(
                { error: `Video creation failed: ${createResp.status} ${createResp.statusText}` },
                { status: createResp.status }
            );
        }

        const creationJson = await createResp.json();
        const jobId = creationJson.id as string | undefined;

        if (!jobId) {
            return NextResponse.json({ error: 'Video creation did not return a job id.' }, { status: 500 });
        }

        return NextResponse.json({
            jobId,
            status: 'running'
        });
    } catch (error: unknown) {
        console.error('Error in /api/video:', error);
        const message = error instanceof Error ? error.message : 'Unexpected server error.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    if (!config.apiKey || !config.baseURL) {
        console.error('API credentials are missing for Sora video polling.');
        return NextResponse.json({ error: 'Server configuration error: API credentials are incomplete.' }, { status: 500 });
    }

    const jobId = request.nextUrl.searchParams.get('jobId');

    if (!jobId) {
        return NextResponse.json({ error: 'jobId is required.' }, { status: 400 });
    }

    try {
        const baseUrl = getBaseUrl();

        const statusJson = await fetchVideoStatus(jobId);
        const status = (statusJson.status as string | undefined)?.toLowerCase();

        if (!status || status === 'queued' || status === 'in_progress' || status === 'running' || status === 'notstarted' || status === 'processing') {
            return NextResponse.json({ status: status || 'queued' });
        }

        if (status === 'succeeded' || status === 'completed') {
            try {
                await ensureOutputDirExists();
                const filename = `${jobId}-sora.mp4`;
                const filepath = path.join(outputDir, filename);

                let alreadyExists = false;
                try {
                    await fs.access(filepath);
                    alreadyExists = true;
                } catch {
                    alreadyExists = false;
                }

                if (!alreadyExists) {
                    await downloadVideo(jobId, baseUrl);
                }

                return NextResponse.json({
                    status: 'succeeded',
                    videos: [{ filename, path: `/api/image/${filename}` }],
                    model: soraModel
                });
            } catch (downloadError: unknown) {
                console.error('Error downloading completed video:', downloadError);
                const message = downloadError instanceof Error ? downloadError.message : 'Failed to download completed video.';
                return NextResponse.json({ error: message }, { status: 500 });
            }
        }

        const failureReason = (statusJson.error && statusJson.error.message) || 'Video generation did not complete successfully.';
        return NextResponse.json({ status, error: failureReason }, { status: 500 });
    } catch (error: unknown) {
        console.error('Error polling /api/video status:', error);
        const message = error instanceof Error ? error.message : 'Unexpected server error while polling video.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

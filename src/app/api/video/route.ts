import { clientInfo, limitKeyForIp, logVideoGeneration, type VideoGenerationLogEntry } from '@/lib/generation-log';
import { ipLimiter } from '@/lib/ip-limit';
import {
    aspectRatioForSize,
    cancelVideo,
    DEFAULT_MOTION_PROMPT,
    downloadVideo,
    estimateVideoCost,
    isVideoJobId,
    MAX_VIDEO_PROMPT_LENGTH,
    posterFilename,
    submitVideo,
    VideoApiError,
    videoConfig,
    videoFilename,
    videoStatus
} from '@/lib/video';
import crypto from 'crypto';
import fs from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import sharp from 'sharp';

const outputDir = path.resolve(/* turbopackIgnore: true */ process.cwd(), 'generated-images');
const MAX_START_IMAGE_BYTES = 25 * 1024 * 1024;
// Longest side of the first frame sent to the model.
const START_IMAGE_MAX_SIDE = 1280;

function passwordError(hash: string | null): NextResponse | null {
    if (!process.env.APP_PASSWORD) return null;
    const expected = crypto.createHash('sha256').update(process.env.APP_PASSWORD).digest('hex');
    if (hash === expected) return null;
    return NextResponse.json(
        { error: hash ? 'Unauthorized: Invalid password.' : 'Unauthorized: Missing password hash.' },
        { status: 401 }
    );
}

const notConfigured = () => NextResponse.json({ error: 'Video is not set up on this server.' }, { status: 503 });

async function exists(filepath: string): Promise<boolean> {
    return fs.access(filepath).then(
        () => true,
        () => false
    );
}

function errorResponse(error: unknown, fallback: string) {
    if (error instanceof VideoApiError) {
        const status = error.status === 429 ? 429 : error.status >= 400 && error.status < 500 ? 400 : 502;
        const message =
            error.status === 429 ? 'The video model is busy. Wait a minute, then try again.' : error.message;
        return { message, response: NextResponse.json({ error: message }, { status }) };
    }
    console.error('Error in /api/video:', error);
    return { message: fallback, response: NextResponse.json({ error: fallback }, { status: 500 }) };
}

// Starts a video. Returns a job id for the client to poll.
export async function POST(request: NextRequest) {
    const config = videoConfig();
    if (!config) return notConfigured();

    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }
    const denied = passwordError(form.get('passwordHash') as string | null);
    if (denied) return denied;

    const image = form.get('image');
    const hasImage = image instanceof File && image.size > 0;
    const typed = ((form.get('prompt') as string | null) ?? '').trim();
    const prompt = typed || (hasImage ? DEFAULT_MOTION_PROMPT : '');
    const client = clientInfo(request.headers);
    const log = (status: VideoGenerationLogEntry['status'], extra: Partial<VideoGenerationLogEntry> = {}) =>
        logVideoGeneration({
            time: new Date().toISOString(),
            kind: 'video',
            status,
            model: config.model,
            prompt,
            seconds: config.seconds,
            resolution: config.resolution,
            references: hasImage ? 1 : 0,
            files: [],
            estimated_cost_usd: 0,
            ...client,
            ...extra
        });

    if (!prompt) return NextResponse.json({ error: 'Describe the video you want.' }, { status: 400 });
    if (prompt.length > MAX_VIDEO_PROMPT_LENGTH) {
        return NextResponse.json(
            { error: `Keep the prompt under ${MAX_VIDEO_PROMPT_LENGTH} characters.` },
            { status: 400 }
        );
    }
    if (hasImage && image.size > MAX_START_IMAGE_BYTES) {
        return NextResponse.json({ error: 'That image is too large to animate.' }, { status: 400 });
    }

    let frame: Buffer | null = null;
    if (hasImage) {
        try {
            frame = await sharp(Buffer.from(await image.arrayBuffer()))
                .rotate()
                .resize({
                    width: START_IMAGE_MAX_SIDE,
                    height: START_IMAGE_MAX_SIDE,
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .flatten({ background: '#ffffff' })
                .jpeg({ quality: 90 })
                .toBuffer();
        } catch {
            return NextResponse.json({ error: 'That image could not be read.' }, { status: 400 });
        }
    }

    const ipLimit = ipLimiter.take('video', limitKeyForIp(client.ip));
    if (!ipLimit.allowed) {
        await log('rate_limited', { error: ipLimit.message });
        return NextResponse.json(
            { error: ipLimit.message, retryAfter: ipLimit.retryAfter },
            { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfter) } }
        );
    }

    try {
        const jobId = await submitVideo(config, {
            prompt,
            imageDataUri: frame ? `data:image/jpeg;base64,${frame.toString('base64')}` : undefined,
            aspectRatio: aspectRatioForSize(form.get('size') as string | null)
        });
        if (frame) {
            // A small still for the gallery, since the server has no way to grab a video frame.
            await fs.mkdir(outputDir, { recursive: true });
            await sharp(frame)
                .resize({ width: 480, height: 480, fit: 'inside' })
                .webp({ quality: 80 })
                .toFile(path.join(outputDir, posterFilename(jobId)))
                .catch((error) => console.error('Could not save video poster:', error));
        }
        await log('ok', {
            files: [videoFilename(jobId)],
            estimated_cost_usd: estimateVideoCost(config.seconds, config.resolution)
        });
        return NextResponse.json({ jobId, seconds: config.seconds });
    } catch (error) {
        const { message, response } = errorResponse(error, 'The video could not be started.');
        await log('error', { error: message });
        return response;
    }
}

// Reports progress; once the video is finished it is saved here and its filename returned.
export async function GET(request: NextRequest) {
    const config = videoConfig();
    if (!config) return notConfigured();
    const denied = passwordError(request.headers.get('x-password-hash'));
    if (denied) return denied;
    const jobId = request.nextUrl.searchParams.get('jobId');
    if (!isVideoJobId(jobId)) return NextResponse.json({ error: 'A valid jobId is required.' }, { status: 400 });

    const filename = videoFilename(jobId);
    const filepath = path.join(outputDir, filename);
    const done = async () =>
        NextResponse.json({
            status: 'completed',
            filename,
            poster: (await exists(path.join(outputDir, posterFilename(jobId)))) ? posterFilename(jobId) : null,
            model: config.model,
            seconds: config.seconds
        });

    try {
        if (await exists(filepath)) return done();
        const status = await videoStatus(config, jobId);
        if (status !== 'completed') return NextResponse.json({ status });
        const video = await downloadVideo(config, jobId);
        await fs.mkdir(outputDir, { recursive: true });
        // Write under a temporary name so a half-written file is never served.
        const temporary = `${filepath}.${crypto.randomUUID()}.part`;
        await fs.writeFile(temporary, video);
        await fs.rename(temporary, filepath);
        return done();
    } catch (error) {
        return errorResponse(error, 'The video could not be made.').response;
    }
}

// Cancels a job the user gave up on.
export async function DELETE(request: NextRequest) {
    const config = videoConfig();
    if (!config) return notConfigured();
    const denied = passwordError(request.headers.get('x-password-hash'));
    if (denied) return denied;
    const jobId = request.nextUrl.searchParams.get('jobId');
    if (!isVideoJobId(jobId)) return NextResponse.json({ error: 'A valid jobId is required.' }, { status: 400 });
    await cancelVideo(config, jobId);
    return NextResponse.json({ cancelled: true });
}

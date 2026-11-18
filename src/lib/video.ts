// Video generation through fal models on Microsoft Foundry (MiniMax H3 Max Turbo by default).
// The API is a queue: submit a request, poll its status, then fetch the result and download the file.

export const VIDEO_RESOLUTIONS = ['480P', '768P', '1080P'] as const;
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];

// USD per second of video for MiniMax H3 Max Turbo on Foundry (November 2026 preview pricing).
const PRICE_PER_SECOND: Record<VideoResolution, number> = { '480P': 0.025, '768P': 0.04, '1080P': 0.08 };
// Clips run a little longer than requested.
const EXTRA_SECONDS = 0.7;

const DEFAULT_MODEL = 'Fal-MiniMax-H3-Max-Turbo';
const DEFAULT_SECONDS = 5;
const DEFAULT_RESOLUTION: VideoResolution = '768P';
// Used when someone animates an image without saying how.
export const DEFAULT_MOTION_PROMPT = 'Bring this image to life with natural, gentle motion and a slow camera move.';
export const MAX_VIDEO_PROMPT_LENGTH = 2500;

export type VideoConfig = {
    // Base URL of one model, e.g. https://gateway/resource/providers/falai/v1/minimax/h3-max-turbo
    endpoint: string;
    apiKey: string;
    model: string;
    seconds: number;
    resolution: VideoResolution;
};

// Null when video is not configured; the UI then hides it.
export function videoConfig(env: NodeJS.ProcessEnv = process.env): VideoConfig | null {
    const endpoint = env.VIDEO_ENDPOINT?.trim().replace(/\/+$/, '');
    const apiKey = env.VIDEO_API_KEY || env.AZURE_OPENAI_API_KEY || env.OPENAI_API_KEY;
    if (!endpoint || !apiKey) return null;
    const seconds = Number(env.VIDEO_SECONDS);
    const resolution = env.VIDEO_RESOLUTION?.trim().toUpperCase() as VideoResolution | undefined;
    return {
        endpoint,
        apiKey,
        model: env.VIDEO_MODEL?.trim() || DEFAULT_MODEL,
        seconds: Number.isFinite(seconds) && seconds >= 1 && seconds <= 15 ? seconds : DEFAULT_SECONDS,
        resolution: resolution && VIDEO_RESOLUTIONS.includes(resolution) ? resolution : DEFAULT_RESOLUTION
    };
}

export function estimateVideoCost(seconds: number, resolution: VideoResolution): number {
    return Math.round((seconds + EXTRA_SECONDS) * PRICE_PER_SECOND[resolution] * 100) / 100;
}

// Image sizes from the prompt bar, mapped to the video shapes the model accepts.
const ASPECT_FOR_SIZE: Record<string, string> = {
    '1024x1024': '1:1',
    '1536x1024': '16:9',
    '1024x1536': '9:16'
};

export function aspectRatioForSize(size: string | null | undefined): string {
    return (size && ASPECT_FOR_SIZE[size]) || '16:9';
}

export function isVideoJobId(value: unknown): value is string {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function videoFilename(jobId: string): string {
    return `${jobId}-video.mp4`;
}

export function posterFilename(jobId: string): string {
    return `${jobId}-video-poster.webp`;
}

// Results point at the model host directly. Keep only the asset path and fetch it through
// our own endpoint, so the gateway key works and we never call a URL the response chose.
export function assetUrl(endpoint: string, resultUrl: string): string | null {
    const marker = '/providers/falai/v1/';
    const rootEnd = endpoint.indexOf(marker);
    const assetStart = resultUrl.indexOf(marker);
    if (rootEnd < 0 || assetStart < 0) return null;
    const assetPath = resultUrl.slice(assetStart + marker.length);
    if (!/^assets\/[\w-]+\/[\w-]+$/.test(assetPath)) return null;
    return `${endpoint.slice(0, rootEnd + marker.length)}${assetPath}`;
}

// Validation and moderation errors arrive as { detail: string | [{ msg }] }, sometimes JSON inside a string.
export function videoErrorMessage(body: unknown, fallback: string): string {
    let detail: unknown = body;
    if (typeof body === 'string') {
        try {
            detail = JSON.parse(body);
        } catch {
            return body.trim().slice(0, 300) || fallback;
        }
        // A plain JSON string is the message itself.
        if (typeof detail === 'string') return detail.trim().slice(0, 300) || fallback;
    }
    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
        const record = detail as Record<string, unknown>;
        const inner = record.detail ?? record.error ?? record.message;
        if (inner !== undefined) return videoErrorMessage(inner, fallback);
        return fallback;
    }
    if (Array.isArray(detail)) {
        const messages = detail
            .map((item) => (item && typeof item === 'object' ? (item as { msg?: unknown }).msg : item))
            .filter((message): message is string => typeof message === 'string' && message.length > 0);
        return messages.join(' ').slice(0, 300) || fallback;
    }
    return fallback;
}

export type VideoRequest = {
    prompt: string;
    // JPEG or PNG data URI of the first frame; the video then takes the image's shape.
    imageDataUri?: string;
    // Only used without an image.
    aspectRatio?: string;
};

export type VideoStatus = 'queued' | 'running' | 'completed';

async function call(config: VideoConfig, path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${config.endpoint}${path}`, {
        ...init,
        headers: { 'api-key': config.apiKey, ...init.headers },
        signal: init.signal ?? AbortSignal.timeout(60_000)
    });
}

export class VideoApiError extends Error {
    constructor(
        message: string,
        readonly status: number
    ) {
        super(message);
    }
}

async function failure(response: Response, fallback: string): Promise<VideoApiError> {
    const text = await response.text().catch(() => '');
    return new VideoApiError(videoErrorMessage(text, `${fallback} (${response.status}).`), response.status);
}

export async function submitVideo(config: VideoConfig, request: VideoRequest): Promise<string> {
    const body: Record<string, unknown> = {
        model: config.model,
        prompt: request.prompt,
        duration: config.seconds,
        resolution: config.resolution,
        // "balanced" lets the model flesh out short prompts; it adds about a second.
        prompt_expansion_mode: 'balanced'
    };
    if (request.imageDataUri) body.image_url = request.imageDataUri;
    else if (request.aspectRatio) body.aspect_ratio = request.aspectRatio;

    const response = await call(config, request.imageDataUri ? '/image-to-video' : '/text-to-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!response.ok) throw await failure(response, 'The video could not be started');
    const json = (await response.json()) as { request_id?: unknown };
    if (!isVideoJobId(json.request_id)) throw new VideoApiError('The video service did not return a job id.', 502);
    return json.request_id;
}

export async function videoStatus(config: VideoConfig, jobId: string): Promise<VideoStatus> {
    const response = await call(config, `/requests/${jobId}/status`);
    if (!response.ok) throw await failure(response, 'Could not check on the video');
    const { status } = (await response.json()) as { status?: string };
    if (status === 'COMPLETED') return 'completed';
    return status === 'IN_PROGRESS' ? 'running' : 'queued';
}

// A finished job either has a video or failed (for example, blocked by the safety checker).
export async function downloadVideo(config: VideoConfig, jobId: string): Promise<Buffer> {
    const result = await call(config, `/requests/${jobId}`);
    if (!result.ok) throw await failure(result, 'The video could not be made');
    const json = (await result.json()) as { video?: { url?: unknown } };
    const url = typeof json.video?.url === 'string' ? assetUrl(config.endpoint, json.video.url) : null;
    if (!url) throw new VideoApiError('The video service returned no video.', 502);
    const file = await fetch(url, { headers: { 'api-key': config.apiKey }, signal: AbortSignal.timeout(120_000) });
    if (!file.ok) throw await failure(file, 'The finished video could not be downloaded');
    return Buffer.from(await file.arrayBuffer());
}

// Best effort; a job that already started may still finish and be billed.
export async function cancelVideo(config: VideoConfig, jobId: string): Promise<void> {
    await call(config, `/requests/${jobId}/cancel`, { method: 'PUT' }).catch(() => undefined);
}

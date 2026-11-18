// Browser side of video generation: start a job, then poll until the server has saved the file.

export type VideoResult = { filename: string; poster: string | null; model: string; seconds: number };

type StartOptions = {
    prompt: string;
    size: string;
    image: File | null;
    passwordHash: string | null;
};

export class VideoRequestError extends Error {
    constructor(
        message: string,
        readonly status: number
    ) {
        super(message);
    }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
    try {
        return (await response.json()) as Record<string, unknown>;
    } catch {
        return {};
    }
}

function failure(response: Response, body: Record<string, unknown>): VideoRequestError {
    const message = typeof body.error === 'string' && body.error ? body.error : `Video failed (${response.status}).`;
    return new VideoRequestError(message, response.status);
}

export async function startVideo(options: StartOptions, signal: AbortSignal): Promise<string> {
    const form = new FormData();
    form.append('prompt', options.prompt);
    form.append('size', options.size);
    if (options.image) form.append('image', options.image, options.image.name);
    if (options.passwordHash) form.append('passwordHash', options.passwordHash);
    const response = await fetch('/api/video', { method: 'POST', body: form, signal });
    const body = await readJson(response);
    if (!response.ok) throw failure(response, body);
    if (typeof body.jobId !== 'string') throw new VideoRequestError('The server did not start the video.', 502);
    return body.jobId;
}

const POLL_INTERVAL_MS = 3000;
const GIVE_UP_AFTER_MS = 10 * 60 * 1000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) return reject(signal.reason);
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal.reason);
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });
}

export async function waitForVideo(
    jobId: string,
    passwordHash: string | null,
    signal: AbortSignal,
    interval = POLL_INTERVAL_MS
): Promise<VideoResult> {
    const headers: Record<string, string> = passwordHash ? { 'x-password-hash': passwordHash } : {};
    const startedAt = Date.now();
    let networkFailures = 0;
    for (let first = true; ; first = false) {
        // Check straight away, so a video that finished while the page was closed shows at once.
        if (!first) await sleep(interval, signal);
        let response: Response;
        try {
            response = await fetch(`/api/video?jobId=${encodeURIComponent(jobId)}`, { headers, signal });
        } catch (error) {
            if (signal.aborted) throw error;
            // A dropped connection (phone went to sleep) should not lose a video that is still being made.
            if (++networkFailures > 5) throw new VideoRequestError('Lost the connection while making the video.', 0);
            continue;
        }
        networkFailures = 0;
        const body = await readJson(response);
        if (!response.ok) throw failure(response, body);
        if (body.status === 'completed' && typeof body.filename === 'string') {
            return {
                filename: body.filename,
                poster: typeof body.poster === 'string' ? body.poster : null,
                model: typeof body.model === 'string' ? body.model : 'video',
                seconds: typeof body.seconds === 'number' ? body.seconds : 0
            };
        }
        if (Date.now() - startedAt > GIVE_UP_AFTER_MS) {
            throw new VideoRequestError('The video is taking too long. Try again.', 504);
        }
    }
}

// Best effort: tell the server to stop a job the user cancelled.
export function cancelVideoJob(jobId: string, passwordHash: string | null): void {
    const headers: Record<string, string> = passwordHash ? { 'x-password-hash': passwordHash } : {};
    fetch(`/api/video?jobId=${encodeURIComponent(jobId)}`, { method: 'DELETE', headers, keepalive: true }).catch(
        () => undefined
    );
}

// A started video, remembered so that closing or reloading the page does not lose it.
export type PendingVideoJob = {
    jobId: string;
    prompt: string;
    startedAt: number;
    aspect: string;
    // The image being animated, when it is one the server can still serve.
    baseUrl: string | null;
};

const PENDING_KEY = 'pendingVideoJob';

export function savePendingVideoJob(job: PendingVideoJob, storage: Storage = localStorage): void {
    try {
        storage.setItem(PENDING_KEY, JSON.stringify(job));
    } catch {
        // Storage can be full or blocked; the video still works without resume.
    }
}

export function clearPendingVideoJob(storage: Storage = localStorage): void {
    try {
        storage.removeItem(PENDING_KEY);
    } catch {
        // Nothing to clear.
    }
}

// Returns the remembered job unless it is malformed or too old to still be worth waiting for.
export function loadPendingVideoJob(storage: Storage = localStorage, now = Date.now()): PendingVideoJob | null {
    try {
        const job = JSON.parse(storage.getItem(PENDING_KEY) ?? 'null') as Partial<PendingVideoJob> | null;
        if (
            job &&
            typeof job.jobId === 'string' &&
            typeof job.prompt === 'string' &&
            typeof job.startedAt === 'number' &&
            typeof job.aspect === 'string' &&
            now - job.startedAt < GIVE_UP_AFTER_MS
        ) {
            return {
                jobId: job.jobId,
                prompt: job.prompt,
                startedAt: job.startedAt,
                aspect: job.aspect,
                baseUrl: typeof job.baseUrl === 'string' ? job.baseUrl : null
            };
        }
    } catch {
        // Fall through and forget it.
    }
    clearPendingVideoJob(storage);
    return null;
}

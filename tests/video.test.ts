import { parseByteRange } from '../src/lib/byte-range';
import {
    aspectRatioForSize,
    assetUrl,
    chooseVideoSeconds,
    downloadVideo,
    estimateVideoCost,
    isVideoJobId,
    submitVideo,
    VideoApiError,
    videoConfig,
    videoErrorMessage,
    videoSecondsOptions,
    videoStatus,
    type VideoConfig
} from '../src/lib/video';
import { clearPendingVideoJob, loadPendingVideoJob, savePendingVideoJob } from '../src/lib/video-client';
import { afterEach, describe, expect, test } from 'bun:test';

const ENDPOINT = 'https://gateway.example/resource/providers/falai/v1/minimax/h3-max-turbo';
const JOB = '2f7a5291-483b-401f-a79d-2a90703e1714';
const config: VideoConfig = { endpoint: ENDPOINT, apiKey: 'key', model: 'deployment', seconds: 5, resolution: '768P' };

const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
});

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
function mockFetch(responses: Array<Response | ((call: Call) => Response)>): Call[] {
    const calls: Call[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const call: Call = {
            url: String(input),
            method: init.method ?? 'GET',
            headers: (init.headers ?? {}) as Record<string, string>,
            body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined
        };
        calls.push(call);
        const next = responses.shift();
        if (!next) throw new Error(`Unexpected fetch: ${call.url}`);
        return typeof next === 'function' ? next(call) : next;
    }) as typeof fetch;
    return calls;
}

describe('video config', () => {
    test('is off until an endpoint and key are set', () => {
        expect(videoConfig({} as NodeJS.ProcessEnv)).toBeNull();
        expect(videoConfig({ VIDEO_ENDPOINT: ENDPOINT } as unknown as NodeJS.ProcessEnv)).toBeNull();
    });

    test('uses safe defaults and ignores out-of-range settings', () => {
        const env = {
            VIDEO_ENDPOINT: `${ENDPOINT}/`,
            AZURE_OPENAI_API_KEY: 'k',
            VIDEO_SECONDS: '90',
            VIDEO_RESOLUTION: '4k'
        } as unknown as NodeJS.ProcessEnv;
        expect(videoConfig(env)).toEqual({
            endpoint: ENDPOINT,
            apiKey: 'k',
            model: 'Fal-MiniMax-H3-Max-Turbo',
            seconds: 5,
            resolution: '768P'
        });
        expect(videoConfig({ ...env, VIDEO_SECONDS: '8', VIDEO_RESOLUTION: '480p' })).toMatchObject({
            seconds: 8,
            resolution: '480P'
        });
    });

    test('offers 5 and 10 seconds and falls back to the default for anything else', () => {
        expect(videoSecondsOptions(config)).toEqual([5, 10]);
        expect(videoSecondsOptions({ ...config, seconds: 8 })).toEqual([5, 8, 10]);
        expect(chooseVideoSeconds(config, '10')).toBe(10);
        expect(chooseVideoSeconds(config, '15')).toBe(5);
        expect(chooseVideoSeconds(config, null)).toBe(5);
        expect(chooseVideoSeconds(config, 'abc')).toBe(5);
    });

    test('estimates cost from length and resolution', () => {
        expect(estimateVideoCost(5, '768P')).toBe(0.23);
        expect(estimateVideoCost(5, '480P')).toBe(0.14);
        expect(estimateVideoCost(10, '768P')).toBe(0.43);
    });
});

describe('video helpers', () => {
    test('maps prompt-bar shapes to video aspect ratios', () => {
        expect(aspectRatioForSize('1024x1024')).toBe('1:1');
        expect(aspectRatioForSize('1536x1024')).toBe('16:9');
        expect(aspectRatioForSize('1024x1536')).toBe('9:16');
        expect(aspectRatioForSize('nonsense')).toBe('16:9');
    });

    test('accepts only UUID job ids', () => {
        expect(isVideoJobId(JOB)).toBe(true);
        expect(isVideoJobId('../../etc/passwd')).toBe(false);
        expect(isVideoJobId(`${JOB}/cancel`)).toBe(false);
        expect(isVideoJobId(null)).toBe(false);
    });

    test('rewrites result URLs onto our own endpoint and rejects anything else', () => {
        const direct = `https://model-host.example/providers/falai/v1/assets/${JOB}/af21770a-d408-4202-84e6-469bc50026f6`;
        expect(assetUrl(ENDPOINT, direct)).toBe(
            `https://gateway.example/resource/providers/falai/v1/assets/${JOB}/af21770a-d408-4202-84e6-469bc50026f6`
        );
        expect(assetUrl(ENDPOINT, 'https://evil.example/video.mp4')).toBeNull();
        expect(assetUrl(ENDPOINT, 'https://x/providers/falai/v1/assets/../../secrets')).toBeNull();
        expect(assetUrl(ENDPOINT, `https://x/providers/falai/v1/minimax/h3-max-turbo/requests/${JOB}`)).toBeNull();
    });

    test('pulls a readable message out of service errors', () => {
        const validation = JSON.stringify({
            detail: JSON.stringify([{ type: 'enum', msg: "Input should be '16:9' or '9:16'" }]),
            error_type: 'schema_validation_error'
        });
        expect(videoErrorMessage(validation, 'fallback')).toBe("Input should be '16:9' or '9:16'");
        expect(videoErrorMessage('{"detail":"Content flagged by the safety checker."}', 'fallback')).toBe(
            'Content flagged by the safety checker.'
        );
        expect(videoErrorMessage('<html>bad gateway</html>', 'fallback')).toBe('<html>bad gateway</html>');
        expect(videoErrorMessage('', 'fallback')).toBe('fallback');
        expect(videoErrorMessage('{}', 'fallback')).toBe('fallback');
    });
});

describe('video API calls', () => {
    test('text-to-video sends the shape; image-to-video sends the image and lets it set the shape', async () => {
        const calls = mockFetch([Response.json({ request_id: JOB }), Response.json({ request_id: JOB })]);
        expect(await submitVideo(config, { prompt: 'a cat', aspectRatio: '9:16', seconds: 5 })).toBe(JOB);
        expect(calls[0].url).toBe(`${ENDPOINT}/text-to-video`);
        expect(calls[0].headers['api-key']).toBe('key');
        expect(calls[0].body).toEqual({
            model: 'deployment',
            prompt: 'a cat',
            duration: 5,
            resolution: '768P',
            prompt_expansion_mode: 'balanced',
            aspect_ratio: '9:16'
        });

        await submitVideo(config, {
            prompt: 'zoom',
            imageDataUri: 'data:image/jpeg;base64,AAAA',
            aspectRatio: '1:1',
            seconds: 10
        });
        expect(calls[1].url).toBe(`${ENDPOINT}/image-to-video`);
        expect(calls[1].body).toMatchObject({ image_url: 'data:image/jpeg;base64,AAAA', duration: 10 });
        expect(calls[1].body).not.toHaveProperty('aspect_ratio');
    });

    test('a rejected request surfaces the service message and status', async () => {
        mockFetch([Response.json({ detail: 'Too many requests' }, { status: 429 })]);
        const error = await submitVideo(config, { prompt: 'a cat', seconds: 5 }).catch((caught) => caught);
        expect(error).toBeInstanceOf(VideoApiError);
        expect(error.status).toBe(429);
        expect(error.message).toBe('Too many requests');
    });

    test('reports queue progress', async () => {
        mockFetch([
            Response.json({ status: 'IN_QUEUE' }),
            Response.json({ status: 'IN_PROGRESS' }),
            Response.json({ status: 'COMPLETED' })
        ]);
        expect(await videoStatus(config, JOB)).toBe('queued');
        expect(await videoStatus(config, JOB)).toBe('running');
        expect(await videoStatus(config, JOB)).toBe('completed');
    });

    test('downloads the finished file through our endpoint with the key', async () => {
        const calls = mockFetch([
            Response.json({ video: { url: `https://model-host.example/providers/falai/v1/assets/${JOB}/abc-123` } }),
            new Response(new Uint8Array([1, 2, 3]))
        ]);
        const file = await downloadVideo(config, JOB);
        expect([...file]).toEqual([1, 2, 3]);
        expect(calls[0].url).toBe(`${ENDPOINT}/requests/${JOB}`);
        expect(calls[1].url).toBe(`https://gateway.example/resource/providers/falai/v1/assets/${JOB}/abc-123`);
        expect(calls[1].headers['api-key']).toBe('key');
    });

    test('a finished job with no video is an error, not a hang', async () => {
        mockFetch([Response.json({ detail: 'Blocked by the safety checker.' }, { status: 422 })]);
        await expect(downloadVideo(config, JOB)).rejects.toThrow('Blocked by the safety checker.');
        mockFetch([Response.json({ video: { url: 'https://evil.example/x.mp4' } })]);
        await expect(downloadVideo(config, JOB)).rejects.toThrow('returned no video');
    });
});

describe('byte ranges', () => {
    test('no header or an unparseable one serves the whole file', () => {
        expect(parseByteRange(null, 100)).toBeNull();
        expect(parseByteRange('items=0-1', 100)).toBeNull();
        expect(parseByteRange('bytes=0-1,5-6', 100)).toBeNull();
        expect(parseByteRange('bytes=-', 100)).toBeNull();
    });

    test('parses start-end, open-ended and suffix ranges', () => {
        expect(parseByteRange('bytes=0-1', 100)).toEqual({ start: 0, end: 1 });
        expect(parseByteRange('bytes=10-', 100)).toEqual({ start: 10, end: 99 });
        expect(parseByteRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 });
        expect(parseByteRange('bytes=-20', 100)).toEqual({ start: 80, end: 99 });
        expect(parseByteRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 });
    });

    test('flags ranges that cannot be satisfied', () => {
        expect(parseByteRange('bytes=100-', 100)).toBe('invalid');
        expect(parseByteRange('bytes=50-10', 100)).toBe('invalid');
        expect(parseByteRange('bytes=-0', 100)).toBe('invalid');
        expect(parseByteRange('bytes=0-', 0)).toBe('invalid');
    });
});

describe('remembering a video in progress', () => {
    function memoryStorage(): Storage {
        const data = new Map<string, string>();
        return {
            getItem: (key: string) => data.get(key) ?? null,
            setItem: (key: string, value: string) => void data.set(key, value),
            removeItem: (key: string) => void data.delete(key),
            clear: () => data.clear(),
            key: () => null,
            get length() {
                return data.size;
            }
        } as Storage;
    }
    const job = {
        jobId: JOB,
        prompt: 'a cat',
        startedAt: 1_000_000,
        aspect: '1 / 1',
        seconds: 10,
        baseUrl: '/api/image/a.webp'
    };

    test('a saved job comes back after a reload and is forgotten once cleared', () => {
        const storage = memoryStorage();
        savePendingVideoJob(job, storage);
        expect(loadPendingVideoJob(storage, job.startedAt + 60_000)).toEqual(job);
        clearPendingVideoJob(storage);
        expect(loadPendingVideoJob(storage, job.startedAt + 60_000)).toBeNull();
    });

    test('stale or malformed jobs are dropped', () => {
        const storage = memoryStorage();
        savePendingVideoJob(job, storage);
        expect(loadPendingVideoJob(storage, job.startedAt + 11 * 60_000)).toBeNull();
        expect(storage.length).toBe(0);
        storage.setItem('pendingVideoJob', '{not json');
        expect(loadPendingVideoJob(storage)).toBeNull();
        storage.setItem('pendingVideoJob', JSON.stringify({ jobId: 5 }));
        expect(loadPendingVideoJob(storage)).toBeNull();
    });
});

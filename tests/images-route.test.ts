import { readImageStream } from '../src/lib/image-stream';
import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import fs from 'fs';
import { NextRequest } from 'next/server';
import os from 'os';
import path from 'path';
import sharp from 'sharp';

type UpstreamRequest = {
    deployment: string | null;
    body: {
        stream?: boolean;
        tools: { model?: string; output_format: string; output_compression?: number }[];
        input: string | { content: { type: string; text?: string; image_url?: string }[] }[];
    };
};

const png = (
    await sharp({ create: { width: 16, height: 16, channels: 4, background: '#00ff0080' } })
        .png()
        .toBuffer()
).toString('base64');
let requests: UpstreamRequest[] = [];
let outcome: 'success' | 'partial-failure' | 'quota' | 'stream-failure' | 'no-image' | 'hanging' = 'success';
let onUpstreamAbort: (() => void) | undefined;
const upstream = Bun.serve({
    port: 0,
    async fetch(request) {
        const body: UpstreamRequest['body'] = await request.json();
        requests.push({ deployment: request.headers.get('x-ms-oai-image-generation-deployment'), body });
        if (outcome === 'hanging') {
            request.signal.addEventListener('abort', () => onUpstreamAbort?.(), { once: true });
            return new Response(
                new ReadableStream({
                    start(controller) {
                        controller.enqueue(
                            new TextEncoder().encode(
                                `data: ${JSON.stringify({
                                    type: 'response.image_generation_call.partial_image',
                                    partial_image_b64: png,
                                    partial_image_index: 0
                                })}\n\n`
                            )
                        );
                    }
                }),
                { headers: { 'Content-Type': 'text/event-stream' } }
            );
        }
        if (outcome === 'quota' || (outcome === 'partial-failure' && requests.length === 2)) {
            return Response.json(
                { error: { message: 'Model limit', type: 'rate_limit_error' } },
                { status: 429, headers: { 'Retry-After': '75' } }
            );
        }
        const image = { id: 'ig_test', type: 'image_generation_call', result: png, status: 'completed' };
        const response = {
            id: 'resp_test',
            status: 'completed',
            output: outcome === 'no-image' ? [] : [image],
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 } }
        };
        if (!body.stream) return Response.json(response);
        const events =
            outcome === 'stream-failure'
                ? [{ type: 'response.failed', response: { status: 'failed', error: { message: 'Generation failed' } } }]
                : [
                      {
                          type: 'response.image_generation_call.partial_image',
                          partial_image_b64: png,
                          partial_image_index: 0
                      },
                      { type: 'response.output_item.done', item: image },
                      { type: 'response.completed', response }
                  ];
        return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
            headers: { 'Content-Type': 'text/event-stream' }
        });
    }
});

type MaiRequest = { path: string; apiKey: string | null; json?: Record<string, unknown>; form?: FormData };
let maiRequests: MaiRequest[] = [];
let maiOutcome: 'success' | 'quota' = 'success';
const mai = Bun.serve({
    port: 0,
    async fetch(request) {
        const path = new URL(request.url).pathname;
        const apiKey = request.headers.get('api-key');
        if (path.endsWith('/images/edits')) maiRequests.push({ path, apiKey, form: await request.formData() });
        else maiRequests.push({ path, apiKey, json: await request.json() });
        if (maiOutcome === 'quota') {
            return Response.json(
                { error: { code: 'rate_limit', message: 'Too many requests' } },
                { status: 429, headers: { 'Retry-After': '30' } }
            );
        }
        return Response.json({
            created: 1,
            model: 'MAI-Image-2.7',
            data: [{ b64_json: png }],
            usage: { num_output_tokens: 1024, num_input_text_tokens: 12, num_input_image_tokens: 0 }
        });
    }
});

const savedEnv = { ...process.env };
const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-log-'));
const logFile = path.join(logDir, 'generations.jsonl');
process.env.IMAGE_LOG_FILE = logFile;
process.env.IMAGE_LIMIT_PER_IP_HOUR = '0';
process.env.IMAGE_LIMIT_PER_IP_DAY = '0';
const logEntries = () =>
    fs.existsSync(logFile)
        ? fs
              .readFileSync(logFile, 'utf8')
              .trim()
              .split('\n')
              .map((line) => JSON.parse(line))
        : [];
process.env.MAI_IMAGE_ENDPOINT = `${mai.url.toString()}mai/v1/`;
process.env.AZURE_OPENAI_ENDPOINT = upstream.url.toString();
process.env.AZURE_OPENAI_API_KEY = 'test-only';
process.env.AZURE_OPENAI_DEPLOYMENT_NAME = 'obsolete-deployment';
process.env.NEXT_PUBLIC_IMAGE_STORAGE_MODE = 'indexeddb';
delete process.env.APP_PASSWORD;
const { POST } = await import('../src/app/api/images/route');
let now = Date.now();
const clock = spyOn(Date, 'now').mockImplementation(() => now);

beforeEach(() => {
    requests = [];
    maiRequests = [];
    outcome = 'success';
    maiOutcome = 'success';
    fs.rmSync(logFile, { force: true });
    onUpstreamAbort = undefined;
    now += 120_000;
});
afterAll(() => {
    clock.mockRestore();
    upstream.stop(true);
    mai.stop(true);
    fs.rmSync(logDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
});

function send(values: Record<string, string> = {}, references: File[] = [], signal?: AbortSignal) {
    const body = new FormData();
    body.set('prompt', 'Change only the leaf color. Keep everything else the same.');
    body.set('model', 'gpt-image-2.5-flare');
    for (const [key, value] of Object.entries(values)) body.set(key, value);
    references.forEach((reference, i) => body.set(`image_${i}`, reference));
    return POST(new NextRequest('http://localhost/api/images', { method: 'POST', body, signal }));
}

async function events(response: Response) {
    return (await response.text())
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => JSON.parse(line.slice(6)));
}

describe('image route', () => {
    test('routes both models through their own header, not an old deployment or tool model', async () => {
        for (const model of ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst']) {
            const response = await send({ model });
            expect(response.status).toBe(200);
            expect((await response.json()).images).toHaveLength(1);
            expect(requests.at(-1)?.deployment).toBe(model);
            expect(requests.at(-1)?.body.tools[0].model).toBeUndefined();
        }
    });

    test('rejects oversized batches before any upstream request', async () => {
        expect((await send({ n: '5' })).status).toBe(400);
        expect(requests).toHaveLength(0);
    });

    test.each(['0', '1'])('sends final image data once per image (partial_images=%s)', async (partialImages) => {
        const wire = await (await send({ n: '2', stream: 'true', partial_images: partialImages })).text();
        const result = await events(new Response(wire));
        expect(result.filter((event) => event.type === 'partial_image')).toHaveLength(partialImages === '1' ? 2 : 0);
        expect(result.filter((event) => event.type === 'completed')).toHaveLength(2);
        expect(result.filter((event) => event.type === 'completed').every((event) => event.b64_json === png)).toBe(
            true
        );
        expect(result.at(-1).completed_count).toBe(2);
        expect(result.at(-1).images).toBeUndefined();
        expect(wire.split(`"b64_json":"${png}"`).length - 1).toBe(partialImages === '1' ? 4 : 2);
        const assembled = await readImageStream(
            new Response(wire),
            new AbortController().signal,
            () => {},
            () => {}
        );
        expect(assembled.images).toHaveLength(2);
        expect(assembled.images.every((image) => image.b64_json === png)).toBe(true);
        expect(assembled.error).toBeUndefined();
        const limited = await send();
        expect(limited.status).toBe(429);
        expect(limited.headers.get('retry-after')).toBe('60');
        expect(requests).toHaveLength(2);
    });

    test.each(['0', '1'])(
        'keeps successful images and upstream cooldown (partial_images=%s)',
        async (partialImages) => {
            outcome = 'partial-failure';
            const wire = await (await send({ n: '2', stream: 'true', partial_images: partialImages })).text();
            const result = await events(new Response(wire));
            expect(result.at(-1).type).toBe('done');
            expect(result.at(-1).completed_count).toBe(1);
            expect(result.at(-1).images).toBeUndefined();
            expect(result.at(-1).error).toContain('75 seconds');
            expect(result.at(-1).failures[0].status).toBe(429);
            const assembled = await readImageStream(
                new Response(wire),
                new AbortController().signal,
                () => {},
                () => {}
            );
            expect(assembled.images).toHaveLength(1);
            expect(assembled.images[0].b64_json).toBe(png);
            expect(assembled.error).toContain('75 seconds');
            const limited = await send();
            expect(limited.headers.get('retry-after')).toBe('75');
            expect(requests).toHaveLength(2);
        }
    );

    test('returns HTTP 429 and Retry-After when every nonstreaming request is limited', async () => {
        outcome = 'quota';
        const response = await send();
        expect(response.status).toBe(429);
        expect(response.headers.get('retry-after')).toBe('75');
        expect(requests).toHaveLength(1);
    });

    test('surfaces a terminal stream failure without making a hidden retry', async () => {
        outcome = 'stream-failure';
        const result = await events(await send({ stream: 'true', partial_images: '1' }));
        expect(result.at(-1).type).toBe('error');
        expect(result.at(-1).error).toContain('Generation failed');
        expect(requests).toHaveLength(1);
    });

    test('does not retry a text-only response', async () => {
        outcome = 'no-image';
        const response = await send();
        expect(response.status).toBe(502);
        expect((await response.json()).error).toContain('No image was generated');
        expect(requests).toHaveLength(1);
    });

    test('encodes transparent WebP from gateway PNG and labels reference inputs', async () => {
        const reference = new File([Buffer.from(png, 'base64')], 'leaf.png', { type: 'image/png' });
        const response = await send({ output_format: 'webp', background: 'transparent', output_compression: '60' }, [
            reference
        ]);
        const image = (await response.json()).images[0];
        expect(image.output_format).toBe('webp');
        const decoded = sharp(Buffer.from(image.b64_json, 'base64'));
        expect((await decoded.metadata()).format).toBe('webp');
        expect((await decoded.stats()).isOpaque).toBe(false);
        expect(requests[0].body.tools[0].output_format).toBe('png');
        const input = requests[0].body.input;
        expect(Array.isArray(input) && input[0].content[0].text).toBe('Image 1:');
    });

    test('forwards JPEG compression', async () => {
        await send({ output_format: 'jpeg', output_compression: '40' });
        expect(requests[0].body.tools[0].output_compression).toBe(40);
    });

    test('requires the configured app password before spending quota', async () => {
        process.env.APP_PASSWORD = 'local-test-password';
        try {
            expect((await send()).status).toBe(401);
            expect(requests).toHaveLength(0);
        } finally {
            delete process.env.APP_PASSWORD;
        }
    });

    test.each(['request-abort', 'reader-cancel'])('cancels the upstream generation on %s', async (mode) => {
        outcome = 'hanging';
        const aborted = Promise.withResolvers<void>();
        onUpstreamAbort = aborted.resolve;
        const controller = new AbortController();
        const response = await send({ stream: 'true', partial_images: '1' }, [], controller.signal);
        const reader = response.body!.getReader();
        const first = await reader.read();
        expect(new TextDecoder().decode(first.value)).toContain('partial_image');
        if (mode === 'request-abort') controller.abort();
        else await reader.cancel();
        await aborted.promise;
        reader.releaseLock();
        expect(requests).toHaveLength(1);
    });

    test('defaults to MAI and calls its generations API, not the Responses gateway', async () => {
        const body = new FormData();
        body.set('prompt', 'A red fox in snow');
        body.set('size', '1536x1024');
        const response = await POST(new NextRequest('http://localhost/api/images', { method: 'POST', body }));
        expect(response.status).toBe(200);
        const json = await response.json();
        expect(json.images).toHaveLength(1);
        expect(json.images[0].output_format).toBe('png');
        expect(requests).toHaveLength(0);
        expect(maiRequests).toHaveLength(1);
        expect(maiRequests[0].path).toBe('/mai/v1/images/generations');
        expect(maiRequests[0].apiKey).toBe('test-only');
        expect(maiRequests[0].json).toEqual({
            model: 'MAI-Image-2.7',
            prompt: 'A red fox in snow',
            width: 1536,
            height: 1024
        });
    });

    test('sends MAI reference images to the edits API as repeated image fields', async () => {
        const reference = new File([Buffer.from(png, 'base64')], 'leaf.png', { type: 'image/png' });
        const response = await send({ model: 'MAI-Image-2.7' }, [reference, reference]);
        expect(response.status).toBe(200);
        expect(maiRequests[0].path).toBe('/mai/v1/images/edits');
        expect(maiRequests[0].form?.getAll('image')).toHaveLength(2);
        expect(maiRequests[0].form?.get('width')).toBe('1024');
        expect(maiRequests[0].form?.get('model')).toBe('MAI-Image-2.7');
    });

    test('streams MAI batches without partial images and encodes JPEG locally', async () => {
        const wire = await (
            await send({
                model: 'MAI-Image-2.7',
                n: '2',
                stream: 'true',
                partial_images: '3',
                output_format: 'jpeg',
                output_compression: '50'
            })
        ).text();
        const result = await events(new Response(wire));
        expect(result.filter((event) => event.type === 'partial_image')).toHaveLength(0);
        const completed = result.filter((event) => event.type === 'completed');
        expect(completed).toHaveLength(2);
        const format = (await sharp(Buffer.from(completed[0].b64_json, 'base64')).metadata()).format;
        expect(format).toBe('jpeg');
        expect(result.at(-1).completed_count).toBe(2);
        expect(maiRequests).toHaveLength(2);
    });

    test('maps MAI 429s to the shared quota cooldown', async () => {
        maiOutcome = 'quota';
        const response = await send({ model: 'MAI-Image-2.7' });
        expect(response.status).toBe(429);
        expect(response.headers.get('retry-after')).toBe('30');
        expect((await send({ model: 'MAI-Image-2.7' })).status).toBe(429);
        expect(maiRequests).toHaveLength(1);
    });

    test('rejects transparent MAI backgrounds before any upstream request', async () => {
        expect((await send({ model: 'MAI-Image-2.7', background: 'transparent' })).status).toBe(400);
        expect(maiRequests).toHaveLength(0);
    });

    test('logs each generation with prompt, model, client IP, and saved files', async () => {
        const body = new FormData();
        body.set('prompt', 'A red fox in snow');
        body.set('n', '2');
        const response = await POST(
            new NextRequest('http://localhost/api/images', {
                method: 'POST',
                body,
                headers: { 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }
            })
        );
        expect(response.status).toBe(200);
        const [entry] = logEntries();
        expect(entry).toMatchObject({
            status: 'ok',
            model: 'MAI-Image-2.7',
            prompt: 'A red fox in snow',
            n: 2,
            completed: 2,
            references: 0,
            streamed: false,
            ip: '203.0.113.7'
        });
        expect(entry.files).toHaveLength(2);
        expect(typeof entry.duration_ms).toBe('number');
    });

    test('logs partial failures, app rate limits, and skips invalid input', async () => {
        outcome = 'partial-failure';
        await (await send({ n: '2', stream: 'true' })).text();
        await send();
        await send({ n: '9' });
        const entries = logEntries();
        expect(entries.map((entry) => entry.status)).toEqual(['partial', 'rate_limited']);
        expect(entries[0].completed).toBe(1);
        expect(entries[0].error).toContain('75 seconds');
    });

    test('enforces the per-IP image cap before any upstream request and logs it', async () => {
        process.env.IMAGE_LIMIT_PER_IP_HOUR = '2';
        try {
            const sendFrom = (ip: string, n: string) => {
                const body = new FormData();
                body.set('prompt', 'A red fox in snow');
                body.set('n', n);
                return POST(
                    new NextRequest('http://localhost/api/images', {
                        method: 'POST',
                        body,
                        headers: { 'x-real-ip': ip }
                    })
                );
            };
            expect((await sendFrom('198.51.100.9', '2')).status).toBe(200);
            now += 120_000;
            const limited = await sendFrom('198.51.100.9', '1');
            expect(limited.status).toBe(429);
            expect((await limited.json()).error).toContain('2 images per hour');
            expect(maiRequests).toHaveLength(2);
            expect(logEntries().at(-1)).toMatchObject({ status: 'rate_limited', ip: '198.51.100.9' });
            expect((await sendFrom('198.51.100.10', '1')).status).toBe(200);
        } finally {
            process.env.IMAGE_LIMIT_PER_IP_HOUR = '0';
        }
    });
});

import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { NextRequest } from 'next/server';
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
let outcome: 'success' | 'partial-failure' | 'quota' | 'stream-failure' | 'no-image' = 'success';
const upstream = Bun.serve({
    port: 0,
    async fetch(request) {
        const body: UpstreamRequest['body'] = await request.json();
        requests.push({ deployment: request.headers.get('x-ms-oai-image-generation-deployment'), body });
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

const savedEnv = { ...process.env };
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
    outcome = 'success';
    now += 120_000;
});
afterAll(() => {
    clock.mockRestore();
    upstream.stop(true);
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
});

function send(values: Record<string, string> = {}, references: File[] = []) {
    const body = new FormData();
    body.set('prompt', 'Change only the leaf color. Keep everything else the same.');
    for (const [key, value] of Object.entries(values)) body.set(key, value);
    references.forEach((reference, i) => body.set(`image_${i}`, reference));
    return POST(new NextRequest('http://localhost/api/images', { method: 'POST', body }));
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

    test('streams a complete two-image batch and rejects a third request without spending quota', async () => {
        const result = await events(await send({ n: '2', stream: 'true', partial_images: '1' }));
        expect(result.filter((event) => event.type === 'partial_image')).toHaveLength(2);
        expect(result.filter((event) => event.type === 'completed')).toHaveLength(2);
        expect(result.at(-1).images).toHaveLength(2);
        const limited = await send();
        expect(limited.status).toBe(429);
        expect(limited.headers.get('retry-after')).toBe('60');
        expect(requests).toHaveLength(2);
    });

    test('preserves successful images on quota failure and respects upstream cooldown', async () => {
        outcome = 'partial-failure';
        const result = await events(await send({ n: '2', stream: 'true' }));
        expect(result.at(-1).type).toBe('done');
        expect(result.at(-1).images).toHaveLength(1);
        expect(result.at(-1).error).toContain('75 seconds');
        expect(result.at(-1).failures[0].status).toBe(429);
        const limited = await send();
        expect(limited.headers.get('retry-after')).toBe('75');
        expect(requests).toHaveLength(2);
    });

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
});

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { NextRequest } from 'next/server';

type PromptRequest = {
    model: string;
    instructions: string;
    input: string | { role: string; content: { type: string; text?: string; image_url?: string; detail?: string }[] }[];
};

const requests: PromptRequest[] = [];
const upstream = Bun.serve({
    port: 0,
    async fetch(request) {
        requests.push(await request.json());
        return Response.json({
            id: 'resp_prompt_test',
            object: 'response',
            status: 'completed',
            output: [{
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'Keep label "aB & Co." unchanged.', annotations: [] }]
            }]
        });
    }
});

const savedEnv = { ...process.env };
process.env.AZURE_OPENAI_ENDPOINT = upstream.url.toString();
process.env.AZURE_OPENAI_API_KEY = 'test-only';
process.env.AZURE_OPENAI_TEXT_MODEL = 'test-text-model';
delete process.env.APP_PASSWORD;
const enhance = await import('../src/app/api/prompt-enhance/route');
const surprise = await import('../src/app/api/surprise-me/route');
const image = 'data:image/png;base64,YQ==';

beforeEach(() => {
    requests.length = 0;
});

afterAll(() => {
    upstream.stop(true);
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
});

for (const [name, route] of [['prompt-enhance', enhance], ['surprise-me', surprise]] as const) {
    const send = (body: object) => route.POST(new NextRequest(`http://localhost/api/${name}`, {
        method: 'POST',
        body: JSON.stringify({ mode: 'generate', prompt: 'Keep label "aB & Co." unchanged.', ...body })
    }));

    describe(name, () => {
        test('uses Responses text orchestration with ordered references', async () => {
            const response = await send({ referenceImages: [image, { dataUrl: image, alt: 'style sample' }] });
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ prompt: 'Keep label "aB & Co." unchanged.' });
            expect(requests).toHaveLength(1);
            expect(requests[0].model).toBe('test-text-model');
            const input = requests[0].input;
            if (typeof input === 'string') throw new Error('Expected multimodal input');
            expect(input[0].content.slice(0, 4)).toEqual([
                { type: 'input_text', text: 'Image 1' },
                { type: 'input_image', image_url: image, detail: 'auto' },
                { type: 'input_text', text: 'Image 2: style sample' },
                { type: 'input_image', image_url: image, detail: 'auto' }
            ]);
        });

        test('rejects malformed references without calling upstream or renumbering', async () => {
            const response = await send({ referenceImages: [image, 'invalid', image] });
            expect(response.status).toBe(400);
            expect((await response.json()).error).toContain('Reference image 2');
            expect(requests).toHaveLength(0);
        });

        test('rejects oversized references with 413 before upstream', async () => {
            const response = await send({ referenceImages: [`data:image/png;base64,${'A'.repeat(7 * 1024 * 1024)}`] });
            expect(response.status).toBe(413);
            expect(requests).toHaveLength(0);
        });

        test('rejects invalid modes before upstream', async () => {
            const response = await send({ mode: 'unsupported' });
            expect(response.status).toBe(400);
            expect(requests).toHaveLength(0);
        });
    });
}

import { calculateApiCost } from '../src/lib/cost-utils';
import { parseImageOptions } from '../src/lib/image-options';
import { createImageQuota } from '../src/lib/image-quota';
import { describe, expect, test } from 'bun:test';

function form(values: Record<string, string> = {}) {
    const data = new FormData();
    data.set('prompt', 'A green leaf');
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    return data;
}

describe('image request options', () => {
    test('defaults to Flare and accepts Sunburst', () => {
        expect(parseImageOptions(form()).model).toBe('gpt-image-2.5-flare');
        expect(parseImageOptions(form({ model: 'gpt-image-2.5-sunburst' })).model).toBe('gpt-image-2.5-sunburst');
    });

    test.each(['0', '-1', '3', '5', '1.5', '2abc', 'NaN', ''])('rejects invalid or oversized count %s', (n) => {
        expect(() => parseImageOptions(form({ n }))).toThrow('integer from 1 to 2');
    });

    test.each<Record<string, string>>([
        { model: 'gpt-image-2' },
        { prompt: '   ' },
        { size: '2048x2048' },
        { quality: 'xhigh' },
        { output_format: 'gif' },
        { background: 'transparent', output_format: 'jpeg' },
        { output_format: 'png', output_compression: '50' },
        { output_format: 'webp', output_compression: '101' },
        { output_format: 'webp', output_compression: '0' },
        { partial_images: '4' }
    ])('rejects unsupported settings %j', (values) => {
        expect(() => parseImageOptions(form(values))).toThrow();
    });

    test('allows transparent WebP and preserves reference order', () => {
        const data = form({ n: '2', output_format: 'webp', background: 'transparent', output_compression: '60' });
        data.set('image_0', new File(['first'], 'first.png', { type: 'image/png' }));
        data.set('image_1', new File(['second'], 'second.png', { type: 'image/png' }));
        const options = parseImageOptions(data);
        expect(options.n).toBe(2);
        expect(options.output_compression).toBe(60);
        expect(options.references.map((file) => file.name)).toEqual(['first.png', 'second.png']);
    });

    test('rejects too many references and invalid files', () => {
        const data = form();
        data.set('image_0', new File(['text'], 'text.txt', { type: 'text/plain' }));
        expect(() => parseImageOptions(data)).toThrow('PNG, JPEG, or WebP');
        for (let i = 0; i < 6; i++) data.set(`image_${i}`, new File(['image'], `${i}.png`, { type: 'image/png' }));
        expect(() => parseImageOptions(data)).toThrow('at most 5');
    });
});

describe('per-model quota', () => {
    test('reserves whole batches, separates models, and opens at 60 seconds', () => {
        const quota = createImageQuota();
        expect(quota.reserve('gpt-image-2.5-flare', 2, 0)).toBe(0);
        expect(quota.reserve('gpt-image-2.5-flare', 1, 15_000)).toBe(45);
        expect(quota.reserve('gpt-image-2.5-sunburst', 2, 15_000)).toBe(0);
        expect(quota.reserve('gpt-image-2.5-flare', 2, 60_000)).toBe(0);
    });

    test('waits for enough slots for the entire requested batch', () => {
        const quota = createImageQuota();
        quota.reserve('gpt-image-2.5-flare', 1, 0);
        quota.reserve('gpt-image-2.5-flare', 1, 20_000);
        expect(quota.reserve('gpt-image-2.5-flare', 2, 30_000)).toBe(50);
        expect(quota.reserve('gpt-image-2.5-flare', 1, 60_000)).toBe(0);
    });
});

describe('image cost estimates', () => {
    test('does not charge text orchestration tokens at image output rates', () => {
        expect(calculateApiCost({ output_tokens: 100, input_tokens_details: { cached_tokens: 0 } })).toBeNull();
    });

    test('uses current rates only with an image token breakdown', () => {
        expect(
            calculateApiCost({
                input_tokens_details: { text_tokens: 1000, image_tokens: 1000 },
                output_tokens: 1000
            })?.estimated_cost_usd
        ).toBe(0.043);
    });

    test('does not guess the cached-token modality', () => {
        expect(
            calculateApiCost({
                input_tokens_details: { text_tokens: 1000, image_tokens: 1000, cached_tokens: 100 },
                output_tokens: 1000
            })
        ).toBeNull();
    });
});

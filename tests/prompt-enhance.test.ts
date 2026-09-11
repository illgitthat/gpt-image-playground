import { describe, expect, test } from 'bun:test';
import {
    buildPromptEnhanceInput,
    buildSurpriseMeInput,
    parsePromptReferenceImages,
    PromptReferenceImageError
} from '../src/lib/prompt-enhance';

const firstImage = 'data:image/png;base64,YQ==';
const secondImage = 'data:image/webp;base64,Yg==';
const references = [{ dataUrl: firstImage }, { dataUrl: secondImage, alt: 'clothing sample' }];

describe('image prompt inputs', () => {
    test('keeps user specifics and multiline literal copy untouched', () => {
        const prompt = 'Exactly 2 labels: "aB & Co.\nKeep THIS!" in Image 2. Change only the shirt; preserve Image 1 identity.';
        const result = buildPromptEnhanceInput('generate', prompt);
        expect(result.input).toBe(prompt);
    });

    test('numbers even unlabeled references and keeps their original order and prompt', () => {
        const prompt = 'Use clothing from Image 2 on Image 1. Keep the face and label "A.B." unchanged.';
        const result = buildPromptEnhanceInput('generate', prompt, { referenceImages: references });
        expect(result.input).toEqual([{
            role: 'user',
            content: [
                { type: 'input_text', text: 'Image 1' },
                { type: 'input_image', image_url: firstImage, detail: 'auto' },
                { type: 'input_text', text: 'Image 2: clothing sample' },
                { type: 'input_image', image_url: secondImage, detail: 'auto' },
                { type: 'input_text', text: prompt }
            ]
        }]);
    });

    test('empty reference arrays use prompt-only instructions', () => {
        expect(buildPromptEnhanceInput('generate', 'A tree', { referenceImages: [] }))
            .toEqual(buildPromptEnhanceInput('generate', 'A tree'));
    });

    test('surprise references use the same stable numbering and automatic detail', () => {
        const result = buildSurpriseMeInput('generate', { referenceImages: references });
        expect(result.input).toEqual([{
            role: 'user',
            content: [
                { type: 'input_text', text: 'Image 1' },
                { type: 'input_image', image_url: firstImage, detail: 'auto' },
                { type: 'input_text', text: 'Image 2: clothing sample' },
                { type: 'input_image', image_url: secondImage, detail: 'auto' },
                { type: 'input_text', text: expect.any(String) }
            ]
        }]);
    });

    test('prompt-only surprise does not require references', () => {
        const result = buildSurpriseMeInput('generate');
        expect(typeof result.input).toBe('string');
    });

    test('enhancement and surprise include all five references with stable indexes', () => {
        const images = Array.from({ length: 5 }, (_, index) => ({
            dataUrl: `data:image/png;base64,${Buffer.from(String(index)).toString('base64')}`
        }));
        for (const result of [
            buildPromptEnhanceInput('generate', 'Use Image 5 as the palette.', { referenceImages: images }),
            buildSurpriseMeInput('generate', { referenceImages: images })
        ]) {
            if (typeof result.input === 'string') throw new Error('Expected reference image input');
            expect(result.input).toEqual([{
                role: 'user',
                content: [
                    ...images.flatMap((image, index) => [
                        { type: 'input_text' as const, text: `Image ${index + 1}` },
                        { type: 'input_image' as const, image_url: image.dataUrl, detail: 'auto' as const }
                    ]),
                    { type: 'input_text', text: expect.any(String) }
                ]
            }]);
        }
    });

    test('video keeps Sora guidance and low-detail reference analysis', () => {
        const plain = buildPromptEnhanceInput('video', 'Pan left');
        expect(plain.instructions).toContain('prompt-to-video');
        expect(plain.instructions).not.toContain('gpt-image-2.5');
        const referenced = buildPromptEnhanceInput('video', 'Pan left', {
            referenceImages: [references[0]],
            videoHasReferenceImage: true
        });
        expect(referenced.instructions).toContain('image-to-video');
        expect(referenced.input).toEqual([{
            role: 'user',
            content: [
                { type: 'input_text', text: 'Image 1' },
                { type: 'input_image', image_url: firstImage, detail: 'low' },
                { type: 'input_text', text: 'Pan left' }
            ]
        }]);
    });
});

describe('prompt reference validation', () => {
    test('accepts omitted images and preserves mixed string/object inputs', () => {
        expect(parsePromptReferenceImages(undefined)).toEqual([]);
        expect(parsePromptReferenceImages(null)).toEqual([]);
        expect(parsePromptReferenceImages([])).toEqual([]);
        expect(parsePromptReferenceImages([firstImage, references[1]])).toEqual(references);
        expect(parsePromptReferenceImages(Array(5).fill(firstImage))).toHaveLength(5);
    });

    test.each([
        'not an array',
        [firstImage, 'not an image', secondImage],
        [firstImage, {}],
        [firstImage, { dataUrl: 42 }],
        ['data:image/svg+xml;base64,YQ=='],
        ['data:image/png;base64,Y==='],
        ['data:image/png;base64,YQ'],
        ['data:image/png;base64,'],
        Array(6).fill(firstImage)
    ].map((input) => ({ input })))('rejects malformed or excess references instead of silently renumbering: %j', ({ input }) => {
        expect(() => parsePromptReferenceImages(input)).toThrow(PromptReferenceImageError);
    });

    test('errors identify the rejected original index', () => {
        expect(() => parsePromptReferenceImages([firstImage, 'invalid', secondImage]))
            .toThrow('Reference image 2');
    });

    test('accepts supported legacy MIME types and wrapped base64 without changing the input', () => {
        for (const mime of ['jpeg', 'jpg', 'gif', 'png', 'webp']) {
            const dataUrl = `data:image/${mime};base64,YW\r\nJj`;
            expect(parsePromptReferenceImages([dataUrl])[0].dataUrl).toBe(dataUrl);
        }
    });

    test('enforces the decoded five-megabyte boundary with a 413 error', () => {
        const atLimit = `data:image/png;base64,${Buffer.alloc(5 * 1024 * 1024).toString('base64')}`;
        expect(parsePromptReferenceImages([atLimit])[0].dataUrl).toBe(atLimit);
        const tooLarge = `data:image/png;base64,${Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')}`;
        try {
            parsePromptReferenceImages([tooLarge]);
            throw new Error('Expected size validation to fail');
        } catch (error) {
            expect(error).toBeInstanceOf(PromptReferenceImageError);
            expect(error).toMatchObject({ status: 413 });
        }
    });
});

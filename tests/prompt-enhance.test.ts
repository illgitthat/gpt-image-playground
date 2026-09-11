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
        expect(result.instructions).toContain('gpt-image-2.5-flare');
        expect(result.instructions).toContain('gpt-image-2.5-sunburst');
        expect(result.instructions).toContain('Keep literal text verbatim');
        expect(result.instructions).toContain('Do not impose an opaque background');
        expect(result.instructions).toContain('Do not pad to a word quota');
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
        expect(result.instructions).toContain('For local edits');
        expect(result.instructions).toContain('do not waive identity or layout constraints');
        expect(result.instructions).not.toContain('Default to inspiration mode');
    });

    test('empty reference arrays use prompt-only instructions', () => {
        expect(buildPromptEnhanceInput('generate', 'A tree', { referenceImages: [] }))
            .toEqual(buildPromptEnhanceInput('generate', 'A tree'));
    });

    test('surprise references use the same stable numbering and automatic detail', () => {
        const result = buildSurpriseMeInput('generate', { referenceImages: references });
        expect(result.instructions).toContain('explicit change/preserve boundary');
        expect(result.input).toEqual([{
            role: 'user',
            content: [
                { type: 'input_text', text: 'Image 1' },
                { type: 'input_image', image_url: firstImage, detail: 'auto' },
                { type: 'input_text', text: 'Image 2: clothing sample' },
                { type: 'input_image', image_url: secondImage, detail: 'auto' },
                { type: 'input_text', text: 'Surprise me with a fresh, unexpected edit instruction for the reference image(s). Make it concrete and grounded in what is actually shown.' }
            ]
        }]);
    });

    test('prompt-only surprise uses the 2.5 guidance without reference requirements', () => {
        const result = buildSurpriseMeInput('generate');
        expect(typeof result.input).toBe('string');
        expect(result.instructions).toContain('gpt-image-2.5-flare');
        expect(result.instructions).toContain('gpt-image-2.5-sunburst');
        expect(result.instructions).not.toContain('visible reference details');
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

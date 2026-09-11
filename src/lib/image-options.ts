import { DEFAULT_GPT_IMAGE_MODEL, isGptImageModel } from './cost-utils';

export const MAX_IMAGES = 2;
export const MAX_REFERENCE_IMAGES = 5;
export const IMAGE_SIZES = ['auto', '1024x1024', '1536x1024', '1024x1536'] as const;
export const IMAGE_QUALITIES = ['auto', 'low', 'medium', 'high'] as const;
export const IMAGE_FORMATS = ['png', 'jpeg', 'webp'] as const;
export const IMAGE_BACKGROUNDS = ['auto', 'opaque', 'transparent'] as const;

export class ImageInputError extends Error {}

function choice<T extends string>(form: FormData, key: string, values: readonly T[], fallback: T): T {
    const value = form.get(key) ?? fallback;
    const match = values.find((candidate) => candidate === value);
    if (!match) throw new ImageInputError(`Invalid ${key}. Expected one of: ${values.join(', ')}.`);
    return match;
}

function integer(form: FormData, key: string, min: number, max: number, fallback: number): number {
    const value = form.get(key);
    const number = value === null ? fallback : typeof value === 'string' && value.trim() ? Number(value) : NaN;
    if (!Number.isInteger(number) || number < min || number > max) {
        throw new ImageInputError(`${key} must be an integer from ${min} to ${max}.`);
    }
    return number;
}

export function parseImageOptions(form: FormData) {
    const prompt = form.get('prompt');
    if (typeof prompt !== 'string' || !prompt.trim()) throw new ImageInputError('Enter an image prompt.');
    const model = form.get('model') ?? DEFAULT_GPT_IMAGE_MODEL;
    if (!isGptImageModel(model)) throw new ImageInputError('Choose GPT Image 2.5 Flare or Sunburst.');
    const output_format = choice(form, 'output_format', IMAGE_FORMATS, 'png');
    const background = choice(form, 'background', IMAGE_BACKGROUNDS, 'auto');
    if (background === 'transparent' && output_format === 'jpeg') {
        throw new ImageInputError('Transparent backgrounds require PNG or WebP.');
    }
    const output_compression = form.has('output_compression')
        ? integer(form, 'output_compression', output_format === 'webp' ? 1 : 0, 100, 100)
        : undefined;
    if (output_format === 'png' && output_compression !== undefined) {
        throw new ImageInputError('Output compression is only supported for JPEG or WebP.');
    }
    const references: File[] = [];
    form.forEach((value, key) => {
        if (!key.startsWith('image_')) return;
        if (
            !(value instanceof File) ||
            !['image/png', 'image/jpeg', 'image/webp'].includes(value.type) ||
            !value.size
        ) {
            throw new ImageInputError('Reference images must be nonempty PNG, JPEG, or WebP files.');
        }
        references.push(value);
    });
    if (references.length > MAX_REFERENCE_IMAGES) {
        throw new ImageInputError(`Use at most ${MAX_REFERENCE_IMAGES} reference images.`);
    }
    return {
        prompt: prompt.trim(),
        model,
        output_format,
        background,
        output_compression,
        references,
        n: integer(form, 'n', 1, MAX_IMAGES, 1),
        size: choice(form, 'size', IMAGE_SIZES, 'auto'),
        quality: choice(form, 'quality', IMAGE_QUALITIES, 'low'),
        partialImages: integer(form, 'partial_images', 0, 3, 0),
        stream: form.get('stream') === 'true'
    };
}

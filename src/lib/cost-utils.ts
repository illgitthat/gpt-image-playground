export type CostDetails = {
    estimated_cost_usd: number;
    text_input_tokens: number;
    image_input_tokens: number;
    cached_input_tokens: number;
    billable_input_tokens: number;
    image_output_tokens: number;
};

export const GPT_IMAGE_MODELS = ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'] as const;

export type GptImageModel = (typeof GPT_IMAGE_MODELS)[number];

export const MAI_IMAGE_MODELS = ['MAI-Image-2.7'] as const;

export type MaiImageModel = (typeof MAI_IMAGE_MODELS)[number];

export type ImageModel = GptImageModel | MaiImageModel;

export const IMAGE_MODELS: readonly ImageModel[] = [...MAI_IMAGE_MODELS, ...GPT_IMAGE_MODELS];

export const DEFAULT_IMAGE_MODEL: ImageModel = 'MAI-Image-2.7';

export function isGptImageModel(value: unknown): value is GptImageModel {
    return typeof value === 'string' && GPT_IMAGE_MODELS.includes(value as GptImageModel);
}

export function isMaiImageModel(value: unknown): value is MaiImageModel {
    return typeof value === 'string' && MAI_IMAGE_MODELS.includes(value as MaiImageModel);
}

export function isImageModel(value: unknown): value is ImageModel {
    return isGptImageModel(value) || isMaiImageModel(value);
}

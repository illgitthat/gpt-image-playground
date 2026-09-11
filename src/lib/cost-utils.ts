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

export const DEFAULT_GPT_IMAGE_MODEL: GptImageModel = 'gpt-image-2.5-flare';

export function isGptImageModel(value: unknown): value is GptImageModel {
    return typeof value === 'string' && GPT_IMAGE_MODELS.includes(value as GptImageModel);
}

// Pricing for Sora video
const SORA_VIDEO_COST_PER_SECOND = 0.1; // $0.10 per second

/**
 * Estimates Sora video cost based on clip duration.
 * @param seconds - Duration of the requested video in seconds.
 */
export function calculateSoraVideoCost(seconds: number): CostDetails {
    const duration = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    const costUSD = duration * SORA_VIDEO_COST_PER_SECOND;
    const costRounded = Math.round(costUSD * 10000) / 10000;

    return {
        estimated_cost_usd: costRounded,
        text_input_tokens: 0,
        image_input_tokens: 0,
        cached_input_tokens: 0,
        billable_input_tokens: 0,
        image_output_tokens: 0
    };
}

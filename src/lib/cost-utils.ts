type ApiUsage = {
    input_tokens_details?: {
        text_tokens?: number;
        image_tokens?: number;
        cached_tokens?: number;
    };
    output_tokens?: number;
};

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

export type ModelRates = {
    textInputPerToken: number;
    imageInputPerToken: number;
    cachedInputPerToken: number;
    imageOutputPerToken: number;
    textInputPerMillion: number;
    imageInputPerMillion: number;
    imageOutputPerMillion: number;
};

export function isGptImageModel(value: unknown): value is GptImageModel {
    return typeof value === 'string' && GPT_IMAGE_MODELS.includes(value as GptImageModel);
}

// Pricing for Sora video
const SORA_VIDEO_COST_PER_SECOND = 0.1; // $0.10 per second

// Both GPT Image 2.5 models have the same published token rates.
// https://developers.openai.com/api/docs/pricing
export function getModelRates(): ModelRates {
    return {
        textInputPerToken: 0.000005,
        imageInputPerToken: 0.000008,
        cachedInputPerToken: 0.00000125,
        imageOutputPerToken: 0.00003,
        textInputPerMillion: 5,
        imageInputPerMillion: 8,
        imageOutputPerMillion: 30
    };
}

/**
 * Estimates the cost of a GPT image model API call based on token usage.
 * @param usage - The usage object from the OpenAI API response.
 * @param model - The model used.
 * @returns CostDetails object or null if usage data is invalid.
 */
export function calculateApiCost(
    usage: ApiUsage | undefined | null,
    model: GptImageModel = DEFAULT_GPT_IMAGE_MODEL
): CostDetails | null {
    if (
        !isGptImageModel(model) ||
        !usage ||
        !usage.input_tokens_details ||
        usage.input_tokens_details.text_tokens === undefined ||
        usage.input_tokens_details.image_tokens === undefined ||
        usage.output_tokens === undefined ||
        usage.output_tokens === null
    ) {
        console.warn('Invalid or missing usage data for cost calculation:', usage);
        return null;
    }

    const textInT = usage.input_tokens_details.text_tokens ?? 0;
    const imgInT = usage.input_tokens_details.image_tokens ?? 0;
    const cachedInT = usage.input_tokens_details.cached_tokens ?? 0;
    const imgOutT = usage.output_tokens ?? 0;

    if (
        !Number.isFinite(textInT) || textInT < 0 ||
        !Number.isFinite(imgInT) || imgInT < 0 ||
        !Number.isFinite(cachedInT) || cachedInT < 0 ||
        !Number.isFinite(imgOutT) || imgOutT < 0
    ) {
        console.error('Invalid token types in usage data:', usage);
        return null;
    }

    // A combined cached count cannot be priced accurately by modality.
    if (cachedInT > 0) {
        console.warn('Image cost unavailable: cached text/image token breakdown is missing.');
        return null;
    }
    const rates = getModelRates();

    const effectiveTextTokens = Math.max(textInT - cachedInT, 0);
    const billableInputTokens = effectiveTextTokens + imgInT;

    const costUSD =
        effectiveTextTokens * rates.textInputPerToken +
        cachedInT * rates.cachedInputPerToken +
        imgInT * rates.imageInputPerToken +
        imgOutT * rates.imageOutputPerToken;

    const costRounded = Math.round(costUSD * 10000) / 10000;

    return {
        estimated_cost_usd: costRounded,
        text_input_tokens: textInT,
        image_input_tokens: imgInT,
        cached_input_tokens: cachedInT,
        billable_input_tokens: billableInputTokens,
        image_output_tokens: imgOutT
    };
}

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

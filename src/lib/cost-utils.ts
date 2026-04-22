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

export const GPT_IMAGE_MODELS = ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini'] as const;

export type GptImageModel = (typeof GPT_IMAGE_MODELS)[number];

export const DEFAULT_GPT_IMAGE_MODEL: GptImageModel = 'gpt-image-2';

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

// Pricing for gpt-image-1
const GPT_IMAGE_1_TEXT_INPUT_COST_PER_TOKEN = 0.000005; // $5.00/1M
const GPT_IMAGE_1_IMAGE_INPUT_COST_PER_TOKEN = 0.00001; // $10.00/1M
const GPT_IMAGE_1_IMAGE_OUTPUT_COST_PER_TOKEN = 0.00004; // $40.00/1M
const GPT_IMAGE_1_CACHED_INPUT_COST_PER_TOKEN = 0.000002; // approximate, aligns with previous cached pricing

// Pricing for gpt-image-1-mini
const GPT_IMAGE_1_MINI_TEXT_INPUT_COST_PER_TOKEN = 0.000002; // $2.00/1M
const GPT_IMAGE_1_MINI_IMAGE_INPUT_COST_PER_TOKEN = 0.0000025; // $2.50/1M
const GPT_IMAGE_1_MINI_IMAGE_OUTPUT_COST_PER_TOKEN = 0.000008; // $8.00/1M
const GPT_IMAGE_1_MINI_CACHED_INPUT_COST_PER_TOKEN = 0.0000008; // rough parity with cached discount

// Pricing for gpt-image-1.5
const GPT_IMAGE_1_5_TEXT_INPUT_COST_PER_TOKEN = 0.000005; // $5.00/1M
const GPT_IMAGE_1_5_IMAGE_INPUT_COST_PER_TOKEN = 0.000008; // $8.00/1M
const GPT_IMAGE_1_5_IMAGE_OUTPUT_COST_PER_TOKEN = 0.000032; // $32.00/1M
const GPT_IMAGE_1_5_CACHED_INPUT_COST_PER_TOKEN = 0.000002; // from prior implementation

// Pricing for gpt-image-2
const GPT_IMAGE_2_TEXT_INPUT_COST_PER_TOKEN = 0.000005; // $5.00/1M
const GPT_IMAGE_2_IMAGE_INPUT_COST_PER_TOKEN = 0.000008; // $8.00/1M
const GPT_IMAGE_2_IMAGE_OUTPUT_COST_PER_TOKEN = 0.00003; // $30.00/1M
const GPT_IMAGE_2_CACHED_INPUT_COST_PER_TOKEN = 0.000002; // approximate parity with current cached pricing

export function getModelRates(model: GptImageModel): ModelRates {
    if (model === 'gpt-image-1-mini') {
        return {
            textInputPerToken: GPT_IMAGE_1_MINI_TEXT_INPUT_COST_PER_TOKEN,
            imageInputPerToken: GPT_IMAGE_1_MINI_IMAGE_INPUT_COST_PER_TOKEN,
            cachedInputPerToken: GPT_IMAGE_1_MINI_CACHED_INPUT_COST_PER_TOKEN,
            imageOutputPerToken: GPT_IMAGE_1_MINI_IMAGE_OUTPUT_COST_PER_TOKEN,
            textInputPerMillion: 2,
            imageInputPerMillion: 2.5,
            imageOutputPerMillion: 8
        };
    }

    if (model === 'gpt-image-1.5') {
        return {
            textInputPerToken: GPT_IMAGE_1_5_TEXT_INPUT_COST_PER_TOKEN,
            imageInputPerToken: GPT_IMAGE_1_5_IMAGE_INPUT_COST_PER_TOKEN,
            cachedInputPerToken: GPT_IMAGE_1_5_CACHED_INPUT_COST_PER_TOKEN,
            imageOutputPerToken: GPT_IMAGE_1_5_IMAGE_OUTPUT_COST_PER_TOKEN,
            textInputPerMillion: 5,
            imageInputPerMillion: 8,
            imageOutputPerMillion: 32
        };
    }

    if (model === 'gpt-image-2') {
        return {
            textInputPerToken: GPT_IMAGE_2_TEXT_INPUT_COST_PER_TOKEN,
            imageInputPerToken: GPT_IMAGE_2_IMAGE_INPUT_COST_PER_TOKEN,
            cachedInputPerToken: GPT_IMAGE_2_CACHED_INPUT_COST_PER_TOKEN,
            imageOutputPerToken: GPT_IMAGE_2_IMAGE_OUTPUT_COST_PER_TOKEN,
            textInputPerMillion: 5,
            imageInputPerMillion: 8,
            imageOutputPerMillion: 30
        };
    }

    return {
        textInputPerToken: GPT_IMAGE_1_TEXT_INPUT_COST_PER_TOKEN,
        imageInputPerToken: GPT_IMAGE_1_IMAGE_INPUT_COST_PER_TOKEN,
        cachedInputPerToken: GPT_IMAGE_1_CACHED_INPUT_COST_PER_TOKEN,
        imageOutputPerToken: GPT_IMAGE_1_IMAGE_OUTPUT_COST_PER_TOKEN,
        textInputPerMillion: 5,
        imageInputPerMillion: 10,
        imageOutputPerMillion: 40
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
    if (!usage || !usage.input_tokens_details || usage.output_tokens === undefined || usage.output_tokens === null) {
        console.warn('Invalid or missing usage data for cost calculation:', usage);
        return null;
    }

    const textInT = usage.input_tokens_details.text_tokens ?? 0;
    const imgInT = usage.input_tokens_details.image_tokens ?? 0;
    const cachedInT = usage.input_tokens_details.cached_tokens ?? 0;
    const imgOutT = usage.output_tokens ?? 0;

    if (
        typeof textInT !== 'number' ||
        typeof imgInT !== 'number' ||
        typeof cachedInT !== 'number' ||
        typeof imgOutT !== 'number'
    ) {
        console.error('Invalid token types in usage data:', usage);
        return null;
    }

    const rates = getModelRates(model);

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

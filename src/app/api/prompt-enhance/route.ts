import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { buildPromptEnhanceInput, type PromptEnhanceImagePayload } from '@/lib/prompt-enhance';

const config = {
    apiKey: process.env.AZURE_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.AZURE_OPENAI_ENDPOINT || process.env.OPENAI_API_BASE_URL,
    enhanceDeployment: process.env.AZURE_OPENAI_PROMPT_ENHANCE_DEPLOYMENT_NAME
};

const promptEnhanceModel = process.env.PROMPT_ENHANCE_MODEL || 'gpt-5.3-chat';
const useCustomEndpoint = Boolean(process.env.AZURE_OPENAI_ENDPOINT);

// Fall back: AZURE_OPENAI_PROMPT_ENHANCE_DEPLOYMENT_NAME -> PROMPT_ENHANCE_MODEL
const modelToUse = config.enhanceDeployment || promptEnhanceModel;

function sha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function sanitizeReferenceImages(input: unknown): PromptEnhanceImagePayload[] {
    if (!Array.isArray(input)) return [];

    const maxImages = 5;
    const sanitized: PromptEnhanceImagePayload[] = [];

    for (const candidate of input) {
        if (sanitized.length >= maxImages) break;

        if (typeof candidate === 'string') {
            if (candidate.startsWith('data:image')) {
                sanitized.push({ dataUrl: candidate });
            }
            continue;
        }

        if (candidate && typeof candidate === 'object') {
            const dataUrl = typeof (candidate as { dataUrl?: string }).dataUrl === 'string'
                ? (candidate as { dataUrl?: string }).dataUrl
                : undefined;
            const alt = typeof (candidate as { alt?: string }).alt === 'string'
                ? (candidate as { alt?: string }).alt
                : undefined;

            if (dataUrl && dataUrl.startsWith('data:image')) {
                sanitized.push({ dataUrl, alt });
            }
        }
    }

    return sanitized;
}

export async function POST(request: NextRequest) {
    if (!config.apiKey) {
        return NextResponse.json({ error: 'Server configuration error: API key not found.' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const prompt = (body?.prompt as string | undefined)?.trim();
        const mode = body?.mode as 'generate' | 'video' | undefined;
        const referenceImages = sanitizeReferenceImages(body?.referenceImages);
        const videoHasReferenceImage = Boolean(body?.videoHasReferenceImage) || referenceImages.length > 0;
        const clientPasswordHash = body?.passwordHash as string | undefined;

        if (!prompt || !mode) {
            return NextResponse.json({ error: 'Missing required parameters: prompt and mode.' }, { status: 400 });
        }

        if (process.env.APP_PASSWORD) {
            if (!clientPasswordHash) {
                return NextResponse.json({ error: 'Unauthorized: Missing password hash.' }, { status: 401 });
            }
            const serverPasswordHash = sha256(process.env.APP_PASSWORD);
            if (clientPasswordHash !== serverPasswordHash) {
                return NextResponse.json({ error: 'Unauthorized: Invalid password.' }, { status: 401 });
            }
        }

        const { instructions, input } = buildPromptEnhanceInput(mode, prompt, {
            referenceImages,
            videoHasReferenceImage
        });

        const apiClient = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL,
            defaultHeaders: useCustomEndpoint ? { 'api-key': config.apiKey! } : undefined
        });

        const response = await apiClient.responses.create({
            model: modelToUse,
            instructions,
            input
        });

        const enhanced = response.output_text?.trim() || '';

        if (!enhanced) {
            return NextResponse.json({ error: 'Failed to enhance prompt.' }, { status: 502 });
        }

        return NextResponse.json({ prompt: enhanced });
    } catch (error: unknown) {
        console.error('Error in /api/prompt-enhance:', error);

        if (error instanceof Error && 'status' in error && typeof (error as { status?: number }).status === 'number') {
            return NextResponse.json({ error: error.message }, { status: (error as { status: number }).status });
        }

        return NextResponse.json({ error: 'An unexpected error occurred while enhancing the prompt.' }, { status: 500 });
    }
}

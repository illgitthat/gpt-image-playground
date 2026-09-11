import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { buildPromptEnhanceInput, parsePromptReferenceImages, PromptReferenceImageError } from '@/lib/prompt-enhance';

const config = {
    apiKey: process.env.AZURE_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.AZURE_OPENAI_ENDPOINT || process.env.OPENAI_API_BASE_URL
};

const promptEnhanceModel = process.env.AZURE_OPENAI_TEXT_MODEL || 'gpt-chat-latest';
const useCustomEndpoint = Boolean(process.env.AZURE_OPENAI_ENDPOINT);

const modelToUse = promptEnhanceModel;

function sha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
}

export async function POST(request: NextRequest) {
    if (!config.apiKey) {
        return NextResponse.json({ error: 'Server configuration error: API key not found.' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
        const mode = body?.mode as 'generate' | 'video' | undefined;
        const clientPasswordHash = body?.passwordHash as string | undefined;

        if (!prompt || (mode !== 'generate' && mode !== 'video')) {
            return NextResponse.json({ error: 'A prompt and a mode of "generate" or "video" are required.' }, { status: 400 });
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

        const referenceImages = parsePromptReferenceImages(body?.referenceImages);
        const videoHasReferenceImage = Boolean(body?.videoHasReferenceImage) || referenceImages.length > 0;
        const { instructions, input } = buildPromptEnhanceInput(mode, prompt, {
            referenceImages,
            videoHasReferenceImage
        });

        const apiClient = new OpenAI({
            apiKey: useCustomEndpoint ? 'unused' : config.apiKey,
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
        if (error instanceof PromptReferenceImageError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        console.error('Error in /api/prompt-enhance:', error);

        if (error instanceof Error && 'status' in error && typeof (error as { status?: number }).status === 'number') {
            return NextResponse.json({ error: error.message }, { status: (error as { status: number }).status });
        }

        return NextResponse.json({ error: 'An unexpected error occurred while enhancing the prompt.' }, { status: 500 });
    }
}

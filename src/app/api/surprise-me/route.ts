import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { buildSurpriseMeInput, type PromptEnhanceImagePayload } from '@/lib/prompt-enhance';

const config = {
    apiKey: process.env.AZURE_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.AZURE_OPENAI_ENDPOINT || process.env.OPENAI_API_BASE_URL,
    enhanceDeployment: process.env.AZURE_OPENAI_PROMPT_ENHANCE_DEPLOYMENT_NAME
};

const promptEnhanceModel = process.env.PROMPT_ENHANCE_MODEL || 'gpt-5.3-chat';
const useCustomEndpoint = Boolean(process.env.AZURE_OPENAI_ENDPOINT);
const modelToUse = config.enhanceDeployment || promptEnhanceModel;
const ALLOWED_REFERENCE_IMAGE_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif'
]);
const MAX_REFERENCE_IMAGE_DATA_URL_LENGTH = 7 * 1024 * 1024;
const MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024;

class PayloadTooLargeError extends Error {
    status: number;

    constructor(message: string) {
        super(message);
        this.name = 'PayloadTooLargeError';
        this.status = 413;
    }
}

function sha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function sanitizeReferenceImageDataUrl(dataUrl: string): string | undefined {
    if (!dataUrl.startsWith('data:image')) {
        return undefined;
    }

    if (dataUrl.length > MAX_REFERENCE_IMAGE_DATA_URL_LENGTH) {
        throw new PayloadTooLargeError('Reference image payload is too large.');
    }

    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
    if (!match) {
        return undefined;
    }

    const mimeType = match[1].toLowerCase();
    if (!ALLOWED_REFERENCE_IMAGE_MIME_TYPES.has(mimeType)) {
        return undefined;
    }

    const base64Payload = match[2].replace(/\s+/g, '');
    const paddingLength = base64Payload.endsWith('==') ? 2 : base64Payload.endsWith('=') ? 1 : 0;
    const decodedBytes = Math.floor((base64Payload.length * 3) / 4) - paddingLength;

    if (decodedBytes > MAX_REFERENCE_IMAGE_BYTES) {
        throw new PayloadTooLargeError('Reference image payload is too large.');
    }

    return dataUrl;
}

function sanitizeReferenceImages(input: unknown): PromptEnhanceImagePayload[] {
    if (!Array.isArray(input)) return [];

    const maxImages = 5;
    const sanitized: PromptEnhanceImagePayload[] = [];

    for (const candidate of input) {
        if (sanitized.length >= maxImages) break;

        if (typeof candidate === 'string') {
            const dataUrl = sanitizeReferenceImageDataUrl(candidate);
            if (dataUrl) {
                sanitized.push({ dataUrl });
            }
            continue;
        }

        if (candidate && typeof candidate === 'object') {
            const dataUrl = typeof (candidate as { dataUrl?: string }).dataUrl === 'string'
                ? sanitizeReferenceImageDataUrl((candidate as { dataUrl?: string }).dataUrl as string)
                : undefined;
            const alt = typeof (candidate as { alt?: string }).alt === 'string'
                ? (candidate as { alt?: string }).alt
                : undefined;

            if (dataUrl) {
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

    try {
        const body = await request.json();
        const mode = body?.mode as 'generate' | undefined;
        const referenceImages = sanitizeReferenceImages(body?.referenceImages);
        const clientPasswordHash = body?.passwordHash as string | undefined;

        if (!mode || mode !== 'generate') {
            return NextResponse.json({ error: 'Missing or invalid parameter: mode must be "generate".' }, { status: 400 });
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

        const { instructions, input } = buildSurpriseMeInput(mode, { referenceImages });

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

        const surprise = response.output_text?.trim() || '';

        if (!surprise) {
            return NextResponse.json({ error: 'Failed to generate a surprise prompt.' }, { status: 502 });
        }

        return NextResponse.json({ prompt: surprise });
    } catch (error: unknown) {
        console.error('Error in /api/surprise-me:', error);

        if (error instanceof Error && 'status' in error && typeof (error as { status?: number }).status === 'number') {
            return NextResponse.json({ error: error.message }, { status: (error as { status: number }).status });
        }

        return NextResponse.json({ error: 'An unexpected error occurred while generating a surprise prompt.' }, { status: 500 });
    }
    } catch (error) {
        if (error instanceof PayloadTooLargeError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }

        throw error;
    }
}

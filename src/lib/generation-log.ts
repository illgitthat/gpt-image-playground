import fs from 'fs/promises';
import path from 'path';

export type ImageGenerationLogEntry = {
    time: string;
    status: 'ok' | 'partial' | 'error' | 'cancelled' | 'rate_limited';
    model: string;
    prompt: string;
    n: number;
    size: string;
    quality: string;
    output_format: string;
    background: string;
    references: number;
    streamed: boolean;
    completed: number;
    files: string[];
    duration_ms: number;
    ip?: string;
    user_agent?: string;
    error?: string;
};

// One JSON object per line. IMAGE_LOG_FILE=off disables logging.
function logFilePath(): string | null {
    const configured = process.env.IMAGE_LOG_FILE?.trim();
    if (configured === 'off') return null;
    return path.resolve(process.cwd(), configured || 'logs/image-generations.jsonl');
}

export function clientInfo(headers: Headers): { ip?: string; user_agent?: string } {
    // Prefer X-Real-IP, which the reverse proxy sets from the connection; fall back to the first forwarded hop.
    const ip = headers.get('x-real-ip')?.trim() || headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
    const user_agent = headers.get('user-agent')?.slice(0, 300) || undefined;
    return { ip, user_agent };
}

let ensuredDir: string | null = null;

export async function logImageGeneration(entry: ImageGenerationLogEntry): Promise<void> {
    const file = logFilePath();
    if (!file) return;
    try {
        const dir = path.dirname(file);
        if (ensuredDir !== dir) {
            await fs.mkdir(dir, { recursive: true });
            ensuredDir = dir;
        }
        await fs.appendFile(file, `${JSON.stringify(entry)}\n`);
    } catch (error) {
        // Logging must never break image generation.
        console.error('Failed to write image generation log:', error);
    }
}

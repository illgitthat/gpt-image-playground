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
    return path.resolve(/* turbopackIgnore: true */ process.cwd(), configured || 'logs/image-generations.jsonl');
}

// IPv6 clients usually get a whole /64, and each device picks its own address in it.
// Group IPv6 by /64 so per-IP limits apply per network rather than per device address.
export function limitKeyForIp(ip: string | undefined): string | undefined {
    if (!ip || !ip.includes(':')) return ip;
    const [head, tail = ''] = ip.toLowerCase().split('::');
    const left = head ? head.split(':') : [];
    const right = tail ? tail.split(':') : [];
    const full = ip.includes('::')
        ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
        : left;
    if (full.length !== 8) return ip;
    return `${full
        .slice(0, 4)
        .map((part) => part.replace(/^0+(?=.)/, ''))
        .join(':')}::/64`;
}

export function clientInfo(headers: Headers): { ip?: string; user_agent?: string } {
    // Prefer X-Real-IP, which the reverse proxy sets from the connection; fall back to the first forwarded hop.
    const ip = headers.get('x-real-ip')?.trim() || headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
    const user_agent = headers.get('user-agent')?.slice(0, 300) || undefined;
    return { ip, user_agent };
}

let ensuredDir: string | null = null;

export type VideoGenerationLogEntry = {
    time: string;
    kind: 'video';
    status: 'ok' | 'error' | 'rate_limited';
    model: string;
    prompt: string;
    seconds: number;
    resolution: string;
    // 1 when the video starts from an image.
    references: number;
    // The file the finished video is saved as.
    files: string[];
    estimated_cost_usd: number;
    ip?: string;
    user_agent?: string;
    error?: string;
};

export function logImageGeneration(entry: ImageGenerationLogEntry): Promise<void> {
    return appendLog(entry);
}

// Videos share the image log; `kind: 'video'` tells the rows apart.
export function logVideoGeneration(entry: VideoGenerationLogEntry): Promise<void> {
    return appendLog(entry);
}

async function appendLog(entry: ImageGenerationLogEntry | VideoGenerationLogEntry): Promise<void> {
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
        // Logging must never break a generation.
        console.error('Failed to write image generation log:', error);
    }
}

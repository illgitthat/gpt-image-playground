// Per-client-IP usage caps for the public app. In-memory: one server process,
// resets on restart. The gateway and per-model quota still apply on top.

export type LimitScope = 'image' | 'text' | 'video';

type Window = { label: string; ms: number; env: string; fallback: number };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const WINDOWS: Record<LimitScope, Window[]> = {
    image: [
        { label: 'hour', ms: HOUR, env: 'IMAGE_LIMIT_PER_IP_HOUR', fallback: 60 },
        { label: 'day', ms: DAY, env: 'IMAGE_LIMIT_PER_IP_DAY', fallback: 250 }
    ],
    text: [{ label: 'hour', ms: HOUR, env: 'TEXT_LIMIT_PER_IP_HOUR', fallback: 120 }],
    video: [{ label: 'day', ms: DAY, env: 'VIDEO_LIMIT_PER_IP_DAY', fallback: 10 }]
};

function limitFor(window: Window): number {
    const raw = process.env[window.env];
    const value = raw === undefined || raw.trim() === '' ? window.fallback : Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : window.fallback;
}

export type IpLimitResult = { allowed: true } | { allowed: false; retryAfter: number; message: string };

export function createIpLimiter() {
    const usage = new Map<string, number[]>();
    let lastSweep = 0;

    function sweep(now: number) {
        if (now - lastSweep < HOUR) return;
        lastSweep = now;
        for (const [key, times] of usage) {
            const recent = times.filter((time) => now - time < DAY);
            if (recent.length) usage.set(key, recent);
            else usage.delete(key);
        }
    }

    return {
        // Records `count` units for this IP if every window has room; otherwise records nothing.
        take(scope: LimitScope, ip: string | undefined, count = 1, now = Date.now()): IpLimitResult {
            sweep(now);
            const key = `${scope}:${ip || 'unknown'}`;
            const times = (usage.get(key) ?? []).filter((time) => now - time < DAY);
            for (const window of WINDOWS[scope]) {
                const limit = limitFor(window);
                if (limit === 0) continue;
                const inWindow = times.filter((time) => now - time < window.ms);
                if (inWindow.length + count > limit) {
                    // The window frees up once enough of its oldest entries age out.
                    const freeAt = inWindow[Math.max(0, inWindow.length + count - limit - 1)] + window.ms;
                    const retryAfter = Math.max(1, Math.ceil((freeAt - now) / 1000));
                    const unit = scope === 'text' ? 'prompt requests' : `${scope}s`;
                    return {
                        allowed: false,
                        retryAfter,
                        message: `This site allows ${limit} ${unit} per ${window.label} from each network. Try again in ${formatWait(retryAfter)}.`
                    };
                }
            }
            usage.set(key, [...times, ...Array<number>(count).fill(now)]);
            return { allowed: true };
        }
    };
}

function formatWait(seconds: number): string {
    if (seconds < 90) return `${seconds} seconds`;
    if (seconds < 90 * 60) return `${Math.ceil(seconds / 60)} minutes`;
    return `${Math.ceil(seconds / 3600)} hours`;
}

// Shared across route bundles in this server process.
const globalStore = globalThis as typeof globalThis & { __ipLimiter?: ReturnType<typeof createIpLimiter> };
export const ipLimiter = (globalStore.__ipLimiter ??= createIpLimiter());

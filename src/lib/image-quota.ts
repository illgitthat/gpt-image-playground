import type { GptImageModel } from './cost-utils';
import { MAX_IMAGES } from './image-options';

const WINDOW_MS = 60_000;

// This guards a single server process; the gateway remains the quota authority.
export function createImageQuota() {
    const starts = new Map<GptImageModel, number[]>();
    return {
        reserve(model: GptImageModel, count: number, now = Date.now()): number {
            const recent = (starts.get(model) ?? []).filter((start) => now - start < WINDOW_MS);
            if (recent.length + count > MAX_IMAGES) {
                const releaseAt = recent[recent.length + count - MAX_IMAGES - 1] + WINDOW_MS;
                return Math.max(1, Math.ceil((releaseAt - now) / 1000));
            }
            starts.set(model, [...recent, ...Array<number>(count).fill(now)]);
            return 0;
        },
        defer(model: GptImageModel, retryAfterSeconds: number) {
            const now = Date.now();
            starts.set(model, Array<number>(MAX_IMAGES).fill(now + retryAfterSeconds * 1000 - WINDOW_MS));
        }
    };
}

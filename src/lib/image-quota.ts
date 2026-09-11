import type { GptImageModel } from './cost-utils';
import { IMAGE_REQUESTS_PER_MINUTE } from './image-options';

const WINDOW_MS = 60_000;

// This guards a single server process; the gateway remains the quota authority.
export function createImageQuota() {
    const starts = new Map<GptImageModel, number[]>();
    const blockedUntil = new Map<GptImageModel, number>();
    return {
        reserve(model: GptImageModel, count: number, now = Date.now()): number {
            if (!Number.isInteger(count) || count < 1 || count > IMAGE_REQUESTS_PER_MINUTE) {
                throw new RangeError(`Reserve between 1 and ${IMAGE_REQUESTS_PER_MINUTE} image requests.`);
            }
            const recent = (starts.get(model) ?? []).filter((start) => now - start < WINDOW_MS);
            const releaseAt =
                recent.length + count > IMAGE_REQUESTS_PER_MINUTE
                    ? recent[recent.length + count - IMAGE_REQUESTS_PER_MINUTE - 1] + WINDOW_MS
                    : now;
            const retryAfter = Math.ceil((Math.max(releaseAt, blockedUntil.get(model) ?? now) - now) / 1000);
            if (retryAfter > 0) {
                return retryAfter;
            }
            starts.set(model, [...recent, ...Array<number>(count).fill(now)]);
            return 0;
        },
        defer(model: GptImageModel, retryAfterSeconds: number, now = Date.now()) {
            if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
                throw new RangeError('Retry delay must be a positive number of seconds.');
            }
            blockedUntil.set(model, Math.max(blockedUntil.get(model) ?? now, now + retryAfterSeconds * 1000));
        }
    };
}

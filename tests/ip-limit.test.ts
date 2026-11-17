import { createIpLimiter } from '../src/lib/ip-limit';
import { afterEach, describe, expect, test } from 'bun:test';

const saved = { ...process.env };
afterEach(() => {
    for (const key of ['IMAGE_LIMIT_PER_IP_HOUR', 'IMAGE_LIMIT_PER_IP_DAY', 'TEXT_LIMIT_PER_IP_HOUR']) {
        if (key in saved) process.env[key] = saved[key];
        else delete process.env[key];
    }
});

describe('per-IP limiter', () => {
    test('caps images per hour per IP and reports when the window frees', () => {
        process.env.IMAGE_LIMIT_PER_IP_HOUR = '3';
        const limiter = createIpLimiter();
        const t0 = 1_000_000_000;
        expect(limiter.take('image', '1.1.1.1', 2, t0).allowed).toBe(true);
        expect(limiter.take('image', '1.1.1.1', 1, t0 + 1000).allowed).toBe(true);
        const blocked = limiter.take('image', '1.1.1.1', 1, t0 + 2000);
        expect(blocked.allowed).toBe(false);
        if (!blocked.allowed) {
            expect(blocked.retryAfter).toBe(3598);
            expect(blocked.message).toContain('3 images per hour');
        }
        expect(limiter.take('image', '2.2.2.2', 1, t0 + 2000).allowed).toBe(true);
        expect(limiter.take('image', '1.1.1.1', 1, t0 + 60 * 60 * 1000).allowed).toBe(true);
    });

    test('a rejected batch records nothing, and the daily cap spans hours', () => {
        process.env.IMAGE_LIMIT_PER_IP_HOUR = '0';
        process.env.IMAGE_LIMIT_PER_IP_DAY = '4';
        const limiter = createIpLimiter();
        const t0 = 2_000_000_000;
        expect(limiter.take('image', 'a', 2, t0).allowed).toBe(true);
        expect(limiter.take('image', 'a', 3, t0 + 1000).allowed).toBe(false);
        expect(limiter.take('image', 'a', 2, t0 + 5 * 60 * 60 * 1000).allowed).toBe(true);
        expect(limiter.take('image', 'a', 1, t0 + 6 * 60 * 60 * 1000).allowed).toBe(false);
    });

    test('scopes are counted separately', () => {
        process.env.TEXT_LIMIT_PER_IP_HOUR = '1';
        const limiter = createIpLimiter();
        expect(limiter.take('text', 'a', 1, 0).allowed).toBe(true);
        expect(limiter.take('text', 'a', 1, 0).allowed).toBe(false);
        expect(limiter.take('image', 'a', 1, 0).allowed).toBe(true);
    });
});

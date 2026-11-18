export type ByteRange = { start: number; end: number };

// Parses a single `Range: bytes=…` header against a file size. Returns null when there is no usable
// range (serve the whole file) and 'invalid' when the range cannot be satisfied (answer 416).
export function parseByteRange(header: string | null, size: number): ByteRange | null | 'invalid' {
    if (!header) return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match || (match[1] === '' && match[2] === '')) return null;
    if (size === 0) return 'invalid';
    if (match[1] === '') {
        // Suffix form: the last N bytes.
        const length = Number(match[2]);
        if (length === 0) return 'invalid';
        return { start: Math.max(0, size - length), end: size - 1 };
    }
    const start = Number(match[1]);
    const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
    if (start >= size || start > end) return 'invalid';
    return { start, end };
}

import type { Stats } from 'fs';
import fs from 'fs/promises';
import path from 'path';

// Saved PNGs may later be recompressed to WebP under the same basename. Older
// history entries still reference the .png name, so fall back to the .webp.
export function storedImageCandidates(baseDir: string, filename: string): string[] {
    const primary = path.join(baseDir, filename);
    return /\.png$/i.test(filename) ? [primary, primary.replace(/\.png$/i, '.webp')] : [primary];
}

export async function findStoredImage(
    baseDir: string,
    filename: string
): Promise<{ filepath: string; stat: Stats } | null> {
    for (const filepath of storedImageCandidates(baseDir, filename)) {
        try {
            return { filepath, stat: await fs.stat(filepath) };
        } catch (error: unknown) {
            if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')) {
                throw error;
            }
        }
    }
    return null;
}

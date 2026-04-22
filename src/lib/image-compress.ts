/**
 * Client-side image compression for uploads.
 *
 * gpt-image / Sora accept inputs up to ~2048px on the long side. Reference
 * photos coming straight from a phone camera or screenshot tool are commonly
 * 4–12 MB, which inflates ~33% more once base64-encoded and bloats the
 * multipart upload + base64 round-trip into the model. Downscaling and
 * re-encoding to WebP before sending typically cuts payload size 5–20× with
 * no visible quality loss for reference imagery.
 *
 * The function is a no-op (returns the original `File`) when:
 *   - running outside the browser (no `document` / `createImageBitmap`),
 *   - the image is already small enough,
 *   - decoding or re-encoding fails (we never want to break uploads).
 */

export type CompressOptions = {
    /** Max dimension (width or height) in pixels. */
    maxDimension?: number;
    /** WebP encoder quality, 0–1. */
    quality?: number;
    /** Skip compression entirely if the file is below this size in bytes. */
    skipIfSmallerThan?: number;
    /** Output MIME type. PNG inputs are kept as PNG by default to preserve alpha. */
    mimeType?: 'image/webp' | 'image/jpeg' | 'image/png';
};

const DEFAULTS: Required<Omit<CompressOptions, 'mimeType'>> = {
    maxDimension: 2048,
    quality: 0.92,
    // ~700 KB: small uploads aren't worth the CPU + format-change side effects.
    skipIfSmallerThan: 700 * 1024
};

function isBrowserCompressible(): boolean {
    return (
        typeof window !== 'undefined' &&
        typeof document !== 'undefined' &&
        typeof createImageBitmap === 'function' &&
        typeof HTMLCanvasElement !== 'undefined'
    );
}

function pickOutputMime(file: File, override?: CompressOptions['mimeType']): 'image/webp' | 'image/jpeg' | 'image/png' {
    if (override) return override;
    // Preserve PNG to keep potential alpha channels intact.
    if (file.type === 'image/png') return 'image/png';
    return 'image/webp';
}

function extensionFor(mime: string): string {
    if (mime === 'image/webp') return 'webp';
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/png') return 'png';
    return 'bin';
}

function renameWithExtension(originalName: string, ext: string): string {
    const lastDot = originalName.lastIndexOf('.');
    const base = lastDot > 0 ? originalName.slice(0, lastDot) : originalName;
    return `${base}.${ext}`;
}

async function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), mime, quality);
    });
}

/**
 * Compress and/or downscale an image `File` for upload. Returns a new `File`
 * (with adjusted name + type) on success, or the original `File` when
 * compression isn't beneficial or isn't possible.
 */
export async function compressImageForUpload(file: File, options: CompressOptions = {}): Promise<File> {
    // SVG / GIF / unknown — do not touch (rasterising would lose animation/vectors).
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
        return file;
    }

    if (!isBrowserCompressible()) {
        return file;
    }

    const maxDimension = options.maxDimension ?? DEFAULTS.maxDimension;
    const quality = options.quality ?? DEFAULTS.quality;
    const skipIfSmallerThan = options.skipIfSmallerThan ?? DEFAULTS.skipIfSmallerThan;

    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch (err) {
        console.warn('compressImageForUpload: createImageBitmap failed, sending original', err);
        return file;
    }

    try {
        const { width, height } = bitmap;
        const longest = Math.max(width, height);
        const needsDownscale = longest > maxDimension;

        // Skip if already small AND no downscale needed AND format is already efficient.
        if (!needsDownscale && file.size <= skipIfSmallerThan) {
            return file;
        }

        const scale = needsDownscale ? maxDimension / longest : 1;
        const targetW = Math.max(1, Math.round(width * scale));
        const targetH = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return file;
        }
        ctx.drawImage(bitmap, 0, 0, targetW, targetH);

        const outMime = pickOutputMime(file, options.mimeType);
        const blob = await canvasToBlob(canvas, outMime, quality);
        if (!blob) {
            return file;
        }

        // If re-encoding actually grew the file (e.g. tiny PNG icon), keep original.
        if (blob.size >= file.size && !needsDownscale) {
            return file;
        }

        const newName = renameWithExtension(file.name || 'image', extensionFor(outMime));
        return new File([blob], newName, { type: outMime, lastModified: Date.now() });
    } catch (err) {
        console.warn('compressImageForUpload: compression failed, sending original', err);
        return file;
    } finally {
        bitmap.close?.();
    }
}

/** Compress an array of files in parallel, preserving order. */
export async function compressImagesForUpload(files: File[], options?: CompressOptions): Promise<File[]> {
    return Promise.all(files.map((f) => compressImageForUpload(f, options)));
}

export async function fetchDownloadImage(url: string): Promise<Blob> {
    let response: Response;
    try {
        response = await fetch(url);
    } catch (error) {
        throw new Error('Download failed. Check your connection and try again.', { cause: error });
    }
    if (!response.ok) {
        throw new Error(
            response.status === 404
                ? 'File not found. It may have been deleted.'
                : `Download failed (${response.status}). Try again.`
        );
    }
    const blob = await response.blob();
    if (!(blob.type.startsWith('image/') || blob.type.startsWith('video/')) || blob.size === 0) {
        throw new Error('The response is not an image or video. Try again.');
    }
    return blob;
}

// Recompressed history images keep their old .png names but are served as WebP.
export function filenameForBlob(blob: Blob, filename: string): string {
    return blob.type === 'image/webp' ? filename.replace(/\.png$/i, '.webp') : filename;
}

type ShareNavigator = {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[] }) => Promise<void>;
};

// True when this browser can hand image files to the system share sheet (mostly phones).
export function canShareImages(nav: ShareNavigator | undefined = globalThis.navigator): boolean {
    if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
    try {
        return nav.canShare({ files: [new File([new Uint8Array(1)], 'image.webp', { type: 'image/webp' })] });
    } catch {
        return false;
    }
}

// Opens the system share sheet with the image. Resolves false if the user dismissed it.
export async function shareImage(
    url: string,
    filename: string,
    nav: ShareNavigator = globalThis.navigator
): Promise<boolean> {
    const blob = await fetchDownloadImage(url);
    const file = new File([blob], filenameForBlob(blob, filename), { type: blob.type });
    if (typeof nav.share !== 'function' || !nav.canShare?.({ files: [file] })) {
        throw new Error('Sharing is not supported in this browser. Use Download instead.');
    }
    try {
        await nav.share({ files: [file] });
        return true;
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return false;
        throw new Error('Sharing failed. Use Download instead.', { cause: error });
    }
}

export async function downloadImage(url: string, filename: string): Promise<void> {
    const blob = await fetchDownloadImage(url);
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    try {
        link.href = blobUrl;
        link.download = filenameForBlob(blob, filename);
        document.body.appendChild(link);
        link.click();
    } finally {
        link.remove();
        // Let the browser start reading the download before releasing its URL.
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }
}

// A readable download name from the prompt, e.g. "cozy-log-cabin-in-a-snowy-2.webp".
// Falls back to the stored name when the prompt has nothing usable.
export function downloadName(prompt: string, filename: string, index = 0): string {
    const extension = /\.[a-z0-9]+$/i.exec(filename)?.[0] ?? '';
    const words = prompt
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean)
        .slice(0, 6);
    const slug = words.join('-').slice(0, 48).replace(/-+$/, '');
    if (!slug) return filename;
    return `${slug}${index > 0 ? `-${index + 1}` : ''}${extension}`;
}

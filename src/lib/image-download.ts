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
                ? 'Image not found. It may have been deleted.'
                : `Download failed (${response.status}). Try again.`
        );
    }
    const blob = await response.blob();
    if (!blob.type.startsWith('image/') || blob.size === 0) {
        throw new Error('The response is not an image. Try again.');
    }
    return blob;
}

export async function downloadImage(url: string, filename: string): Promise<void> {
    const blob = await fetchDownloadImage(url);
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    try {
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
    } finally {
        link.remove();
        // Let the browser start reading the download before releasing its URL.
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }
}

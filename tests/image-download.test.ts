import {
    canShareImages,
    downloadImage,
    downloadName,
    fetchDownloadImage,
    filenameForBlob,
    shareImage
} from '../src/lib/image-download';
import { afterAll, describe, expect, test } from 'bun:test';

const image = new Uint8Array([137, 80, 78, 71]);
const server = Bun.serve({
    port: 0,
    fetch(request) {
        switch (new URL(request.url).pathname) {
            case '/ok':
                return new Response(image, { headers: { 'Content-Type': 'image/png' } });
            case '/empty':
                return new Response('', { headers: { 'Content-Type': 'image/png' } });
            case '/wrong-type':
                return Response.json({ error: 'Not an image' });
            default:
                return new Response('Not found', { status: 404 });
        }
    }
});
afterAll(() => server.stop(true));

describe('image downloads', () => {
    test('returns the exact image bytes and MIME type', async () => {
        const blob = await fetchDownloadImage(`${server.url}ok`);
        expect(blob.type).toBe('image/png');
        expect(new Uint8Array(await blob.arrayBuffer())).toEqual(image);
    });

    test('rejects a missing image before starting a browser download', async () => {
        await expect(downloadImage(`${server.url}missing`, 'image.png')).rejects.toThrow('File not found');
    });

    test.each(['empty', 'wrong-type'])('rejects %s responses instead of saving an invalid image', async (path) => {
        await expect(downloadImage(`${server.url}${path}`, 'image.png')).rejects.toThrow('not an image');
    });

    test('names WebP downloads .webp even when the stored name says .png', () => {
        expect(filenameForBlob(new Blob(['x'], { type: 'image/webp' }), 'a.png')).toBe('a.webp');
        expect(filenameForBlob(new Blob(['x'], { type: 'image/png' }), 'a.png')).toBe('a.png');
    });

    test('shares the fetched image as a file when the browser supports it', async () => {
        const shared: File[] = [];
        const nav = {
            canShare: () => true,
            share: async (data: { files: File[] }) => {
                shared.push(...data.files);
            }
        };
        expect(canShareImages(nav)).toBe(true);
        expect(await shareImage(`${server.url}ok`, 'image.png', nav)).toBe(true);
        expect(shared.map((file) => [file.name, file.type, file.size])).toEqual([['image.png', 'image/png', 4]]);
    });

    test('treats a dismissed share sheet as not shared, and reports unsupported browsers', async () => {
        const dismissed = {
            canShare: () => true,
            share: async () => {
                throw new DOMException('cancelled', 'AbortError');
            }
        };
        expect(await shareImage(`${server.url}ok`, 'image.png', dismissed)).toBe(false);
        expect(canShareImages({})).toBe(false);
        expect(canShareImages({ canShare: () => false, share: async () => {} })).toBe(false);
        await expect(shareImage(`${server.url}ok`, 'image.png', {})).rejects.toThrow('not supported');
    });
});

describe('download names', () => {
    test('builds a short readable name from the prompt and keeps the extension', () => {
        expect(downloadName('A cozy log cabin in a snowy pine forest at dusk', '1794-abc-0.webp')).toBe(
            'a-cozy-log-cabin-in-a.webp'
        );
        expect(downloadName('Café “déjà vu”!!', 'x.png')).toBe('cafe-deja-vu.png');
        expect(downloadName('Corgi sticker', 'job-video.mp4')).toBe('corgi-sticker.mp4');
    });

    test('numbers later images in a batch and falls back when the prompt has no usable words', () => {
        expect(downloadName('Corgi sticker', 'x.webp', 1)).toBe('corgi-sticker-2.webp');
        expect(downloadName('', 'job-video.mp4')).toBe('job-video.mp4');
        expect(downloadName('日本語のプロンプト', 'x.webp')).toBe('x.webp');
    });
});

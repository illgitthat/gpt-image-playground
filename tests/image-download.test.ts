import { downloadImage, fetchDownloadImage } from '../src/lib/image-download';
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
        await expect(downloadImage(`${server.url}missing`, 'image.png')).rejects.toThrow('Image not found');
    });

    test.each(['empty', 'wrong-type'])('rejects %s responses instead of saving an invalid image', async (path) => {
        await expect(downloadImage(`${server.url}${path}`, 'image.png')).rejects.toThrow('not an image');
    });
});

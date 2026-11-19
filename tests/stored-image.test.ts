import fs from 'fs';
import { NextRequest } from 'next/server';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, test } from 'vitest';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stored-image-'));
const dir = path.join(root, 'generated-images');
fs.mkdirSync(dir);
fs.writeFileSync(path.join(dir, 'a-0.webp'), 'webp-bytes');
fs.writeFileSync(path.join(dir, 'b-0.png'), 'png-bytes');
fs.writeFileSync(path.join(dir, 'c-0.webp'), 'webp-c');
const originalCwd = process.cwd();
process.chdir(root);
const { GET } = await import('../src/app/api/image/[filename]/route');
const { POST: DELETE_IMAGES } = await import('../src/app/api/image-delete/route');
process.chdir(originalCwd);

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const get = (filename: string) =>
    GET(new NextRequest(`http://localhost/api/image/${filename}`), { params: Promise.resolve({ filename }) });

describe('stored image fallback', () => {
    test('serves a recompressed .webp for an old .png name with the real content type', async () => {
        const response = await get('a-0.png');
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('image/webp');
        expect(await response.text()).toBe('webp-bytes');
    });

    test('prefers an existing .png and 404s when neither exists', async () => {
        expect(await (await get('b-0.png')).text()).toBe('png-bytes');
        expect((await get('missing-0.png')).status).toBe(404);
        expect((await get('../secret.png')).status).toBe(400);
    });

    test('deleting an old .png name removes the recompressed .webp', async () => {
        const response = await DELETE_IMAGES(
            new NextRequest('http://localhost/api/image-delete', {
                method: 'POST',
                body: JSON.stringify({ filenames: ['c-0.png'] })
            })
        );
        expect(response.status).toBe(200);
        expect(fs.existsSync(path.join(dir, 'c-0.webp'))).toBe(false);
    });
});

import { readImageStream } from '../src/lib/image-stream';
import { describe, expect, test } from 'bun:test';

const image = { filename: 'image.png', output_format: 'png', b64_json: 'YWJj' };
const event = (value: object) => `data: ${JSON.stringify(value)}\r\n\r\n`;

function stream(chunks: string[], close = true, onCancel = () => {}) {
    return new Response(
        new ReadableStream({
            start(controller) {
                for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
                if (close) controller.close();
            },
            cancel: onCancel
        })
    );
}

describe('image streaming', () => {
    test('handles split frames and reports actual completions without counting duplicate events', async () => {
        const controller = new AbortController();
        const frames =
            ': keep-alive\r\n\r\n' +
            event({ type: 'partial_image', index: 0, b64_json: 'preview' }) +
            event({ type: 'completed', index: 0, ...image }) +
            event({ type: 'completed', index: 0, ...image }) +
            event({ type: 'partial_image', index: 0, b64_json: 'late-preview' }) +
            event({ type: 'done', images: [image] });
        const counts: number[] = [];
        const previews: string[] = [];
        const result = await readImageStream(
            stream([frames.slice(0, 37), frames.slice(37, 100), frames.slice(100)]),
            controller.signal,
            (_, base64) => previews.push(base64),
            (_, __, count) => counts.push(count)
        );
        expect(result.images).toEqual([image]);
        expect(result.cancelled).toBe(false);
        expect(counts).toEqual([1, 1]);
        expect(previews).toEqual(['preview']);
    });

    test('cancels a pending read and keeps completed images, never partial previews', async () => {
        const abort = new AbortController();
        let cancelled = false;
        const result = await readImageStream(
            stream(
                [
                    event({ type: 'partial_image', index: 0, b64_json: 'preview' }),
                    event({ type: 'completed', index: 1, ...image })
                ],
                false,
                () => {
                    cancelled = true;
                }
            ),
            abort.signal,
            () => {},
            () => abort.abort()
        );
        expect(result.cancelled).toBe(true);
        expect(result.images.map((item) => item.filename)).toEqual(['image.png']);
        expect(result.error).toBeUndefined();
        expect(cancelled).toBe(true);
    });

    test('aborting before any output keeps the result empty and closes the stream', async () => {
        const abort = new AbortController();
        abort.abort();
        let cancelled = false;
        const result = await readImageStream(
            stream([], false, () => {
                cancelled = true;
            }),
            abort.signal,
            () => {},
            () => {}
        );
        expect(result).toMatchObject({ images: [], cancelled: true });
        expect(cancelled).toBe(true);
    });

    test('cancel releases a read that is waiting for the next event', async () => {
        const abort = new AbortController();
        let cancelled = false;
        const pending = readImageStream(
            stream([], false, () => {
                cancelled = true;
            }),
            abort.signal,
            () => {},
            () => {}
        );
        abort.abort();
        expect(await pending).toMatchObject({ images: [], cancelled: true });
        expect(cancelled).toBe(true);
    });

    test('retains completed files when the connection ends early and reports the failure', async () => {
        const result = await readImageStream(
            stream([event({ type: 'completed', index: 0, ...image })]),
            new AbortController().signal,
            () => {},
            () => {}
        );
        expect(result.images).toHaveLength(1);
        expect(result.error).toContain('ended before completion');
        expect(result.cancelled).toBe(false);
    });

    test.each([
        'data: not-json\n\n',
        event({ type: 'done', images: [{ filename: 'not-an-image' }] }),
        event({ type: 'error', error: 'Upstream unavailable' })
    ])('surfaces invalid or failed streams: %s', async (frame) => {
        const result = await readImageStream(
            stream([frame]),
            new AbortController().signal,
            () => {},
            () => {}
        );
        expect(result.error).toBeTruthy();
        expect(result.images).toHaveLength(0);
        expect(result.cancelled).toBe(false);
    });

    test('keeps a partial-failure message from the final batch', async () => {
        const result = await readImageStream(
            stream([event({ type: 'done', images: [image], error: 'Second image failed' })]),
            new AbortController().signal,
            () => {},
            () => {}
        );
        expect(result.error).toBe('Second image failed');
        expect(result.images).toEqual([image]);
    });
});

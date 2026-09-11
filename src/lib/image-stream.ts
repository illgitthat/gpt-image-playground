export type GeneratedImage = {
    filename: string;
    output_format: string;
    b64_json?: string;
    path?: string;
};

type ImageBatch = {
    images: GeneratedImage[];
    usage?: unknown;
    error?: string;
    cancelled: boolean;
};

export function isGeneratedImage(value: unknown): value is GeneratedImage {
    if (!value || typeof value !== 'object') return false;
    return (
        'filename' in value &&
        typeof value.filename === 'string' &&
        value.filename.length > 0 &&
        'output_format' in value &&
        typeof value.output_format === 'string' &&
        ['png', 'jpeg', 'webp'].includes(value.output_format) &&
        (('path' in value && typeof value.path === 'string' && value.path.length > 0) ||
            ('b64_json' in value && typeof value.b64_json === 'string' && value.b64_json.length > 0))
    );
}

export async function readImageStream(
    response: Response,
    signal: AbortSignal,
    onPreview: (index: number, base64: string) => void,
    onCompleted: (index: number, image: GeneratedImage, count: number) => void
): Promise<ImageBatch> {
    if (!response.body) throw new Error('Image response has no stream.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const completed = new Map<number, GeneratedImage>();
    let buffer = '';
    let finalBatch: ImageBatch | undefined;
    let error: string | undefined;
    const cancelReader = () => {
        void reader.cancel().catch((err) => {
            if (!signal.aborted) console.error('Failed to close image stream:', err);
        });
    };
    signal.addEventListener('abort', cancelReader, { once: true });

    const processEvent = (frame: string) => {
        const data = frame
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
        if (!data) return;
        const event: unknown = JSON.parse(data);
        if (!event || typeof event !== 'object' || !('type' in event)) throw new Error('Invalid image stream event.');
        if (event.type === 'error') {
            throw new Error(
                'error' in event && typeof event.error === 'string' ? event.error : 'Image generation failed.'
            );
        }
        if (event.type === 'done') {
            if (
                !('images' in event) ||
                !Array.isArray(event.images) ||
                !event.images.length ||
                !event.images.every(isGeneratedImage)
            ) {
                throw new Error('Image generation completed without valid images.');
            }
            finalBatch = {
                images: event.images,
                usage: 'usage' in event ? event.usage : undefined,
                error: 'error' in event && typeof event.error === 'string' ? event.error : undefined,
                cancelled: false
            };
            return;
        }
        if (
            !('index' in event) ||
            typeof event.index !== 'number' ||
            !Number.isInteger(event.index) ||
            event.index < 0
        ) {
            throw new Error('Invalid image index in stream.');
        }
        if (event.type === 'partial_image') {
            if (!('b64_json' in event) || typeof event.b64_json !== 'string' || !event.b64_json) {
                throw new Error('Invalid image preview in stream.');
            }
            if (!completed.has(event.index)) onPreview(event.index, event.b64_json);
        } else if (event.type === 'completed') {
            if (!isGeneratedImage(event)) throw new Error('Invalid completed image in stream.');
            completed.set(event.index, event);
            onCompleted(event.index, event, completed.size);
        }
    };

    try {
        while (!signal.aborted && !finalBatch) {
            const { done, value } = await reader.read();
            if (signal.aborted) break;
            buffer += decoder.decode(value, { stream: !done });
            const frames = buffer.split(/\r?\n\r?\n/);
            buffer = frames.pop() ?? '';
            for (const frame of frames) {
                processEvent(frame);
                if (finalBatch || signal.aborted) break;
            }
            if (done) {
                if (buffer.trim() && !finalBatch) processEvent(buffer);
                break;
            }
        }
        if (!finalBatch && !signal.aborted) error = 'Image stream ended before completion.';
    } catch (err) {
        if (!signal.aborted) {
            console.error('Image stream failed:', err);
            error = err instanceof Error ? err.message : 'Image stream failed.';
        }
    } finally {
        signal.removeEventListener('abort', cancelReader);
        try {
            await reader.cancel();
        } catch (err) {
            if (!signal.aborted) console.error('Failed to close image stream:', err);
        }
        reader.releaseLock();
    }
    return (
        finalBatch ?? {
            images: [...completed.entries()].sort(([left], [right]) => left - right).map(([, image]) => image),
            error,
            cancelled: signal.aborted
        }
    );
}

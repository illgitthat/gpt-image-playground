'use client';

import { Composer, type GenerationFormData, type OutputMode } from '@/components/composer';
import { Gallery } from '@/components/gallery';
import { PasswordDialog } from '@/components/password-dialog';
import { Stage, type PendingGeneration } from '@/components/stage';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { DEFAULT_IMAGE_MODEL, type CostDetails, type ImageModel } from '@/lib/cost-utils';
import { db, type ImageRecord } from '@/lib/db';
import { compressImageForUpload } from '@/lib/image-compress';
import { DEFAULT_OUTPUT_COMPRESSION, MAX_REFERENCE_IMAGES } from '@/lib/image-options';
import { isGeneratedImage, readImageStream, type GeneratedImage } from '@/lib/image-stream';
import { EMPTY_PROMPT_DRAFT, promptDraftReducer } from '@/lib/prompt-draft';
import { cn } from '@/lib/utils';
import {
    cancelVideoJob,
    clearPendingVideoJob,
    loadPendingVideoJob,
    savePendingVideoJob,
    startVideo,
    VideoRequestError,
    videoUrl,
    waitForVideo,
    type PendingVideoJob
} from '@/lib/video-client';
import { useLiveQuery } from 'dexie-react-hooks';
import { Lock, LockOpen, Plus, X } from 'lucide-react';
import Image from 'next/image';
import * as React from 'react';

type HistoryImage = {
    filename: string;
};

type HistoryVideo = {
    filename: string;
};

export type HistoryMetadata = {
    timestamp: number;
    images?: HistoryImage[];
    videos?: HistoryVideo[];
    storageModeUsed?: 'fs' | 'indexeddb';
    durationMs: number;
    quality: GenerationFormData['quality'];
    background: GenerationFormData['background'];
    moderation: GenerationFormData['moderation'];
    prompt: string;
    mode: 'generate' | 'edit' | 'video';
    costDetails: CostDetails | null;
    output_format?: GenerationFormData['output_format'];
    model?: ImageModel | string;
    videoSeconds?: number;
    // Still frame shown for a video in the gallery, when it was made from an image.
    poster?: string;
    referenceImageFilenames?: string[];
};

const explicitModeClient = process.env.NEXT_PUBLIC_IMAGE_STORAGE_MODE;

const vercelEnvClient = process.env.NEXT_PUBLIC_VERCEL_ENV;
const isOnVercelClient = vercelEnvClient === 'production' || vercelEnvClient === 'preview';

let effectiveStorageModeClient: 'fs' | 'indexeddb';

if (explicitModeClient === 'fs') {
    effectiveStorageModeClient = 'fs';
} else if (explicitModeClient === 'indexeddb') {
    effectiveStorageModeClient = 'indexeddb';
} else if (isOnVercelClient) {
    effectiveStorageModeClient = 'indexeddb';
} else {
    effectiveStorageModeClient = 'fs';
}
// One-tap starting points on the empty home screen.
const EXAMPLES: { label: string; image: string; prompt: string }[] = [
    {
        label: 'Snowy cabin',
        image: '/examples/cabin.webp',
        prompt: 'A cozy log cabin in a snowy pine forest at dusk, warm light glowing from the windows, soft falling snow, cinematic photo'
    },
    {
        label: 'Corgi sticker',
        image: '/examples/sticker.webp',
        prompt: 'A die-cut sticker of a cheerful corgi wearing sunglasses, bold outlines, flat bright colors, white border, plain background'
    },
    {
        label: 'Retro poster',
        image: '/examples/poster.webp',
        prompt: 'A retro 1980s sci-fi movie poster of a lone astronaut facing a giant glowing planet, painted style, bold title lettering that reads "LAST ORBIT"'
    },
    {
        label: 'Ramen in a jar',
        image: '/examples/jar.webp',
        prompt: 'A miniature diorama of a busy ramen shop inside a glass jar, tilt-shift macro photo, warm lantern light, rich detail'
    }
];

console.log(
    `Client Effective Storage Mode: ${effectiveStorageModeClient} (Explicit: ${explicitModeClient || 'unset'}, Vercel Env: ${vercelEnvClient || 'N/A'})`
);

export default function HomePage() {
    // What the prompt bar makes next. Video is offered only when the server has it set up.
    const [outputMode, setOutputMode] = React.useState<OutputMode>('image');
    const [videoInfo, setVideoInfo] = React.useState<{ seconds: number } | null>(null);
    const videoJobRef = React.useRef<string | null>(null);
    const [isPasswordRequiredByBackend, setIsPasswordRequiredByBackend] = React.useState<boolean | null>(null);
    const [clientPasswordHash, setClientPasswordHash] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [isCancelling, setIsCancelling] = React.useState(false);
    const [completedImageCount, setCompletedImageCount] = React.useState(0);
    const imageRequestRef = React.useRef<AbortController | null>(null);
    const [isEnhancingGenPrompt, setIsEnhancingGenPrompt] = React.useState(false);
    const [isSurprisingGen, setIsSurprisingGen] = React.useState(false);
    const [isSendingToRef, setIsSendingToRef] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [genPromptEnhanceError, setGenPromptEnhanceError] = React.useState<string | null>(null);
    const [latestImageBatch, setLatestImageBatch] = React.useState<{ path: string; filename: string }[] | null>(null);
    // The stage shows one history entry; follow-up prompts edit its selected image while `editStage` is on.
    const [stageEntry, setStageEntry] = React.useState<HistoryMetadata | null>(null);
    const [stageIndex, setStageIndex] = React.useState(0);
    const [editStage, setEditStage] = React.useState(false);
    const [pending, setPending] = React.useState<PendingGeneration | null>(null);
    const [history, setHistory] = React.useState<HistoryMetadata[]>([]);
    const [isInitialLoad, setIsInitialLoad] = React.useState(true);
    const [blobUrlCache, setBlobUrlCache] = React.useState<Record<string, string>>({});
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = React.useState(false);
    const [passwordDialogContext, setPasswordDialogContext] = React.useState<'initial' | 'retry'>('initial');
    const [lastApiCallArgs, setLastApiCallArgs] = React.useState<[GenerationFormData] | null>(null);
    const [skipDeleteConfirmation, setSkipDeleteConfirmation] = React.useState<boolean>(false);
    const [itemToDeleteConfirm, setItemToDeleteConfirm] = React.useState<HistoryMetadata | null>(null);
    const [dialogCheckboxStateSkipConfirm, setDialogCheckboxStateSkipConfirm] = React.useState<boolean>(false);
    const [isClearHistoryDialogOpen, setIsClearHistoryDialogOpen] = React.useState(false);

    const allDbImages = useLiveQuery<ImageRecord[] | undefined>(() => db.images.toArray(), []);

    const [genPromptDraft, dispatchGenPrompt] = React.useReducer(promptDraftReducer, EMPTY_PROMPT_DRAFT);
    const genPrompt = genPromptDraft.text;
    const setGenPrompt = React.useCallback((value: React.SetStateAction<string>) => {
        dispatchGenPrompt({ type: 'edit', value });
    }, []);
    const promptRequestId = React.useRef(0);
    const [genN, setGenN] = React.useState([1]);
    const [genSize, setGenSize] = React.useState<GenerationFormData['size']>('1024x1024');
    const [genReferenceImages, setGenReferenceImages] = React.useState<File[]>([]);
    const [genReferenceImagePreviewUrls, setGenReferenceImagePreviewUrls] = React.useState<string[]>([]);

    // Keep the response on the SSE path for all image requests so reverse proxies
    // don't time out while waiting on long-running generations.
    const [partialImages] = React.useState<1 | 2 | 3>(3);
    // Streaming preview images (base64 data URLs for partial images during streaming)
    const [streamingPreviewImages, setStreamingPreviewImages] = React.useState<Map<number, string>>(new Map());

    const isStreamingAllowed = true;
    React.useEffect(() => () => imageRequestRef.current?.abort(), []);

    const getImageSrc = React.useCallback(
        (filename: string): string | undefined => {
            if (blobUrlCache[filename]) {
                return blobUrlCache[filename];
            }

            const record = allDbImages?.find((img) => img.filename === filename);
            if (record?.blob) {
                const url = URL.createObjectURL(record.blob);

                return url;
            }

            return undefined;
        },
        [allDbImages, blobUrlCache]
    );

    const latestBlobUrlCache = React.useRef(blobUrlCache);
    React.useEffect(() => {
        latestBlobUrlCache.current = blobUrlCache;
    }, [blobUrlCache]);
    React.useEffect(() => {
        return () => {
            Object.values(latestBlobUrlCache.current).forEach((url) => {
                if (url.startsWith('blob:')) {
                    URL.revokeObjectURL(url);
                }
            });
        };
    }, []);

    React.useEffect(() => {
        return () => {
            genReferenceImagePreviewUrls.forEach((url) => {
                if (url.startsWith('blob:')) URL.revokeObjectURL(url);
            });
        };
    }, [genReferenceImagePreviewUrls]);

    React.useEffect(() => {
        try {
            const storedHistory = localStorage.getItem('openaiImageHistory');
            if (storedHistory) {
                const parsedHistory: HistoryMetadata[] = JSON.parse(storedHistory);
                if (Array.isArray(parsedHistory)) {
                    setHistory(parsedHistory);
                } else {
                    console.warn('Invalid history data found in localStorage.');
                    localStorage.removeItem('openaiImageHistory');
                }
            }
        } catch (e) {
            console.error('Failed to load or parse history from localStorage:', e);
            localStorage.removeItem('openaiImageHistory');
        }
        setIsInitialLoad(false);
    }, []);

    React.useEffect(() => {
        const fetchAuthStatus = async () => {
            try {
                const response = await fetch('/api/auth-status');
                if (!response.ok) {
                    throw new Error('Failed to fetch auth status');
                }
                const data = await response.json();
                setIsPasswordRequiredByBackend(data.passwordRequired);
                setVideoInfo(
                    data.video && typeof data.video.seconds === 'number' ? { seconds: data.video.seconds } : null
                );
            } catch (error) {
                console.error('Error fetching auth status:', error);
                setIsPasswordRequiredByBackend(false);
            }
        };

        fetchAuthStatus();
        const storedHash = localStorage.getItem('clientPasswordHash');
        if (storedHash) {
            setClientPasswordHash(storedHash);
        }
    }, []);

    React.useEffect(() => {
        if (!isInitialLoad) {
            try {
                localStorage.setItem('openaiImageHistory', JSON.stringify(history));
            } catch (e) {
                console.error('Failed to save history to localStorage:', e);
            }
        }
    }, [history, isInitialLoad]);

    React.useEffect(() => {
        const storedPref = localStorage.getItem('imageGenSkipDeleteConfirm');
        if (storedPref === 'true') {
            setSkipDeleteConfirmation(true);
        } else if (storedPref === 'false') {
            setSkipDeleteConfirmation(false);
        }
    }, []);

    React.useEffect(() => {
        localStorage.setItem('imageGenSkipDeleteConfirm', String(skipDeleteConfirmation));
    }, [skipDeleteConfirmation]);

    React.useEffect(() => {
        const handlePaste = (event: ClipboardEvent) => {
            if (!event.clipboardData) return;

            // Don't intercept paste when the user is typing in a text field
            const active = document.activeElement;
            if (
                active instanceof HTMLTextAreaElement ||
                active instanceof HTMLInputElement ||
                (active instanceof HTMLElement && active.isContentEditable)
            ) {
                return;
            }

            if (genReferenceImages.length >= MAX_REFERENCE_IMAGES) return;

            const items = event.clipboardData.items;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                    const file = items[i].getAsFile();
                    if (file) {
                        event.preventDefault();
                        compressImageForUpload(file)
                            .then((processed) => {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                    setGenReferenceImages((prev) => [...prev, processed]);
                                    setGenReferenceImagePreviewUrls((prev) => [...prev, reader.result as string]);
                                };
                                reader.readAsDataURL(processed);
                            })
                            .catch((err) => {
                                console.error('Failed to process pasted image:', err);
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                    setGenReferenceImages((prev) => [...prev, file]);
                                    setGenReferenceImagePreviewUrls((prev) => [...prev, reader.result as string]);
                                };
                                reader.readAsDataURL(file);
                            });
                        break;
                    }
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [genReferenceImages.length]);

    async function sha256Client(text: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    const handleSavePassword = async (password: string) => {
        if (!password.trim()) {
            setError('Password cannot be empty.');
            return;
        }
        try {
            const hash = await sha256Client(password);
            localStorage.setItem('clientPasswordHash', hash);
            setClientPasswordHash(hash);
            setError(null);
            setIsPasswordDialogOpen(false);
            if (passwordDialogContext === 'retry' && lastApiCallArgs) {
                console.log('Retrying API call after password save...');
                await handleApiCall(...lastApiCallArgs);
            }
        } catch (e) {
            console.error('Error hashing password:', e);
            setError('Failed to save password due to a hashing error.');
        }
    };

    const handleOpenPasswordDialog = () => {
        setPasswordDialogContext('initial');
        setIsPasswordDialogOpen(true);
    };

    const getMimeTypeFromFormat = (format: string): string => {
        if (format === 'jpeg') return 'image/jpeg';
        if (format === 'webp') return 'image/webp';

        return 'image/png';
    };

    const fileToDataUrl = React.useCallback((file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === 'string') {
                    resolve(reader.result);
                } else {
                    reject(new Error('Failed to read file as data URL.'));
                }
            };
            reader.onerror = () => reject(reader.error ?? new Error('Unknown file read error.'));
            reader.readAsDataURL(file);
        });
    }, []);

    const handlePromptEnhance = async () => {
        const targetMode = outputMode === 'video' ? 'video' : 'generate';
        const targetPrompt = genPrompt;
        const setLoading = setIsEnhancingGenPrompt;
        const dispatchPrompt = dispatchGenPrompt;
        const setEnhanceError = setGenPromptEnhanceError;

        if (!targetPrompt.trim()) {
            setEnhanceError('Add a prompt first.');
            return;
        }

        if (isPasswordRequiredByBackend && !clientPasswordHash) {
            setError('Password is required. Please configure the password by clicking the lock icon.');
            setPasswordDialogContext('initial');
            setIsPasswordDialogOpen(true);
            return;
        }

        setEnhanceError(null);
        setLoading(true);
        const requestId = ++promptRequestId.current;
        dispatchPrompt({ type: 'request', id: requestId });

        let referenceImagesPayload: { dataUrl: string; alt?: string }[] = [];
        const videoHasReferenceImage = editTarget !== null || genReferenceImages.length > 0;

        if (genReferenceImages.length > 0) {
            try {
                referenceImagesPayload = await Promise.all(
                    genReferenceImages.map(async (file) => ({
                        dataUrl: await fileToDataUrl(file)
                    }))
                );
            } catch (readError) {
                const message =
                    readError instanceof Error
                        ? readError.message
                        : 'Failed to attach reference images for prompt enhancement.';
                setEnhanceError(message);
                setLoading(false);
                dispatchPrompt({ type: 'finish', id: requestId });
                return;
            }
        }

        try {
            const response = await fetch('/api/prompt-enhance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: targetPrompt,
                    mode: targetMode,
                    passwordHash: isPasswordRequiredByBackend ? clientPasswordHash : undefined,
                    referenceImages: referenceImagesPayload.length ? referenceImagesPayload : undefined,
                    videoHasReferenceImage: targetMode === 'video' ? videoHasReferenceImage : undefined
                })
            });

            const result = await response.json();

            if (!response.ok) {
                if (response.status === 401 && isPasswordRequiredByBackend) {
                    setPasswordDialogContext('retry');
                    setIsPasswordDialogOpen(true);
                }
                throw new Error(result.error || 'Failed to enhance prompt.');
            }

            if (typeof result.prompt !== 'string' || !result.prompt.trim()) {
                throw new Error('No enhanced prompt returned.');
            }

            dispatchPrompt({ type: 'resolve', id: requestId, text: result.prompt });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to enhance prompt.';
            setEnhanceError(message);
        } finally {
            setLoading(false);
            dispatchPrompt({ type: 'finish', id: requestId });
        }
    };

    const handleSurpriseMe = async () => {
        const setLoading = setIsSurprisingGen;
        const setSurpriseError = setGenPromptEnhanceError;

        if (isPasswordRequiredByBackend && !clientPasswordHash) {
            setError('Password is required. Please configure the password by clicking the lock icon.');
            setPasswordDialogContext('initial');
            setIsPasswordDialogOpen(true);
            return;
        }

        setSurpriseError(null);
        setLoading(true);
        const requestId = ++promptRequestId.current;
        dispatchGenPrompt({ type: 'request', id: requestId });

        let referenceImagesPayload: { dataUrl: string; alt?: string }[] = [];

        if (genReferenceImages.length > 0) {
            try {
                referenceImagesPayload = await Promise.all(
                    genReferenceImages.map(async (file) => ({
                        dataUrl: await fileToDataUrl(file)
                    }))
                );
            } catch (readError) {
                const message =
                    readError instanceof Error
                        ? readError.message
                        : 'Failed to attach reference images for surprise prompt.';
                setSurpriseError(message);
                setLoading(false);
                dispatchGenPrompt({ type: 'finish', id: requestId });
                return;
            }
        }

        try {
            const response = await fetch('/api/surprise-me', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: 'generate',
                    passwordHash: isPasswordRequiredByBackend ? clientPasswordHash : undefined,
                    referenceImages: referenceImagesPayload.length ? referenceImagesPayload : undefined
                })
            });

            const result = await response.json();

            if (!response.ok) {
                if (response.status === 401 && isPasswordRequiredByBackend) {
                    setPasswordDialogContext('retry');
                    setIsPasswordDialogOpen(true);
                }
                throw new Error(result.error || 'Failed to generate a surprise prompt.');
            }

            if (typeof result.prompt !== 'string' || !result.prompt.trim()) {
                throw new Error('No surprise prompt returned.');
            }

            dispatchGenPrompt({ type: 'resolve', id: requestId, text: result.prompt });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to generate a surprise prompt.';
            setSurpriseError(message);
        } finally {
            setLoading(false);
            dispatchGenPrompt({ type: 'finish', id: requestId });
        }
    };

    const saveReferenceImages = async (refImages: File[], batchTimestamp: number): Promise<string[]> => {
        if (refImages.length === 0) return [];
        const filenames: string[] = [];
        for (let i = 0; i < refImages.length; i++) {
            const file = refImages[i];
            const filename = `ref-${batchTimestamp}-${i}.${file.name.split('.').pop() || 'png'}`;
            try {
                if (effectiveStorageModeClient === 'indexeddb') {
                    await db.images.put({ filename, blob: file });
                } else {
                    // For fs mode, upload reference as base64 via a simple put
                    // Just store in IndexedDB regardless — refs are small and local-only
                    await db.images.put({ filename, blob: file });
                }
                filenames.push(filename);
            } catch (err) {
                console.error(`Failed to save reference image ${filename}:`, err);
            }
        }
        return filenames;
    };

    const storeImageBatch = async (formData: GenerationFormData, images: GeneratedImage[], durationMs: number) => {
        const processedImages: { path: string; filename: string }[] = [];
        const failures: string[] = [];
        for (const image of images) {
            try {
                if (effectiveStorageModeClient === 'indexeddb') {
                    if (!image.b64_json) throw new Error(`Image data is missing for ${image.filename}.`);
                    const bytes = Uint8Array.from(atob(image.b64_json), (character) => character.charCodeAt(0));
                    const blob = new Blob([bytes], { type: getMimeTypeFromFormat(image.output_format) });
                    await db.images.put({ filename: image.filename, blob });
                    const url = URL.createObjectURL(blob);
                    setBlobUrlCache((previous) => ({ ...previous, [image.filename]: url }));
                    processedImages.push({ filename: image.filename, path: url });
                } else {
                    if (!image.path) throw new Error(`Image path is missing for ${image.filename}.`);
                    processedImages.push({ filename: image.filename, path: image.path });
                }
            } catch (error) {
                console.error('Failed to save generated image:', error);
                failures.push(`Could not save ${image.filename}.`);
            }
        }
        if (!processedImages.length) throw new Error(failures.join(' ') || 'No images could be saved.');
        const timestamp = Date.now();
        const references = await saveReferenceImages(formData.referenceImages, timestamp);
        const entry: HistoryMetadata = {
            timestamp,
            images: processedImages.map(({ filename }) => ({ filename })),
            storageModeUsed: effectiveStorageModeClient,
            durationMs,
            quality: formData.quality,
            background: formData.background,
            moderation: 'low',
            output_format: formData.output_format,
            prompt: formData.prompt,
            mode: 'generate',
            // Responses usage belongs to the text orchestrator, not the image model.
            costDetails: null,
            model: formData.model,
            ...(references.length ? { referenceImageFilenames: references } : {})
        };
        setLatestImageBatch(processedImages);
        setStageEntry(entry);
        setStageIndex(0);
        // The result becomes the thing the next prompt changes; the composer starts clean.
        setEditStage(true);
        setGenPrompt('');
        setGenReferenceImages([]);
        setGenReferenceImagePreviewUrls([]);
        setHistory((previous) => [entry, ...previous]);
        if (failures.length) setError(failures.join(' '));
    };

    const handleApiCall = async (formData: GenerationFormData, baseUrl: string | null = null) => {
        if (imageRequestRef.current) return;
        const startTime = Date.now();
        let durationMs = 0;

        setIsLoading(true);
        setError(null);
        // The current image stays in state so a failed or cancelled request brings it back.
        setPending({ kind: 'image', prompt: formData.prompt, size: formData.size, count: formData.n, baseUrl });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setStreamingPreviewImages(new Map());
        setCompletedImageCount(0);
        setIsCancelling(false);

        const apiFormData = new FormData();
        if (isPasswordRequiredByBackend && clientPasswordHash) {
            apiFormData.append('passwordHash', clientPasswordHash);
        } else if (isPasswordRequiredByBackend && !clientPasswordHash) {
            setError('Password is required. Please configure the password by clicking the lock icon.');
            setPasswordDialogContext('initial');
            setIsPasswordDialogOpen(true);
            setIsLoading(false);
            setPending(null);
            return;
        }

        // Keep image requests on the SSE path so long-running generations can stream progress
        // and avoid reverse proxy timeouts.
        if (isStreamingAllowed) {
            apiFormData.append('stream', 'true');
            apiFormData.append('partial_images', partialImages.toString());
        }

        apiFormData.append('model', formData.model);
        apiFormData.append('prompt', formData.prompt);
        apiFormData.append('n', formData.n.toString());
        apiFormData.append('size', formData.size);
        apiFormData.append('quality', formData.quality);
        apiFormData.append('output_format', formData.output_format);
        if (
            (formData.output_format === 'jpeg' || formData.output_format === 'webp') &&
            formData.output_compression !== undefined
        ) {
            apiFormData.append('output_compression', formData.output_compression.toString());
        }
        apiFormData.append('background', formData.background);
        apiFormData.append('moderation', formData.moderation);
        if (formData.referenceImages && formData.referenceImages.length > 0) {
            formData.referenceImages.forEach((file, index) => {
                apiFormData.append(`image_${index}`, file, file.name);
            });
        }

        console.log('Sending request to /api/images, streaming:', isStreamingAllowed);
        const controller = new AbortController();
        imageRequestRef.current = controller;

        try {
            const response = await fetch('/api/images', {
                method: 'POST',
                body: apiFormData,
                signal: controller.signal
            });

            // Check if response is SSE (streaming)
            const contentType = response.headers.get('content-type');
            if (contentType?.includes('text/event-stream')) {
                const result = await readImageStream(
                    response,
                    controller.signal,
                    (imageIndex, partialImageB64) => {
                        const previewFormat = formData.output_format === 'jpeg' ? 'jpeg' : 'png';
                        const dataUrl = `data:image/${previewFormat};base64,${partialImageB64}`;
                        setStreamingPreviewImages((prev) => {
                            const newMap = new Map(prev);
                            newMap.set(imageIndex, dataUrl);
                            return newMap;
                        });
                    },
                    (index, image, count) => {
                        setCompletedImageCount(count);
                        const preview = image.b64_json
                            ? `data:image/${image.output_format};base64,${image.b64_json}`
                            : image.path;
                        if (preview) setStreamingPreviewImages((previous) => new Map(previous).set(index, preview));
                    }
                );
                if (result.error) setError(result.error);
                if (result.images.length) {
                    await storeImageBatch(formData, result.images, Date.now() - startTime);
                }
                return;
            }

            // Non-streaming response handling (original code)
            if (!contentType?.includes('application/json')) {
                const responseText = await response.text();
                const normalizedText = responseText.replace(/\s+/g, ' ').trim();
                const fallbackMessage =
                    normalizedText.startsWith('<!DOCTYPE') || normalizedText.startsWith('<html')
                        ? `API request failed with status ${response.status}`
                        : normalizedText || `API request failed with status ${response.status}`;

                throw new Error(fallbackMessage);
            }

            const result = await response.json();

            if (!response.ok) {
                if (response.status === 401 && isPasswordRequiredByBackend) {
                    setError('Unauthorized: Invalid or missing password. Please try again.');
                    setPasswordDialogContext('retry');
                    setLastApiCallArgs([formData]);
                    setIsPasswordDialogOpen(true);

                    return;
                }
                throw new Error(result.error || `API request failed with status ${response.status}`);
            }

            console.log('API Response:', result);

            if (Array.isArray(result.images) && result.images.length > 0 && result.images.every(isGeneratedImage)) {
                durationMs = Date.now() - startTime;
                if (typeof result.error === 'string' && result.error) {
                    setError(result.error);
                }
                await storeImageBatch(formData, result.images, durationMs);
            } else {
                throw new Error('API response did not contain valid image data or filenames.');
            }
        } catch (err: unknown) {
            if (controller.signal.aborted && err instanceof Error && err.name === 'AbortError') return;
            durationMs = Date.now() - startTime;
            console.error(`API Call Error after ${durationMs}ms:`, err);
            const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
            setError(errorMessage);
            setStreamingPreviewImages(new Map());
        } finally {
            if (durationMs === 0) durationMs = Date.now() - startTime;
            setIsLoading(false);
            setPending(null);
            setIsCancelling(false);
            setStreamingPreviewImages(new Map());
            imageRequestRef.current = null;
        }
    };

    // Put a past image or video back on the stage.
    const handleHistorySelect = (item: HistoryMetadata) => {
        const isVideoEntry = item.mode === 'video';
        const assets = isVideoEntry ? (item.videos ?? []) : (item.images ?? []);
        const fromBrowser = !isVideoEntry && (item.storageModeUsed || 'fs') === 'indexeddb';
        const validAssets = assets
            .map((asset) => {
                const path = isVideoEntry
                    ? videoUrl(asset.filename)
                    : fromBrowser
                      ? getImageSrc(asset.filename)
                      : `/api/image/${asset.filename}`;
                return path ? { path, filename: asset.filename } : null;
            })
            .filter((asset): asset is { path: string; filename: string } => asset !== null);

        setError(
            validAssets.length === assets.length
                ? null
                : 'Some of these could not be loaded. They may have been cleared or deleted.'
        );
        setLatestImageBatch(validAssets.length > 0 ? validAssets : null);
        setStageEntry(validAssets.length > 0 ? item : null);
        setStageIndex(0);
        // A video cannot be edited; the next prompt starts something new.
        setEditStage(validAssets.length > 0 && !isVideoEntry);
        // Opening an image means editing it by default; Animate is one tap away.
        if (!isVideoEntry) setOutputMode('image');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleClearHistory = async () => {
        setIsClearHistoryDialogOpen(true);
    };

    const deleteIndexedDbFiles = async (filenames: string[]) => {
        const uniqueFilenames = Array.from(new Set(filenames.filter(Boolean)));
        if (uniqueFilenames.length === 0) return;

        await db.images.where('filename').anyOf(uniqueFilenames).delete();
        setBlobUrlCache((prevCache) => {
            const newCache = { ...prevCache };
            uniqueFilenames.forEach((filename) => {
                const cachedUrl = newCache[filename];
                if (cachedUrl?.startsWith('blob:')) {
                    URL.revokeObjectURL(cachedUrl);
                }
                delete newCache[filename];
            });
            return newCache;
        });
    };

    const performClearHistory = async () => {
        setIsClearHistoryDialogOpen(false);
        setHistory([]);
        setLatestImageBatch(null);
        setStageEntry(null);
        setEditStage(false);
        setError(null);

        try {
            localStorage.removeItem('openaiImageHistory');
            console.log('Cleared history metadata from localStorage.');

            // Reference images are always persisted in IndexedDB, even when generated
            // outputs are stored on the filesystem.
            await db.images.clear();
            console.log('Cleared locally stored images from IndexedDB.');

            setBlobUrlCache((prevCache) => {
                Object.values(prevCache).forEach((url) => {
                    if (url.startsWith('blob:')) {
                        URL.revokeObjectURL(url);
                    }
                });
                return {};
            });
        } catch (e) {
            console.error('Failed during history clearing:', e);
            setError(`Failed to clear history: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    // The stored image as a File, for sending back to the model as the thing to edit.
    const loadImageFile = async (filename: string): Promise<File> => {
        let blob: Blob | undefined;
        if (effectiveStorageModeClient === 'indexeddb') {
            blob = allDbImages?.find((img) => img.filename === filename)?.blob;
            if (!blob) throw new Error('That image is no longer stored in this browser.');
        } else {
            const response = await fetch(`/api/image/${filename}`);
            if (!response.ok) throw new Error('That image could not be loaded. It may have been deleted.');
            blob = await response.blob();
        }
        return new File([blob], filename, { type: blob.type || 'image/png' });
    };

    const executeDeleteItem = async (item: HistoryMetadata) => {
        if (!item) return;
        console.log(`Executing delete for history item timestamp: ${item.timestamp}`);
        setError(null); // Clear previous errors

        const {
            images: imagesInEntry = [],
            videos: videosInEntry = [],
            storageModeUsed,
            timestamp,
            referenceImageFilenames = []
        } = item;
        const filenamesToDelete = [
            ...[...imagesInEntry, ...videosInEntry].map((asset) => asset.filename),
            ...(item.poster ? [item.poster] : [])
        ];

        try {
            if (storageModeUsed === 'indexeddb') {
                const indexedDbFilenamesToDelete = [...filenamesToDelete, ...referenceImageFilenames];
                console.log('Deleting from IndexedDB:', indexedDbFilenamesToDelete);
                await deleteIndexedDbFiles(indexedDbFilenamesToDelete);
                console.log('Successfully deleted from IndexedDB and cleared blob cache.');
            } else {
                console.log('Requesting deletion from filesystem via API:', filenamesToDelete);
                const apiPayload: { filenames: string[]; passwordHash?: string } = { filenames: filenamesToDelete };
                if (isPasswordRequiredByBackend && clientPasswordHash) {
                    apiPayload.passwordHash = clientPasswordHash;
                }

                const response = await fetch('/api/image-delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(apiPayload)
                });

                const result = await response.json();
                if (!response.ok) {
                    console.error('API deletion error:', result);
                    throw new Error(result.error || `API deletion failed with status ${response.status}`);
                }
                console.log('API deletion successful:', result);

                if (referenceImageFilenames.length > 0) {
                    console.log('Deleting reference images from IndexedDB:', referenceImageFilenames);
                    await deleteIndexedDbFiles(referenceImageFilenames);
                }
            }

            setHistory((prevHistory) => prevHistory.filter((h) => h.timestamp !== timestamp));
            if (latestImageBatch && latestImageBatch.some((img) => filenamesToDelete.includes(img.filename))) {
                setLatestImageBatch(null); // Clear current view if it contained deleted images
                setStageEntry(null);
                setEditStage(false);
            }
        } catch (e: unknown) {
            console.error('Error during item deletion:', e);
            setError(e instanceof Error ? e.message : 'An unexpected error occurred during deletion.');
        } finally {
            setItemToDeleteConfirm(null); // Always close dialog
        }
    };

    const handleRequestDeleteItem = (item: HistoryMetadata) => {
        if (!skipDeleteConfirmation) {
            setDialogCheckboxStateSkipConfirm(skipDeleteConfirmation);
            setItemToDeleteConfirm(item);
        } else {
            executeDeleteItem(item);
        }
    };

    const handleConfirmDeletion = () => {
        if (itemToDeleteConfirm) {
            executeDeleteItem(itemToDeleteConfirm);
            setSkipDeleteConfirmation(dialogCheckboxStateSkipConfirm);
        }
    };

    const handleCancelDeletion = () => {
        setItemToDeleteConfirm(null);
    };

    const applyHistoryPrompt = (prompt: string, targetMode: 'generate' | 'edit' | 'video') => {
        setGenPrompt(prompt);
        setOutputMode(targetMode === 'video' && videoInfo ? 'video' : 'image');
    };

    const finishHistoryPromptReuse = () => {
        document.getElementById('prompt')?.focus();
    };

    const handleReusePrompt = (prompt: string, targetMode: 'generate' | 'edit' | 'video') => {
        applyHistoryPrompt(prompt, targetMode);
        finishHistoryPromptReuse();
    };

    const handleReuseWithReferences = async (prompt: string, referenceFilenames: string[]) => {
        applyHistoryPrompt(prompt, 'generate');
        setError(null);

        const files: File[] = [];
        const previewUrls: string[] = [];

        for (const filename of referenceFilenames) {
            try {
                const record = allDbImages?.find((img) => img.filename === filename);
                if (record?.blob) {
                    const file = new File([record.blob], filename, { type: record.blob.type || 'image/png' });
                    files.push(file);
                    const url = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.onerror = () => reject(new Error('Failed to read reference image'));
                        reader.readAsDataURL(file);
                    });
                    previewUrls.push(url);
                } else {
                    console.warn(`Reference image ${filename} not found in IndexedDB`);
                }
            } catch (err) {
                console.error(`Failed to load reference image ${filename}:`, err);
            }
        }

        setGenReferenceImages(files);
        setGenReferenceImagePreviewUrls(previewUrls);
        finishHistoryPromptReuse();
    };

    const stageImage = latestImageBatch?.[stageIndex] ?? latestImageBatch?.[0] ?? null;
    const stageIsVideo = stageEntry?.mode === 'video';
    const editTarget = editStage && stageImage && !stageIsVideo ? stageImage : null;
    const makingVideo = outputMode === 'video' && videoInfo !== null;
    const hasStage = pending !== null || stageImage !== null;

    const cancelGeneration = () => {
        if (!imageRequestRef.current || imageRequestRef.current.signal.aborted) return;
        setIsCancelling(true);
        if (videoJobRef.current) cancelVideoJob(videoJobRef.current, clientPasswordHash);
        clearPendingVideoJob();
        imageRequestRef.current.abort();
    };

    // Turns the prompt (and the image on the stage or the first attached photo, if any) into a short video.
    // Waits for a started video and puts it on the stage. Also used to pick a video back up after a reload.
    const followVideoJob = async (job: PendingVideoJob, controller: AbortController) => {
        videoJobRef.current = job.jobId;
        imageRequestRef.current = controller;
        setIsLoading(true);
        setIsCancelling(false);
        setPending({
            kind: 'video',
            prompt: job.prompt,
            size: 'auto',
            count: 1,
            baseUrl: job.baseUrl,
            aspect: job.aspect,
            startedAt: job.startedAt
        });
        try {
            const result = await waitForVideo(job.jobId, clientPasswordHash, controller.signal);
            const entry: HistoryMetadata = {
                timestamp: Date.now(),
                videos: [{ filename: result.filename }],
                storageModeUsed: 'fs',
                durationMs: Date.now() - job.startedAt,
                quality: 'auto',
                background: 'auto',
                moderation: 'low',
                prompt: job.prompt,
                mode: 'video',
                costDetails: null,
                model: result.model,
                videoSeconds: result.seconds,
                ...(result.poster ? { poster: result.poster } : {})
            };
            clearPendingVideoJob();
            setLatestImageBatch([{ filename: result.filename, path: videoUrl(result.filename) }]);
            setStageEntry(entry);
            setStageIndex(0);
            setEditStage(false);
            setHistory((previous) => [entry, ...previous]);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err: unknown) {
            // Leaving the page aborts the wait but keeps the saved job, so the next visit picks it up.
            if (controller.signal.aborted) return;
            clearPendingVideoJob();
            if (err instanceof VideoRequestError && err.status === 401 && isPasswordRequiredByBackend) {
                setPasswordDialogContext('initial');
                setIsPasswordDialogOpen(true);
            }
            console.error('Video error:', err);
            setError(err instanceof Error ? err.message : 'The video could not be made.');
        } finally {
            setIsLoading(false);
            setPending(null);
            setIsCancelling(false);
            videoJobRef.current = null;
            imageRequestRef.current = null;
        }
    };

    // Turns the prompt (and the image on the stage or the first attached photo, if any) into a short video.
    const handleVideoCall = async () => {
        if (imageRequestRef.current || !videoInfo) return;
        if (isPasswordRequiredByBackend && !clientPasswordHash) {
            setError('Password is required. Please configure the password by clicking the lock icon.');
            setPasswordDialogContext('initial');
            setIsPasswordDialogOpen(true);
            return;
        }
        const prompt = genPrompt.trim();
        const startedAt = Date.now();
        const controller = new AbortController();
        imageRequestRef.current = controller;
        setIsLoading(true);
        setIsCancelling(false);
        setError(null);

        let job: PendingVideoJob;
        try {
            let image: File | null = genReferenceImages[0] ?? null;
            if (editTarget) image = await loadImageFile(editTarget.filename);
            let aspect = genSize === '1536x1024' ? '16 / 9' : genSize === '1024x1536' ? '9 / 16' : '1 / 1';
            if (image) {
                const bitmap = await createImageBitmap(image).catch(() => null);
                if (bitmap) aspect = `${bitmap.width} / ${bitmap.height}`;
                bitmap?.close();
            }
            const baseUrl = editTarget?.path ?? (image ? (genReferenceImagePreviewUrls[0] ?? null) : null);
            setPending({ kind: 'video', prompt, size: 'auto', count: 1, baseUrl, aspect, startedAt });
            window.scrollTo({ top: 0, behavior: 'smooth' });

            const jobId = await startVideo(
                { prompt, size: genSize, image, passwordHash: clientPasswordHash },
                controller.signal
            );
            // Only a server path survives a reload; attached photos live in this page's memory.
            job = { jobId, prompt, startedAt, aspect, baseUrl: baseUrl?.startsWith('/api/') ? baseUrl : null };
            savePendingVideoJob(job);
            job = { ...job, baseUrl };
            setGenPrompt('');
            setGenReferenceImages([]);
            setGenReferenceImagePreviewUrls([]);
        } catch (err: unknown) {
            setIsLoading(false);
            setPending(null);
            imageRequestRef.current = null;
            if (controller.signal.aborted) return;
            if (err instanceof VideoRequestError && err.status === 401 && isPasswordRequiredByBackend) {
                setPasswordDialogContext('initial');
                setIsPasswordDialogOpen(true);
            }
            console.error('Video error:', err);
            setError(err instanceof Error ? err.message : 'The video could not be started.');
            return;
        }
        await followVideoJob(job, controller);
    };

    // A video keeps being made if the page is closed or reloaded; pick it back up on return.
    const resumeChecked = React.useRef(false);
    React.useEffect(() => {
        if (resumeChecked.current || !videoInfo || isPasswordRequiredByBackend === null) return;
        if (isPasswordRequiredByBackend && !clientPasswordHash) return;
        resumeChecked.current = true;
        const job = loadPendingVideoJob();
        if (job && !imageRequestRef.current) void followVideoJob(job, new AbortController());
        // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, when the server settings arrive
    }, [videoInfo, isPasswordRequiredByBackend, clientPasswordHash]);

    const chooseOutputMode = (mode: OutputMode) => {
        setOutputMode(mode);
        if (mode === 'video') {
            // A video starts from one image: the one on the stage, or else the first attached photo.
            const keep = editTarget ? 0 : 1;
            setGenReferenceImages((previous) => previous.slice(0, keep));
            setGenReferenceImagePreviewUrls((previous) => previous.slice(0, keep));
        }
    };

    const handleSubmit = async () => {
        if (isLoading) return;
        if (makingVideo) {
            // An image can be animated without a description; a video from nothing needs one.
            if (genPrompt.trim() || editTarget || genReferenceImages.length > 0) await handleVideoCall();
            return;
        }
        if (!genPrompt.trim()) return;
        let referenceImages = genReferenceImages;
        if (editTarget) {
            try {
                const base = await loadImageFile(editTarget.filename);
                referenceImages = [base, ...genReferenceImages].slice(0, MAX_REFERENCE_IMAGES);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'That image could not be loaded.');
                return;
            }
        }
        await handleApiCall(
            {
                prompt: genPrompt,
                n: genN[0],
                size: genSize,
                // Model and output settings are fixed defaults; people only choose shape and count.
                quality: 'auto',
                output_format: 'webp',
                output_compression: DEFAULT_OUTPUT_COMPRESSION,
                background: 'auto',
                moderation: 'low',
                model: DEFAULT_IMAGE_MODEL,
                referenceImages
            },
            editTarget?.path ?? null
        );
    };

    const startNewImage = () => {
        if (isLoading) return;
        setLatestImageBatch(null);
        setStageEntry(null);
        setEditStage(false);
        setError(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        requestAnimationFrame(() => document.getElementById('prompt')?.focus());
    };

    // Bring a finished image's prompt (and the images it was made from) back into the composer.
    const handleReuseStagePrompt = () => {
        if (!stageEntry) return;
        setEditStage(false);
        const references = stageEntry.referenceImageFilenames ?? [];
        if (references.length > 0) handleReuseWithReferences(stageEntry.prompt, references);
        else handleReusePrompt(stageEntry.prompt, stageIsVideo ? 'video' : 'generate');
    };

    return (
        <main className='text-foreground relative flex min-h-dvh flex-col items-center px-4 pb-10 sm:px-8'>
            <PasswordDialog
                isOpen={isPasswordDialogOpen}
                onOpenChange={setIsPasswordDialogOpen}
                onSave={handleSavePassword}
                title={passwordDialogContext === 'retry' ? 'Password Required' : 'Configure Password'}
                description={
                    passwordDialogContext === 'retry'
                        ? 'The server requires a password, or the previous one was incorrect. Please enter it to continue.'
                        : 'Set a password to use for API requests.'
                }
            />
            <Dialog open={isClearHistoryDialogOpen} onOpenChange={setIsClearHistoryDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Clear everything you made?</DialogTitle>
                        <DialogDescription>
                            This removes every image and video from this browser&apos;s list. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant='outline' onClick={() => setIsClearHistoryDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant='destructive' onClick={performClearHistory}>
                            Clear all
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog
                open={itemToDeleteConfirm !== null}
                onOpenChange={(open) => {
                    if (!open) handleCancelDeletion();
                }}>
                <DialogContent className='sm:max-w-md'>
                    <DialogHeader>
                        <DialogTitle>
                            {itemToDeleteConfirm?.mode === 'video' ? 'Delete this video?' : 'Delete this image?'}
                        </DialogTitle>
                        <DialogDescription>
                            {(itemToDeleteConfirm?.images?.length ?? 0) > 1
                                ? `This deletes all ${itemToDeleteConfirm?.images?.length} images made from this prompt.`
                                : 'It will be removed for good.'}{' '}
                            This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <div className='flex items-center gap-2 py-1'>
                        <Checkbox
                            id='skip-delete-confirm'
                            checked={dialogCheckboxStateSkipConfirm}
                            onCheckedChange={(checked) => setDialogCheckboxStateSkipConfirm(!!checked)}
                        />
                        <label htmlFor='skip-delete-confirm' className='text-foreground/90 text-sm'>
                            Don&apos;t ask me again
                        </label>
                    </div>
                    <DialogFooter className='gap-2'>
                        <Button variant='outline' onClick={handleCancelDeletion}>
                            Cancel
                        </Button>
                        <Button variant='destructive' onClick={handleConfirmDeletion}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <div className='sr-only' role='status' aria-live='polite'>
                {isLoading
                    ? pending?.kind === 'video'
                        ? 'Making video…'
                        : 'Generating image…'
                    : isEnhancingGenPrompt
                      ? 'Improving prompt…'
                      : isSurprisingGen
                        ? 'Coming up with an idea…'
                        : stageIsVideo
                          ? 'Showing your video.'
                          : latestImageBatch && latestImageBatch.length > 0
                            ? `Showing ${latestImageBatch.length} image${latestImageBatch.length === 1 ? '' : 's'}.`
                            : ''}
            </div>

            <header className='flex w-full max-w-6xl items-center justify-between gap-3 py-4'>
                <button
                    type='button'
                    onClick={startNewImage}
                    aria-label='MAI Image Playground — start a new image'
                    className='text-foreground focus-visible:ring-ring flex items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight focus-visible:ring-2 focus-visible:outline-none'>
                    <span className='bg-primary h-2.5 w-2.5 rounded-full' aria-hidden='true' />
                    MAI Image
                </button>
                <div className='flex items-center gap-2'>
                    {hasStage && (
                        <Button
                            type='button'
                            variant='outline'
                            onClick={startNewImage}
                            disabled={isLoading}
                            className='border-border h-9 rounded-full bg-transparent px-3.5'>
                            <Plus className='h-4 w-4' />
                            New image
                        </Button>
                    )}
                    {isPasswordRequiredByBackend && (
                        <Button
                            type='button'
                            variant='outline'
                            size='icon'
                            onClick={handleOpenPasswordDialog}
                            aria-label='Configure password'
                            className='border-border text-muted-foreground rounded-full bg-transparent'>
                            {clientPasswordHash ? <Lock className='h-4 w-4' /> : <LockOpen className='h-4 w-4' />}
                        </Button>
                    )}
                    <ThemeToggle />
                </div>
            </header>

            <div
                className={cn(
                    'flex w-full max-w-3xl flex-col items-center gap-5',
                    hasStage ? 'pt-1 sm:pt-4' : 'pt-[16vh] sm:pt-[24vh]'
                )}>
                {hasStage ? (
                    <Stage
                        images={latestImageBatch}
                        selectedIndex={stageIndex}
                        onSelect={setStageIndex}
                        prompt={stageEntry?.prompt ?? ''}
                        pending={pending}
                        completedCount={completedImageCount}
                        previews={streamingPreviewImages}
                        video={stageIsVideo ? { poster: stageEntry?.poster ?? null } : null}
                        isEditing={editTarget !== null && !makingVideo}
                        isAnimating={editTarget !== null && makingVideo}
                        onEdit={() => {
                            setEditStage(true);
                            setOutputMode('image');
                            document.getElementById('prompt')?.focus();
                        }}
                        onAnimate={
                            videoInfo
                                ? () => {
                                      setEditStage(true);
                                      setOutputMode('video');
                                      setGenReferenceImages([]);
                                      setGenReferenceImagePreviewUrls([]);
                                      document.getElementById('prompt')?.focus();
                                  }
                                : undefined
                        }
                        onReusePrompt={handleReuseStagePrompt}
                        onDelete={() => stageEntry && handleRequestDeleteItem(stageEntry)}
                    />
                ) : (
                    <h1 className='sr-only'>MAI Image Playground</h1>
                )}

                {error && (
                    <div
                        role='alert'
                        className='border-destructive/40 bg-destructive/10 text-destructive flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-sm'>
                        <p className='flex-1 leading-relaxed'>{error}</p>
                        <button
                            type='button'
                            onClick={() => setError(null)}
                            aria-label='Dismiss'
                            className='hover:bg-destructive/15 -mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full'>
                            <X className='h-4 w-4' />
                        </button>
                    </div>
                )}

                <Composer
                    prompt={genPrompt}
                    setPrompt={setGenPrompt}
                    onSubmit={handleSubmit}
                    onCancel={cancelGeneration}
                    isLoading={isLoading}
                    isCancelling={isCancelling}
                    size={genSize}
                    setSize={setGenSize}
                    count={genN[0]}
                    setCount={(count) => setGenN([count])}
                    referenceImages={genReferenceImages}
                    referencePreviewUrls={genReferenceImagePreviewUrls}
                    setReferenceImages={setGenReferenceImages}
                    setReferencePreviewUrls={setGenReferenceImagePreviewUrls}
                    maxReferenceImages={makingVideo ? 1 : MAX_REFERENCE_IMAGES}
                    outputMode={makingVideo ? 'video' : 'image'}
                    setOutputMode={videoInfo ? chooseOutputMode : undefined}
                    videoSeconds={videoInfo?.seconds ?? 0}
                    editTargetUrl={editTarget?.path ?? null}
                    onStopEditing={() => setEditStage(false)}
                    onEnhance={handlePromptEnhance}
                    isEnhancing={isEnhancingGenPrompt}
                    onSurprise={handleSurpriseMe}
                    isSurprising={isSurprisingGen}
                    canUndo={genPromptDraft.undoText !== null}
                    onUndo={() => dispatchGenPrompt({ type: 'undo' })}
                    helperError={genPromptEnhanceError}
                    autoFocus
                />

                {!hasStage && (
                    <ul
                        aria-label='Or start from an example'
                        className='rise-in grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-center'>
                        {EXAMPLES.map((example) => (
                            <li key={example.label}>
                                <button
                                    type='button'
                                    onClick={() => {
                                        setGenPrompt(example.prompt);
                                        setOutputMode('image');
                                        document.getElementById('prompt')?.focus();
                                    }}
                                    className='bg-card/70 border-border text-foreground/90 hover:border-foreground/30 hover:bg-card focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-full border py-1.5 pr-4 pl-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none'>
                                    <Image
                                        src={example.image}
                                        alt=''
                                        width={36}
                                        height={36}
                                        className='h-9 w-9 shrink-0 rounded-full object-cover'
                                    />
                                    <span className='truncate'>{example.label}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className='mt-14 w-full max-w-6xl flex-1'>
                <Gallery
                    history={history}
                    activeTimestamp={stageEntry?.timestamp ?? null}
                    getImageSrc={getImageSrc}
                    onOpen={(item) => {
                        if (!isLoading) handleHistorySelect(item);
                    }}
                    onClear={handleClearHistory}
                />
            </div>

            <footer className='text-muted-foreground/70 mt-10 w-full max-w-6xl text-center text-xs'>
                Made with MAI Image 2.7{videoInfo ? ' and MiniMax H3 video' : ''}
            </footer>
        </main>
    );
}

'use client';

import { GenerationForm, type GenerationFormData } from '@/components/generation-form';
import { HistoryPanel } from '@/components/history-panel';
import { ImageOutput } from '@/components/image-output';
import { PasswordDialog } from '@/components/password-dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { VideoForm, type VideoFormData } from '@/components/video-form';
import { VideoOutput } from '@/components/video-output';
import {
    DEFAULT_GPT_IMAGE_MODEL,
    calculateApiCost,
    calculateSoraVideoCost,
    type CostDetails,
    type GptImageModel
} from '@/lib/cost-utils';
import { db, type ImageRecord } from '@/lib/db';
import { compressImageForUpload } from '@/lib/image-compress';
import { MAX_REFERENCE_IMAGES } from '@/lib/image-options';
import { isGeneratedImage, readImageStream, type GeneratedImage } from '@/lib/image-stream';
import { EMPTY_PROMPT_DRAFT, promptDraftReducer } from '@/lib/prompt-draft';
import { useLiveQuery } from 'dexie-react-hooks';
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
    model?: GptImageModel | 'sora-2';
    videoSize?: '1280x720' | '720x1280';
    videoSeconds?: number;
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
console.log(
    `Client Effective Storage Mode: ${effectiveStorageModeClient} (Explicit: ${explicitModeClient || 'unset'}, Vercel Env: ${vercelEnvClient || 'N/A'})`
);

export default function HomePage() {
    const [mode, setMode] = React.useState<'generate' | 'video'>('generate');
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
    const [imageOutputView, setImageOutputView] = React.useState<'grid' | number>('grid');
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

    const [genModel, setGenModel] = React.useState<GenerationFormData['model']>(DEFAULT_GPT_IMAGE_MODEL);
    const [genPromptDraft, dispatchGenPrompt] = React.useReducer(promptDraftReducer, EMPTY_PROMPT_DRAFT);
    const genPrompt = genPromptDraft.text;
    const setGenPrompt = React.useCallback((value: React.SetStateAction<string>) => {
        dispatchGenPrompt({ type: 'edit', value });
    }, []);
    const promptRequestId = React.useRef(0);
    const [genN, setGenN] = React.useState([1]);
    const [genSize, setGenSize] = React.useState<GenerationFormData['size']>('auto');
    const [genQuality, setGenQuality] = React.useState<GenerationFormData['quality']>('low');
    const [genOutputFormat, setGenOutputFormat] = React.useState<GenerationFormData['output_format']>('png');
    const [genCompression, setGenCompression] = React.useState([100]);
    const [genBackground, setGenBackground] = React.useState<GenerationFormData['background']>('auto');
    const [genReferenceImages, setGenReferenceImages] = React.useState<File[]>([]);
    const [genReferenceImagePreviewUrls, setGenReferenceImagePreviewUrls] = React.useState<string[]>([]);

    const [videoPromptDraft, dispatchVideoPrompt] = React.useReducer(promptDraftReducer, EMPTY_PROMPT_DRAFT);
    const videoPrompt = videoPromptDraft.text;
    const setVideoPrompt = React.useCallback((value: React.SetStateAction<string>) => {
        dispatchVideoPrompt({ type: 'edit', value });
    }, []);
    const [videoSize, setVideoSize] = React.useState<'1280x720' | '720x1280'>('1280x720');
    const [videoSeconds, setVideoSeconds] = React.useState([8]);
    const [videoReferenceImage, setVideoReferenceImage] = React.useState<File | null>(null);
    const [videoReferencePreviewUrl, setVideoReferencePreviewUrl] = React.useState<string | null>(null);
    const [isGeneratingVideo, setIsGeneratingVideo] = React.useState(false);
    const [latestVideoBatch, setLatestVideoBatch] = React.useState<{ path: string; filename: string }[] | null>(null);
    const [videoViewIndex, setVideoViewIndex] = React.useState(0);
    const [isEnhancingVideoPrompt, setIsEnhancingVideoPrompt] = React.useState(false);
    const [videoPromptEnhanceError, setVideoPromptEnhanceError] = React.useState<string | null>(null);
    const videoPollTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const [videoElapsedSeconds, setVideoElapsedSeconds] = React.useState(0);
    const videoTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

    // Keep the response on the SSE path for all image requests so reverse proxies
    // don't time out while waiting on long-running generations.
    const [partialImages] = React.useState<1 | 2 | 3>(3);
    // Streaming preview images (base64 data URLs for partial images during streaming)
    const [streamingPreviewImages, setStreamingPreviewImages] = React.useState<Map<number, string>>(new Map());

    const isStreamingAllowed = mode === 'generate';
    React.useEffect(() => () => imageRequestRef.current?.abort(), []);

    const cancelImageGeneration = () => {
        if (!imageRequestRef.current || imageRequestRef.current.signal.aborted) return;
        setIsCancelling(true);
        imageRequestRef.current.abort();
    };

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
            if (videoReferencePreviewUrl && videoReferencePreviewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(videoReferencePreviewUrl);
            }
        };
    }, [videoReferencePreviewUrl]);

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

    React.useEffect(() => {
        return () => {
            if (videoPollTimeoutRef.current) {
                clearTimeout(videoPollTimeoutRef.current);
            }
            if (videoTimerRef.current) {
                clearInterval(videoTimerRef.current);
            }
        };
    }, []);

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

    const handlePromptEnhance = async (targetMode: 'generate' | 'video') => {
        const isGenerate = targetMode === 'generate';
        const targetPrompt = isGenerate ? genPrompt : videoPrompt;
        const setLoading = isGenerate ? setIsEnhancingGenPrompt : setIsEnhancingVideoPrompt;
        const dispatchPrompt = isGenerate ? dispatchGenPrompt : dispatchVideoPrompt;
        const setEnhanceError = isGenerate ? setGenPromptEnhanceError : setVideoPromptEnhanceError;

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
        let videoHasReferenceImage = false;

        if (targetMode === 'generate' && genReferenceImages.length > 0) {
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
        } else if (targetMode === 'video' && videoReferenceImage) {
            try {
                videoHasReferenceImage = true;
                referenceImagesPayload = [
                    {
                        dataUrl: await fileToDataUrl(videoReferenceImage),
                        alt: `Reference frame for video${videoReferenceImage.name ? ` (${videoReferenceImage.name})` : ''}`
                    }
                ];
            } catch (readError) {
                const message =
                    readError instanceof Error
                        ? readError.message
                        : 'Failed to attach reference image for prompt enhancement.';
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

    const handleVideoSubmit = async (formData: VideoFormData) => {
        const startTime = Date.now();
        if (videoPollTimeoutRef.current) {
            clearTimeout(videoPollTimeoutRef.current);
            videoPollTimeoutRef.current = null;
        }
        if (videoTimerRef.current) {
            clearInterval(videoTimerRef.current);
            videoTimerRef.current = null;
        }

        setIsGeneratingVideo(true);
        setError(null);
        setLatestVideoBatch(null);
        setVideoViewIndex(0);
        setVideoElapsedSeconds(0);

        // Start elapsed time timer
        videoTimerRef.current = setInterval(() => {
            setVideoElapsedSeconds((prev) => prev + 1);
        }, 1000);

        if (isPasswordRequiredByBackend && !clientPasswordHash) {
            setError('Password is required. Please configure the password by clicking the lock icon.');
            setPasswordDialogContext('initial');
            setIsPasswordDialogOpen(true);
            setIsGeneratingVideo(false);
            return;
        }

        const apiFormData = new FormData();
        apiFormData.append('prompt', formData.prompt);
        apiFormData.append('size', formData.size);
        apiFormData.append('seconds', formData.seconds.toString());
        if (formData.referenceImage) {
            apiFormData.append('reference_image', formData.referenceImage, formData.referenceImage.name);
        }

        if (isPasswordRequiredByBackend && clientPasswordHash) {
            apiFormData.append('passwordHash', clientPasswordHash);
        }

        try {
            const response = await fetch('/api/video', {
                method: 'POST',
                body: apiFormData
            });

            const rawText = await response.text();
            let result: any = null;
            try {
                result = JSON.parse(rawText);
            } catch {
                // keep rawText for error display
            }

            if (!response.ok) {
                if (response.status === 401 && isPasswordRequiredByBackend) {
                    setError('Unauthorized: Invalid or missing password. Please try again.');
                    setPasswordDialogContext('retry');
                    setIsPasswordDialogOpen(true);
                    return;
                }
                const fallback =
                    (result && result.error) || rawText || `Video API request failed with status ${response.status}`;
                throw new Error(typeof fallback === 'string' ? fallback : 'Video API request failed.');
            }

            const jobId: string | undefined = result?.jobId;
            if (!jobId) {
                throw new Error('Video API did not return a job id.');
            }

            const maxAttempts = 300;
            const pollDelayMs = 2000;

            const pollStatus = async (attempt = 0) => {
                try {
                    const statusResp = await fetch(`/api/video?jobId=${encodeURIComponent(jobId)}`);
                    const statusText = await statusResp.text();

                    let statusJson: any = null;
                    try {
                        statusJson = JSON.parse(statusText);
                    } catch {
                        throw new Error(`Unexpected response while polling video: ${statusText?.slice(0, 200)}`);
                    }

                    if (!statusResp.ok) {
                        const msg = statusJson?.error || `Video status check failed (${statusResp.status})`;
                        throw new Error(msg);
                    }

                    const status = (statusJson.status as string | undefined)?.toLowerCase() || 'queued';

                    if (status === 'succeeded' || status === 'completed') {
                        if (statusJson.videos && statusJson.videos.length > 0) {
                            const durationMs = Date.now() - startTime;
                            setLatestVideoBatch(statusJson.videos);
                            setMode('video');
                            setVideoViewIndex(0);

                            const batchTimestamp = Date.now();
                            const videoCostDetails = calculateSoraVideoCost(formData.seconds);
                            const newHistoryEntry: HistoryMetadata = {
                                timestamp: batchTimestamp,
                                videos: statusJson.videos.map((vid: { filename: string }) => ({
                                    filename: vid.filename
                                })),
                                storageModeUsed: 'fs',
                                durationMs,
                                quality: 'low',
                                background: 'auto',
                                moderation: 'low',
                                prompt: formData.prompt,
                                mode: 'video',
                                costDetails: videoCostDetails,
                                videoSize: formData.size,
                                videoSeconds: formData.seconds,
                                model: statusJson.model || 'sora-2'
                            };

                            setHistory((prevHistory) => [newHistoryEntry, ...prevHistory]);
                        } else {
                            throw new Error('Video status succeeded but no video was returned.');
                        }

                        if (videoPollTimeoutRef.current) {
                            clearTimeout(videoPollTimeoutRef.current);
                            videoPollTimeoutRef.current = null;
                        }
                        if (videoTimerRef.current) {
                            clearInterval(videoTimerRef.current);
                            videoTimerRef.current = null;
                        }
                        setIsGeneratingVideo(false);
                        return;
                    }

                    if (['queued', 'running', 'in_progress', 'processing', 'notstarted'].includes(status)) {
                        if (attempt >= maxAttempts) {
                            throw new Error('Video generation timed out while polling.');
                        }
                        videoPollTimeoutRef.current = setTimeout(() => {
                            pollStatus(attempt + 1);
                        }, pollDelayMs);
                        return;
                    }

                    const failureReason = statusJson?.error || `Video generation failed with status: ${status}`;
                    throw new Error(failureReason);
                } catch (err: unknown) {
                    if (videoPollTimeoutRef.current) {
                        clearTimeout(videoPollTimeoutRef.current);
                        videoPollTimeoutRef.current = null;
                    }
                    if (videoTimerRef.current) {
                        clearInterval(videoTimerRef.current);
                        videoTimerRef.current = null;
                    }

                    const errorMessage =
                        err instanceof Error ? err.message : 'An unexpected error occurred while polling video status.';
                    setError(errorMessage);
                    setLatestVideoBatch(null);
                    setIsGeneratingVideo(false);
                }
            };

            pollStatus(0);
        } catch (err: unknown) {
            if (videoTimerRef.current) {
                clearInterval(videoTimerRef.current);
                videoTimerRef.current = null;
            }
            const errorMessage =
                err instanceof Error ? err.message : 'An unexpected error occurred while creating video.';
            setError(errorMessage);
            setLatestVideoBatch(null);
            setIsGeneratingVideo(false);
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

    const storeImageBatch = async (
        formData: GenerationFormData,
        images: GeneratedImage[],
        durationMs: number,
        usage?: unknown
    ) => {
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
            costDetails: usage
                ? calculateApiCost(usage as Parameters<typeof calculateApiCost>[0], formData.model)
                : null,
            model: formData.model,
            ...(references.length ? { referenceImageFilenames: references } : {})
        };
        setLatestImageBatch(processedImages);
        setImageOutputView(processedImages.length > 1 ? 'grid' : 0);
        setHistory((previous) => [entry, ...previous]);
        if (failures.length) setError(failures.join(' '));
    };

    const handleApiCall = async (formData: GenerationFormData) => {
        if (imageRequestRef.current) return;
        const startTime = Date.now();
        let durationMs = 0;

        setIsLoading(true);
        setError(null);
        setLatestImageBatch(null);
        setImageOutputView('grid');
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
                    await storeImageBatch(formData, result.images, Date.now() - startTime, result.usage);
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
                await storeImageBatch(formData, result.images, durationMs, result.usage);
            } else {
                setLatestImageBatch(null);
                throw new Error('API response did not contain valid image data or filenames.');
            }
        } catch (err: unknown) {
            if (controller.signal.aborted && err instanceof Error && err.name === 'AbortError') return;
            durationMs = Date.now() - startTime;
            console.error(`API Call Error after ${durationMs}ms:`, err);
            const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
            setError(errorMessage);
            setLatestImageBatch(null);
            setStreamingPreviewImages(new Map());
        } finally {
            if (durationMs === 0) durationMs = Date.now() - startTime;
            setIsLoading(false);
            setIsCancelling(false);
            setStreamingPreviewImages(new Map());
            imageRequestRef.current = null;
        }
    };

    const handleHistorySelect = (item: HistoryMetadata, options: { skipModeChange?: boolean } = {}) => {
        console.log(
            `Selecting history item from ${new Date(item.timestamp).toISOString()}, stored via: ${item.storageModeUsed}`
        );
        const originalStorageMode = item.storageModeUsed || 'fs';
        const isVideoEntry = item.mode === 'video';
        const assets = item.videos && item.videos.length > 0 ? item.videos : item.images || [];

        const selectedBatchPromises = assets.map(async (asset) => {
            let path: string | undefined;

            if (originalStorageMode === 'indexeddb') {
                path = getImageSrc(asset.filename);
            } else {
                path = `/api/image/${asset.filename}`;
            }

            if (path) {
                return { path, filename: asset.filename };
            } else {
                console.warn(
                    `Could not get asset source for history item: ${asset.filename} (mode: ${originalStorageMode})`
                );
                setError(`Asset ${asset.filename} could not be loaded.`);
                return null;
            }
        });

        Promise.all(selectedBatchPromises).then((resolvedBatch) => {
            const validAssets = resolvedBatch.filter(Boolean) as { path: string; filename: string }[];

            if (validAssets.length !== assets.length && !error) {
                setError(
                    'Some items from this history entry could not be loaded (they might have been cleared or are missing).'
                );
            } else if (validAssets.length === assets.length) {
                setError(null);
            }

            if (isVideoEntry) {
                setLatestVideoBatch(validAssets.length > 0 ? validAssets : null);
                if (!options.skipModeChange) setMode('video');
                setVideoViewIndex(0);
            } else {
                setLatestImageBatch(validAssets.length > 0 ? validAssets : null);
                setImageOutputView(validAssets.length > 1 ? 'grid' : 0);
                if (!options.skipModeChange) setMode(item.mode === 'video' ? 'video' : 'generate');
            }
        });
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
        setLatestVideoBatch(null);
        setImageOutputView('grid');
        setVideoViewIndex(0);
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

    const handleUseAsReference = async (filename: string) => {
        if (isSendingToRef) return;
        setIsSendingToRef(true);
        setError(null);

        const alreadyExists = genReferenceImages.some((file) => file.name === filename);
        if (alreadyExists) {
            console.log(`Image ${filename} already in reference list.`);
            setIsSendingToRef(false);
            return;
        }

        if (genReferenceImages.length >= MAX_REFERENCE_IMAGES) {
            setError(`Cannot add more than ${MAX_REFERENCE_IMAGES} reference images.`);
            setIsSendingToRef(false);
            return;
        }

        console.log(`Adding image ${filename} as reference...`);

        try {
            let blob: Blob | undefined;
            let mimeType: string = 'image/png';

            if (effectiveStorageModeClient === 'indexeddb') {
                const record = allDbImages?.find((img) => img.filename === filename);
                if (record?.blob) {
                    blob = record.blob;
                    mimeType = blob.type || mimeType;
                } else {
                    throw new Error(`Image ${filename} not found in local database.`);
                }
            } else {
                const response = await fetch(`/api/image/${filename}`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch image: ${response.statusText}`);
                }
                blob = await response.blob();
                mimeType = response.headers.get('Content-Type') || mimeType;
            }

            if (!blob) {
                throw new Error(`Could not retrieve image data for ${filename}.`);
            }

            const newFile = new File([blob], filename, { type: mimeType });

            // Read data URL for preview
            const reader = new FileReader();
            const previewUrl = await new Promise<string>((resolve, reject) => {
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('Failed to read image'));
                reader.readAsDataURL(newFile);
            });

            setGenReferenceImages((prev) => [...prev, newFile]);
            setGenReferenceImagePreviewUrls((prev) => [...prev, previewUrl]);

            setMode('generate');

            console.log(`Successfully added ${filename} as reference image.`);
        } catch (err: unknown) {
            console.error('Error adding image as reference:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to add image as reference.';
            setError(errorMessage);
        } finally {
            setIsSendingToRef(false);
        }
    };

    const handleSendToVideo = async (filename: string) => {
        if (isGeneratingVideo) return;
        setIsGeneratingVideo(true);
        setError(null);

        try {
            let blob: Blob | undefined;
            let mimeType: string = 'image/png';

            if (effectiveStorageModeClient === 'indexeddb') {
                const record = allDbImages?.find((img) => img.filename === filename);
                if (record?.blob) {
                    blob = record.blob;
                    mimeType = blob.type || mimeType;
                } else {
                    throw new Error(`Image ${filename} not found in local database.`);
                }
            } else {
                const response = await fetch(`/api/image/${filename}`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch image: ${response.statusText}`);
                }
                blob = await response.blob();
                mimeType = response.headers.get('Content-Type') || mimeType;
            }

            if (!blob) {
                throw new Error(`Could not retrieve image data for ${filename}.`);
            }

            const newFile = new File([blob], filename, { type: mimeType });
            const previewUrl = URL.createObjectURL(blob);

            if (videoReferencePreviewUrl && videoReferencePreviewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(videoReferencePreviewUrl);
            }

            setVideoReferenceImage(newFile);
            setVideoReferencePreviewUrl(previewUrl);
            setMode('video');
        } catch (err: unknown) {
            console.error('Error sending image to video:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to send image to video form.';
            setError(errorMessage);
        } finally {
            setIsGeneratingVideo(false);
        }
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
        const filenamesToDelete = [...imagesInEntry, ...videosInEntry].map((asset) => asset.filename);

        try {
            if (storageModeUsed === 'indexeddb') {
                const indexedDbFilenamesToDelete = [...filenamesToDelete, ...referenceImageFilenames];
                console.log('Deleting from IndexedDB:', indexedDbFilenamesToDelete);
                await deleteIndexedDbFiles(indexedDbFilenamesToDelete);
                console.log('Successfully deleted from IndexedDB and cleared blob cache.');
            } else if (storageModeUsed === 'fs') {
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
        // TODO: Before re-enabling the video UI, keep history prompt reuse from
        // switching into `video` mode unless the video form/output are mounted again.
        if (targetMode === 'video') {
            setVideoPrompt(prompt);
            setMode('video');
        } else {
            // Both 'generate' and legacy 'edit' history entries go to generate
            setGenPrompt(prompt);
            setMode('generate');
        }
    };

    const finishHistoryPromptReuse = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleReusePrompt = (prompt: string, targetMode: 'generate' | 'edit' | 'video') => {
        applyHistoryPrompt(prompt, targetMode);
        finishHistoryPromptReuse();
    };

    const handleReuseWithReferences = async (prompt: string, referenceFilenames: string[]) => {
        applyHistoryPrompt(prompt, 'generate');
        setError(null);
        setLatestImageBatch(null);
        setImageOutputView('grid');
        setStreamingPreviewImages(new Map());

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

    return (
        <main className='bg-background text-foreground flex min-h-screen flex-col items-center px-5 py-8 md:px-10 md:py-12 lg:px-16 lg:py-16'>
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
                        <DialogTitle>Clear all history?</DialogTitle>
                        <DialogDescription>
                            {effectiveStorageModeClient === 'indexeddb'
                                ? 'This permanently removes every history entry and deletes all locally stored images from IndexedDB. This cannot be undone.'
                                : 'This permanently removes every history entry and deletes any locally stored reference images from IndexedDB. This cannot be undone.'}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant='outline' onClick={() => setIsClearHistoryDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant='destructive' onClick={performClearHistory}>
                            Clear history
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <div className='sr-only' role='status' aria-live='polite'>
                {isLoading
                    ? 'Generating image…'
                    : isGeneratingVideo
                      ? 'Generating video…'
                      : isEnhancingGenPrompt
                        ? 'Enhancing prompt…'
                        : isSurprisingGen
                          ? 'Generating a surprise prompt…'
                          : latestImageBatch && latestImageBatch.length > 0
                            ? `Generated ${latestImageBatch.length} image${latestImageBatch.length === 1 ? '' : 's'}.`
                            : ''}
            </div>
            <div className='w-full max-w-[1400px] space-y-8'>
                <header className='rise-in border-border flex flex-col gap-6 border-b pb-6 lg:flex-row lg:items-end lg:justify-between'>
                    <div className='flex min-w-0 flex-col gap-3'>
                        <h1 className='font-display text-foreground text-[clamp(1.5rem,8.2vw,1.875rem)] leading-[0.95] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl'>
                            gpt<span className='text-primary italic'>·image</span>
                            <span className='text-muted-foreground'>/</span>playground
                        </h1>
                    </div>
                    <div className='flex items-center gap-3 text-xs'>
                        <ThemeToggle />
                    </div>
                </header>
                <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
                    <div className='relative flex flex-col lg:col-span-1 lg:h-[70vh] lg:min-h-[600px]'>
                        <div className={mode === 'generate' ? 'block h-full w-full' : 'hidden'}>
                            <GenerationForm
                                onSubmit={handleApiCall}
                                isLoading={isLoading}
                                isPasswordRequiredByBackend={isPasswordRequiredByBackend}
                                clientPasswordHash={clientPasswordHash}
                                onOpenPasswordDialog={handleOpenPasswordDialog}
                                model={genModel}
                                setModel={setGenModel}
                                prompt={genPrompt}
                                setPrompt={setGenPrompt}
                                n={genN}
                                setN={setGenN}
                                size={genSize}
                                setSize={setGenSize}
                                quality={genQuality}
                                setQuality={setGenQuality}
                                outputFormat={genOutputFormat}
                                setOutputFormat={setGenOutputFormat}
                                compression={genCompression}
                                setCompression={setGenCompression}
                                background={genBackground}
                                setBackground={setGenBackground}
                                referenceImages={genReferenceImages}
                                referenceImagePreviewUrls={genReferenceImagePreviewUrls}
                                setReferenceImages={setGenReferenceImages}
                                setReferenceImagePreviewUrls={setGenReferenceImagePreviewUrls}
                                maxReferenceImages={MAX_REFERENCE_IMAGES}
                                streamingAllowed={isStreamingAllowed}
                                onEnhancePrompt={() => handlePromptEnhance('generate')}
                                isEnhancingPrompt={isEnhancingGenPrompt}
                                enhanceError={genPromptEnhanceError}
                                onSurpriseMe={handleSurpriseMe}
                                isSurprising={isSurprisingGen}
                                canUndoPrompt={genPromptDraft.undoText !== null}
                                onUndoPrompt={() => dispatchGenPrompt({ type: 'undo' })}
                                onCancel={cancelImageGeneration}
                                isCancelling={isCancelling}
                            />
                        </div>
                        {/* VideoForm hidden - feature temporarily disabled
                        <div className={mode === 'video' ? 'block h-full w-full' : 'hidden'}>
                            <VideoForm
                                onSubmit={handleVideoSubmit}
                                isLoading={isGeneratingVideo}
                                currentMode={mode}
                                onModeChange={setMode}
                                isPasswordRequiredByBackend={isPasswordRequiredByBackend}
                                clientPasswordHash={clientPasswordHash}
                                onOpenPasswordDialog={handleOpenPasswordDialog}
                                prompt={videoPrompt}
                                setPrompt={setVideoPrompt}
                                size={videoSize}
                                setSize={setVideoSize}
                                seconds={videoSeconds}
                                setSeconds={setVideoSeconds}
                                referenceImage={videoReferenceImage}
                                setReferenceImage={setVideoReferenceImage}
                                referencePreviewUrl={videoReferencePreviewUrl}
                                setReferencePreviewUrl={setVideoReferencePreviewUrl}
                                onEnhancePrompt={() => handlePromptEnhance('video')}
                                isEnhancingPrompt={isEnhancingVideoPrompt}
                                enhanceError={videoPromptEnhanceError}
                            />
                        </div>
                        */}
                    </div>
                    <div className='flex min-h-[360px] flex-col lg:col-span-1 lg:h-[70vh] lg:min-h-[600px]'>
                        {error && (
                            <Alert
                                variant='destructive'
                                className='border-destructive/50 bg-destructive/15 text-destructive mb-4'>
                                <AlertTitle className='text-destructive'>Error</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                        {/* VideoOutput hidden - feature temporarily disabled
                        {mode === 'video' ? (
                            <VideoOutput
                                videoBatch={latestVideoBatch}
                                viewIndex={videoViewIndex}
                                onViewChange={setVideoViewIndex}
                                isLoading={isGeneratingVideo}
                                elapsedSeconds={videoElapsedSeconds}
                            />
                        ) : (
                        */}
                        <ImageOutput
                            imageBatch={latestImageBatch}
                            viewMode={imageOutputView}
                            onViewChange={setImageOutputView}
                            altText='Generated image output'
                            isLoading={isLoading}
                            isPreparing={isSendingToRef}
                            onSendToEdit={handleUseAsReference}
                            baseImagePreviewUrl={genReferenceImagePreviewUrls[0] || null}
                            streamingPreviewImages={streamingPreviewImages}
                            completedCount={completedImageCount}
                            loadingCount={genN[0]}
                            // onSendToVideo={handleSendToVideo} // Disabled - video feature temporarily hidden
                        />
                        {/* )} */}
                    </div>
                </div>

                <div className='min-h-[450px]'>
                    <HistoryPanel
                        history={history}
                        onSelectImage={handleHistorySelect}
                        onClearHistory={handleClearHistory}
                        getImageSrc={getImageSrc}
                        onDeleteItemRequest={handleRequestDeleteItem}
                        itemPendingDeleteConfirmation={itemToDeleteConfirm}
                        onConfirmDeletion={handleConfirmDeletion}
                        onCancelDeletion={handleCancelDeletion}
                        deletePreferenceDialogValue={dialogCheckboxStateSkipConfirm}
                        onDeletePreferenceDialogChange={setDialogCheckboxStateSkipConfirm}
                        onReusePrompt={handleReusePrompt}
                        onSendToEdit={handleUseAsReference}
                        onReuseWithReferences={handleReuseWithReferences}
                    />
                </div>
            </div>
        </main>
    );
}

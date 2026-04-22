'use client';

import { EditingForm, type EditingFormData } from '@/components/editing-form';
import { GenerationForm, type GenerationFormData } from '@/components/generation-form';
import { HistoryPanel } from '@/components/history-panel';
import { ImageOutput } from '@/components/image-output';
import { PasswordDialog } from '@/components/password-dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
};

type DrawnPoint = {
    x: number;
    y: number;
    size: number;
};

const MAX_EDIT_IMAGES = 5;
const MAX_PROMPT_ENHANCE_IMAGES = 3;

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

type ApiImageResponseItem = {
    filename: string;
    b64_json?: string;
    output_format: string;
    path?: string;
};

export default function HomePage() {
    const [mode, setMode] = React.useState<'generate' | 'edit' | 'video'>('generate');
    const [isPasswordRequiredByBackend, setIsPasswordRequiredByBackend] = React.useState<boolean | null>(null);
    const [clientPasswordHash, setClientPasswordHash] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [isEnhancingGenPrompt, setIsEnhancingGenPrompt] = React.useState(false);
    const [isEnhancingEditPrompt, setIsEnhancingEditPrompt] = React.useState(false);
    const [isSurprisingGen, setIsSurprisingGen] = React.useState(false);
    const [isSurprisingEdit, setIsSurprisingEdit] = React.useState(false);
    const [isSendingToEdit, setIsSendingToEdit] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [genPromptEnhanceError, setGenPromptEnhanceError] = React.useState<string | null>(null);
    const [editPromptEnhanceError, setEditPromptEnhanceError] = React.useState<string | null>(null);
    const [latestImageBatch, setLatestImageBatch] = React.useState<{ path: string; filename: string }[] | null>(null);
    const [imageOutputView, setImageOutputView] = React.useState<'grid' | number>('grid');
    const [history, setHistory] = React.useState<HistoryMetadata[]>([]);
    const [isInitialLoad, setIsInitialLoad] = React.useState(true);
    const [blobUrlCache, setBlobUrlCache] = React.useState<Record<string, string>>({});
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = React.useState(false);
    const [passwordDialogContext, setPasswordDialogContext] = React.useState<'initial' | 'retry'>('initial');
    const [lastApiCallArgs, setLastApiCallArgs] = React.useState<[GenerationFormData | EditingFormData] | null>(null);
    const [skipDeleteConfirmation, setSkipDeleteConfirmation] = React.useState<boolean>(false);
    const [itemToDeleteConfirm, setItemToDeleteConfirm] = React.useState<HistoryMetadata | null>(null);
    const [dialogCheckboxStateSkipConfirm, setDialogCheckboxStateSkipConfirm] = React.useState<boolean>(false);

    const allDbImages = useLiveQuery<ImageRecord[] | undefined>(() => db.images.toArray(), []);

    const [editImageFiles, setEditImageFiles] = React.useState<File[]>([]);
    const [editSourceImagePreviewUrls, setEditSourceImagePreviewUrls] = React.useState<string[]>([]);
    const [editPrompt, setEditPrompt] = React.useState('');
    const [editN, setEditN] = React.useState([1]);
    const [editSize, setEditSize] = React.useState<EditingFormData['size']>('auto');
    const [editQuality, setEditQuality] = React.useState<EditingFormData['quality']>('low');
    const [editBrushSize, setEditBrushSize] = React.useState([20]);
    const [editShowMaskEditor, setEditShowMaskEditor] = React.useState(false);
    const [editGeneratedMaskFile, setEditGeneratedMaskFile] = React.useState<File | null>(null);
    const [editIsMaskSaved, setEditIsMaskSaved] = React.useState(false);
    const [editOriginalImageSize, setEditOriginalImageSize] = React.useState<{ width: number; height: number } | null>(
        null
    );
    const [editDrawnPoints, setEditDrawnPoints] = React.useState<DrawnPoint[]>([]);
    const [editMaskPreviewUrl, setEditMaskPreviewUrl] = React.useState<string | null>(null);

    const [genModel, setGenModel] = React.useState<GenerationFormData['model']>(DEFAULT_GPT_IMAGE_MODEL);
    const [genPrompt, setGenPrompt] = React.useState('');
    const [genN, setGenN] = React.useState([1]);
    const [genSize, setGenSize] = React.useState<GenerationFormData['size']>('auto');
    const [genQuality, setGenQuality] = React.useState<GenerationFormData['quality']>('low');
    const [genOutputFormat, setGenOutputFormat] = React.useState<GenerationFormData['output_format']>('png');
    const [genCompression, setGenCompression] = React.useState([100]);
    const [genBackground, setGenBackground] = React.useState<GenerationFormData['background']>('auto');

    const [editModel, setEditModel] = React.useState<EditingFormData['model']>(DEFAULT_GPT_IMAGE_MODEL);

    const [videoPrompt, setVideoPrompt] = React.useState('');
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

    // Streaming previews are on by default (auto-disabled when multiple images are requested)
    const [partialImages] = React.useState<1 | 2 | 3>(3);
    // Streaming preview images (base64 data URLs for partial images during streaming)
    const [streamingPreviewImages, setStreamingPreviewImages] = React.useState<Map<number, string>>(new Map());

    const isStreamingAllowed = React.useMemo(() => {
        if (mode === 'generate') return genN[0] === 1;
        if (mode === 'edit') return editN[0] === 1;
        return false;
    }, [mode, genN, editN]);

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

    React.useEffect(() => {
        return () => {
            console.log('Revoking blob URLs:', Object.keys(blobUrlCache).length);
            Object.values(blobUrlCache).forEach((url) => {
                if (url.startsWith('blob:')) {
                    URL.revokeObjectURL(url);
                }
            });
        };
    }, [blobUrlCache]);

    React.useEffect(() => {
        return () => {
            if (videoReferencePreviewUrl && videoReferencePreviewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(videoReferencePreviewUrl);
            }
        };
    }, [videoReferencePreviewUrl]);

    React.useEffect(() => {
        return () => {
            editSourceImagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [editSourceImagePreviewUrls]);

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
        return () => {
            editSourceImagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [editSourceImagePreviewUrls]);

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
            if (mode !== 'edit' || !event.clipboardData) {
                return;
            }

            if (editImageFiles.length >= MAX_EDIT_IMAGES) {
                alert(`Cannot paste: Maximum of ${MAX_EDIT_IMAGES} images reached.`);
                return;
            }

            const items = event.clipboardData.items;
            let imageFound = false;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        event.preventDefault();
                        imageFound = true;

                        // Compress async; previews use the (possibly smaller) processed file.
                        compressImageForUpload(file)
                            .then((processed) => {
                                const previewUrl = URL.createObjectURL(processed);
                                setEditImageFiles((prevFiles) => [...prevFiles, processed]);
                                setEditSourceImagePreviewUrls((prevUrls) => [...prevUrls, previewUrl]);
                                console.log('Pasted image added:', processed.name);
                            })
                            .catch((err) => {
                                console.error('Failed to process pasted image, using original:', err);
                                const previewUrl = URL.createObjectURL(file);
                                setEditImageFiles((prevFiles) => [...prevFiles, file]);
                                setEditSourceImagePreviewUrls((prevUrls) => [...prevUrls, previewUrl]);
                            });

                        break;
                    }
                }
            }
            if (!imageFound) {
                console.log('Paste event did not contain a recognized image file.');
            }
        };

        window.addEventListener('paste', handlePaste);

        return () => {
            window.removeEventListener('paste', handlePaste);
        };
    }, [mode, editImageFiles.length]);

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

    const handlePromptEnhance = async (targetMode: 'generate' | 'edit' | 'video') => {
        const isGenerate = targetMode === 'generate';
        const isEdit = targetMode === 'edit';
        const targetPrompt = isGenerate ? genPrompt : isEdit ? editPrompt : videoPrompt;
        const setLoading = isGenerate
            ? setIsEnhancingGenPrompt
            : isEdit
              ? setIsEnhancingEditPrompt
              : setIsEnhancingVideoPrompt;
        const setPrompt = isGenerate ? setGenPrompt : isEdit ? setEditPrompt : setVideoPrompt;
        const setEnhanceError = isGenerate
            ? setGenPromptEnhanceError
            : isEdit
              ? setEditPromptEnhanceError
              : setVideoPromptEnhanceError;

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

        let referenceImagesPayload: { dataUrl: string; alt?: string }[] = [];
        let videoHasReferenceImage = false;

        if (targetMode === 'edit' && editImageFiles.length > 0) {
            try {
                const filesToSend = editImageFiles.slice(0, MAX_PROMPT_ENHANCE_IMAGES);
                referenceImagesPayload = await Promise.all(
                    filesToSend.map(async (file, index) => ({
                        dataUrl: await fileToDataUrl(file),
                        alt: `Reference image ${index + 1} for edit${file.name ? ` (${file.name})` : ''}`
                    }))
                );
            } catch (readError) {
                const message =
                    readError instanceof Error
                        ? readError.message
                        : 'Failed to attach reference images for prompt enhancement.';
                setEnhanceError(message);
                setLoading(false);
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

            if (!result.prompt) {
                throw new Error('No enhanced prompt returned.');
            }

            setPrompt(result.prompt as string);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to enhance prompt.';
            setEnhanceError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleSurpriseMe = async (targetMode: 'generate' | 'edit') => {
        const isGenerate = targetMode === 'generate';
        const setLoading = isGenerate ? setIsSurprisingGen : setIsSurprisingEdit;
        const setPrompt = isGenerate ? setGenPrompt : setEditPrompt;
        const setSurpriseError = isGenerate ? setGenPromptEnhanceError : setEditPromptEnhanceError;

        if (isPasswordRequiredByBackend && !clientPasswordHash) {
            setError('Password is required. Please configure the password by clicking the lock icon.');
            setPasswordDialogContext('initial');
            setIsPasswordDialogOpen(true);
            return;
        }

        setSurpriseError(null);
        setLoading(true);

        let referenceImagesPayload: { dataUrl: string; alt?: string }[] = [];

        if (targetMode === 'edit' && editImageFiles.length > 0) {
            try {
                const filesToSend = editImageFiles.slice(0, MAX_PROMPT_ENHANCE_IMAGES);
                referenceImagesPayload = await Promise.all(
                    filesToSend.map(async (file, index) => ({
                        dataUrl: await fileToDataUrl(file),
                        alt: `Reference image ${index + 1} for edit${file.name ? ` (${file.name})` : ''}`
                    }))
                );
            } catch (readError) {
                const message =
                    readError instanceof Error
                        ? readError.message
                        : 'Failed to attach reference images for surprise prompt.';
                setSurpriseError(message);
                setLoading(false);
                return;
            }
        }

        try {
            const response = await fetch('/api/surprise-me', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: targetMode,
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

            if (!result.prompt) {
                throw new Error('No surprise prompt returned.');
            }

            setPrompt(result.prompt as string);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to generate a surprise prompt.';
            setSurpriseError(message);
        } finally {
            setLoading(false);
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
                                quality: 'auto',
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

    const handleApiCall = async (formData: GenerationFormData | EditingFormData) => {
        const startTime = Date.now();
        let durationMs = 0;

        setIsLoading(true);
        setError(null);
        setLatestImageBatch(null);
        setImageOutputView('grid');
        setStreamingPreviewImages(new Map());

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
        apiFormData.append('mode', mode);

        // Add streaming parameters when allowed (single-image requests only)
        if (isStreamingAllowed) {
            apiFormData.append('stream', 'true');
            apiFormData.append('partial_images', partialImages.toString());
        }

        if (mode === 'generate') {
            const genData = formData as GenerationFormData;
            apiFormData.append('model', genData.model);
            apiFormData.append('prompt', genData.prompt);
            apiFormData.append('n', genData.n.toString());
            apiFormData.append('size', genData.size);
            apiFormData.append('quality', genData.quality);
            apiFormData.append('output_format', genData.output_format);
            if (
                (genData.output_format === 'jpeg' || genData.output_format === 'webp') &&
                genData.output_compression !== undefined
            ) {
                apiFormData.append('output_compression', genData.output_compression.toString());
            }
            apiFormData.append('background', genData.background);
            apiFormData.append('moderation', genData.moderation);
        } else {
            const editData = formData as EditingFormData;
            apiFormData.append('model', editData.model);
            apiFormData.append('prompt', editData.prompt);
            apiFormData.append('n', editData.n.toString());
            apiFormData.append('size', editData.size);
            apiFormData.append('quality', editData.quality);

            editData.imageFiles.forEach((file, index) => {
                apiFormData.append(`image_${index}`, file, file.name);
            });
            if (editData.maskFile) {
                apiFormData.append('mask', editData.maskFile, editData.maskFile.name);
            }
        }

        console.log('Sending request to /api/images with mode:', mode, 'streaming:', isStreamingAllowed);

        try {
            const response = await fetch('/api/images', {
                method: 'POST',
                body: apiFormData
            });

            // Check if response is SSE (streaming)
            const contentType = response.headers.get('content-type');
            if (contentType?.includes('text/event-stream')) {
                console.log('Handling SSE streaming response...');

                if (!response.body) {
                    throw new Error('Response body is null');
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });

                    // Process complete SSE events
                    const lines = buffer.split('\n\n');
                    buffer = lines.pop() || ''; // Keep incomplete event in buffer

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.slice(6);
                            try {
                                const event = JSON.parse(jsonStr);
                                console.log('SSE Event:', event.type);

                                if (event.type === 'partial_image') {
                                    // Update streaming preview with partial image
                                    const imageIndex = event.index ?? 0;
                                    const dataUrl = `data:image/png;base64,${event.b64_json}`;
                                    setStreamingPreviewImages((prev) => {
                                        const newMap = new Map(prev);
                                        newMap.set(imageIndex, dataUrl);
                                        return newMap;
                                    });
                                    console.log(`Partial image ${event.partial_image_index} for index ${imageIndex}`);
                                } else if (event.type === 'completed') {
                                    console.log(`Completed image ${event.index}: ${event.filename}`);
                                } else if (event.type === 'error') {
                                    throw new Error(event.error || 'Streaming error occurred');
                                } else if (event.type === 'done') {
                                    // Finalize with all completed images
                                    durationMs = Date.now() - startTime;
                                    console.log(`Streaming completed. Duration: ${durationMs}ms`);

                                    if (event.images && event.images.length > 0) {
                                        let historyQuality: GenerationFormData['quality'] = 'auto';
                                        let historyBackground: GenerationFormData['background'] = 'auto';
                                        let historyModeration: GenerationFormData['moderation'] = 'low';
                                        let historyOutputFormat: GenerationFormData['output_format'] = 'png';
                                        let historyPrompt: string = '';

                                        if (mode === 'generate') {
                                            const genData = formData as GenerationFormData;
                                            historyQuality = genData.quality;
                                            historyBackground = genData.background;
                                            historyModeration = 'low';
                                            historyOutputFormat = genData.output_format;
                                            historyPrompt = genData.prompt;
                                        } else {
                                            const editData = formData as EditingFormData;
                                            historyQuality = editData.quality;
                                            historyBackground = 'auto';
                                            historyModeration = 'low';
                                            historyOutputFormat = 'png';
                                            historyPrompt = editData.prompt;
                                        }

                                        const currentModel = formData.model;
                                        const costDetails = calculateApiCost(event.usage, currentModel);

                                        const batchTimestamp = Date.now();
                                        const newHistoryEntry: HistoryMetadata = {
                                            timestamp: batchTimestamp,
                                            images: event.images.map((img: { filename: string }) => ({
                                                filename: img.filename
                                            })),
                                            storageModeUsed: effectiveStorageModeClient,
                                            durationMs: durationMs,
                                            quality: historyQuality,
                                            background: historyBackground,
                                            moderation: historyModeration,
                                            output_format: historyOutputFormat,
                                            prompt: historyPrompt,
                                            mode: mode,
                                            costDetails: costDetails,
                                            model: currentModel
                                        };

                                        let newImageBatchPromises: Promise<{
                                            path: string;
                                            filename: string;
                                        } | null>[] = [];
                                        if (effectiveStorageModeClient === 'indexeddb') {
                                            console.log('Processing streaming images for IndexedDB storage...');
                                            newImageBatchPromises = event.images.map(
                                                async (img: ApiImageResponseItem) => {
                                                    if (img.b64_json) {
                                                        try {
                                                            const byteCharacters = atob(img.b64_json);
                                                            const byteNumbers = new Array(byteCharacters.length);
                                                            for (let i = 0; i < byteCharacters.length; i++) {
                                                                byteNumbers[i] = byteCharacters.charCodeAt(i);
                                                            }
                                                            const byteArray = new Uint8Array(byteNumbers);

                                                            const actualMimeType = getMimeTypeFromFormat(
                                                                img.output_format
                                                            );
                                                            const blob = new Blob([byteArray], {
                                                                type: actualMimeType
                                                            });

                                                            await db.images.put({ filename: img.filename, blob });
                                                            console.log(
                                                                `Saved ${img.filename} to IndexedDB with type ${actualMimeType}.`
                                                            );

                                                            const blobUrl = URL.createObjectURL(blob);
                                                            setBlobUrlCache((prev) => ({
                                                                ...prev,
                                                                [img.filename]: blobUrl
                                                            }));

                                                            return { filename: img.filename, path: blobUrl };
                                                        } catch (dbError) {
                                                            console.error(
                                                                `Error saving blob ${img.filename} to IndexedDB:`,
                                                                dbError
                                                            );
                                                            setError(
                                                                `Failed to save image ${img.filename} to local database.`
                                                            );
                                                            return null;
                                                        }
                                                    } else {
                                                        console.warn(
                                                            `Image ${img.filename} missing b64_json in indexeddb mode.`
                                                        );
                                                        return null;
                                                    }
                                                }
                                            );
                                        } else {
                                            newImageBatchPromises = event.images
                                                .filter((img: ApiImageResponseItem) => !!img.path)
                                                .map((img: ApiImageResponseItem) =>
                                                    Promise.resolve({
                                                        path: img.path!,
                                                        filename: img.filename
                                                    })
                                                );
                                        }

                                        const processedImages = (await Promise.all(newImageBatchPromises)).filter(
                                            Boolean
                                        ) as {
                                            path: string;
                                            filename: string;
                                        }[];

                                        setLatestImageBatch(processedImages);
                                        setImageOutputView(processedImages.length > 1 ? 'grid' : 0);
                                        setStreamingPreviewImages(new Map()); // Clear streaming previews

                                        setHistory((prevHistory) => [newHistoryEntry, ...prevHistory]);
                                    }
                                }
                            } catch (parseError) {
                                console.error('Error parsing SSE event:', parseError);
                            }
                        }
                    }
                }

                return; // Exit early for streaming
            }

            // Non-streaming response handling (original code)
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

            if (result.images && result.images.length > 0) {
                durationMs = Date.now() - startTime;
                console.log(`API call successful. Duration: ${durationMs}ms`);

                let historyQuality: GenerationFormData['quality'] = 'auto';
                let historyBackground: GenerationFormData['background'] = 'auto';
                let historyModeration: GenerationFormData['moderation'] = 'low';
                let historyOutputFormat: GenerationFormData['output_format'] = 'png';
                let historyPrompt: string = '';

                if (mode === 'generate') {
                    const genData = formData as GenerationFormData;
                    historyQuality = genData.quality;
                    historyBackground = genData.background;
                    historyModeration = 'low';
                    historyOutputFormat = genData.output_format;
                    historyPrompt = genData.prompt;
                } else {
                    const editData = formData as EditingFormData;
                    historyQuality = editData.quality;
                    historyBackground = 'auto';
                    historyModeration = 'low';
                    historyOutputFormat = 'png';
                    historyPrompt = editData.prompt;
                }

                const currentModel = formData.model;
                const costDetails = calculateApiCost(result.usage, currentModel);

                const batchTimestamp = Date.now();
                const newHistoryEntry: HistoryMetadata = {
                    timestamp: batchTimestamp,
                    images: result.images.map((img: { filename: string }) => ({ filename: img.filename })),
                    storageModeUsed: effectiveStorageModeClient,
                    durationMs: durationMs,
                    quality: historyQuality,
                    background: historyBackground,
                    moderation: historyModeration,
                    output_format: historyOutputFormat,
                    prompt: historyPrompt,
                    mode: mode,
                    costDetails: costDetails,
                    model: currentModel
                };

                let newImageBatchPromises: Promise<{ path: string; filename: string } | null>[] = [];
                if (effectiveStorageModeClient === 'indexeddb') {
                    console.log('Processing images for IndexedDB storage...');
                    newImageBatchPromises = result.images.map(async (img: ApiImageResponseItem) => {
                        if (img.b64_json) {
                            try {
                                const byteCharacters = atob(img.b64_json);
                                const byteNumbers = new Array(byteCharacters.length);
                                for (let i = 0; i < byteCharacters.length; i++) {
                                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                                }
                                const byteArray = new Uint8Array(byteNumbers);

                                const actualMimeType = getMimeTypeFromFormat(img.output_format);
                                const blob = new Blob([byteArray], { type: actualMimeType });

                                await db.images.put({ filename: img.filename, blob });
                                console.log(`Saved ${img.filename} to IndexedDB with type ${actualMimeType}.`);

                                const blobUrl = URL.createObjectURL(blob);
                                setBlobUrlCache((prev) => ({ ...prev, [img.filename]: blobUrl }));

                                return { filename: img.filename, path: blobUrl };
                            } catch (dbError) {
                                console.error(`Error saving blob ${img.filename} to IndexedDB:`, dbError);
                                setError(`Failed to save image ${img.filename} to local database.`);
                                return null;
                            }
                        } else {
                            console.warn(`Image ${img.filename} missing b64_json in indexeddb mode.`);
                            return null;
                        }
                    });
                } else {
                    newImageBatchPromises = result.images
                        .filter((img: ApiImageResponseItem) => !!img.path)
                        .map((img: ApiImageResponseItem) =>
                            Promise.resolve({
                                path: img.path!,
                                filename: img.filename
                            })
                        );
                }

                const processedImages = (await Promise.all(newImageBatchPromises)).filter(Boolean) as {
                    path: string;
                    filename: string;
                }[];

                setLatestImageBatch(processedImages);
                setImageOutputView(processedImages.length > 1 ? 'grid' : 0);

                setHistory((prevHistory) => [newHistoryEntry, ...prevHistory]);
            } else {
                setLatestImageBatch(null);
                throw new Error('API response did not contain valid image data or filenames.');
            }
        } catch (err: unknown) {
            durationMs = Date.now() - startTime;
            console.error(`API Call Error after ${durationMs}ms:`, err);
            const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
            setError(errorMessage);
            setLatestImageBatch(null);
            setStreamingPreviewImages(new Map());
        } finally {
            if (durationMs === 0) durationMs = Date.now() - startTime;
            setIsLoading(false);
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
                if (!options.skipModeChange) setMode(item.mode);
            }
        });
    };

    const handleClearHistory = async () => {
        const confirmationMessage =
            effectiveStorageModeClient === 'indexeddb'
                ? 'Are you sure you want to clear the entire image history? In IndexedDB mode, this will also permanently delete all stored images. This cannot be undone.'
                : 'Are you sure you want to clear the entire image history? This cannot be undone.';

        if (window.confirm(confirmationMessage)) {
            setHistory([]);
            setLatestImageBatch(null);
            setLatestVideoBatch(null);
            setImageOutputView('grid');
            setVideoViewIndex(0);
            setError(null);

            try {
                localStorage.removeItem('openaiImageHistory');
                console.log('Cleared history metadata from localStorage.');

                if (effectiveStorageModeClient === 'indexeddb') {
                    await db.images.clear();
                    console.log('Cleared images from IndexedDB.');

                    setBlobUrlCache({});
                }
            } catch (e) {
                console.error('Failed during history clearing:', e);
                setError(`Failed to clear history: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    };

    const handleSendToEdit = async (filename: string) => {
        if (isSendingToEdit) return;
        setIsSendingToEdit(true);
        setError(null);

        const alreadyExists = editImageFiles.some((file) => file.name === filename);
        if (mode === 'edit' && alreadyExists) {
            console.log(`Image ${filename} already in edit list.`);
            setIsSendingToEdit(false);
            return;
        }

        if (mode === 'edit' && editImageFiles.length >= MAX_EDIT_IMAGES) {
            setError(`Cannot add more than ${MAX_EDIT_IMAGES} images to the edit form.`);
            setIsSendingToEdit(false);
            return;
        }

        console.log(`Sending image ${filename} to edit...`);

        try {
            let blob: Blob | undefined;
            let mimeType: string = 'image/png';

            if (effectiveStorageModeClient === 'indexeddb') {
                console.log(`Fetching blob ${filename} from IndexedDB...`);

                const record = allDbImages?.find((img) => img.filename === filename);
                if (record?.blob) {
                    blob = record.blob;
                    mimeType = blob.type || mimeType;
                    console.log(`Found blob ${filename} in IndexedDB.`);
                } else {
                    throw new Error(`Image ${filename} not found in local database.`);
                }
            } else {
                console.log(`Fetching image ${filename} from API...`);
                const response = await fetch(`/api/image/${filename}`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch image: ${response.statusText}`);
                }
                blob = await response.blob();
                mimeType = response.headers.get('Content-Type') || mimeType;
                console.log(`Fetched image ${filename} from API.`);
            }

            if (!blob) {
                throw new Error(`Could not retrieve image data for ${filename}.`);
            }

            const newFile = new File([blob], filename, { type: mimeType });
            const newPreviewUrl = URL.createObjectURL(blob);

            editSourceImagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));

            setEditImageFiles([newFile]);
            setEditSourceImagePreviewUrls([newPreviewUrl]);

            setMode('edit');

            console.log(`Successfully set ${filename} in edit form.`);
        } catch (err: unknown) {
            console.error('Error sending image to edit:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to send image to edit form.';
            setError(errorMessage);
        } finally {
            setIsSendingToEdit(false);
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

        const { images: imagesInEntry = [], videos: videosInEntry = [], storageModeUsed, timestamp } = item;
        const filenamesToDelete = [...imagesInEntry, ...videosInEntry].map((asset) => asset.filename);

        try {
            if (storageModeUsed === 'indexeddb') {
                console.log('Deleting from IndexedDB:', filenamesToDelete);
                await db.images.where('filename').anyOf(filenamesToDelete).delete();
                setBlobUrlCache((prevCache) => {
                    const newCache = { ...prevCache };
                    filenamesToDelete.forEach((fn) => delete newCache[fn]);
                    return newCache;
                });
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

    const handleReusePrompt = (prompt: string, targetMode: 'generate' | 'edit' | 'video') => {
        if (targetMode === 'generate') {
            setGenPrompt(prompt);
            setMode('generate');
        } else if (targetMode === 'edit') {
            setEditPrompt(prompt);
            setMode('edit');
        } else if (targetMode === 'video') {
            setVideoPrompt(prompt);
            setMode('video');
        }
    };

    return (
        <main className='flex min-h-screen flex-col items-center bg-background px-5 py-8 text-foreground md:px-10 md:py-12 lg:px-16 lg:py-16'>
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
            <div className='w-full max-w-[1400px] space-y-8'>
                <header className='rise-in flex flex-col gap-6 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between'>
                    <div className='flex flex-col gap-3'>
                        <h1 className='font-display text-5xl leading-[0.95] tracking-tight text-foreground md:text-6xl lg:text-7xl'>
                            gpt<span className='italic text-primary'>·image</span>
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
                                currentMode={mode}
                                onModeChange={setMode}
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
                                streamingAllowed={genN[0] === 1}
                                onEnhancePrompt={() => handlePromptEnhance('generate')}
                                isEnhancingPrompt={isEnhancingGenPrompt}
                                enhanceError={genPromptEnhanceError}
                                onSurpriseMe={() => handleSurpriseMe('generate')}
                                isSurprising={isSurprisingGen}
                            />
                        </div>
                        <div className={mode === 'edit' ? 'block h-full w-full' : 'hidden'}>
                            <EditingForm
                                onSubmit={handleApiCall}
                                isLoading={isLoading || isSendingToEdit}
                                currentMode={mode}
                                onModeChange={setMode}
                                isPasswordRequiredByBackend={isPasswordRequiredByBackend}
                                clientPasswordHash={clientPasswordHash}
                                onOpenPasswordDialog={handleOpenPasswordDialog}
                                editModel={editModel}
                                setEditModel={setEditModel}
                                imageFiles={editImageFiles}
                                sourceImagePreviewUrls={editSourceImagePreviewUrls}
                                setImageFiles={setEditImageFiles}
                                setSourceImagePreviewUrls={setEditSourceImagePreviewUrls}
                                maxImages={MAX_EDIT_IMAGES}
                                editPrompt={editPrompt}
                                setEditPrompt={setEditPrompt}
                                editN={editN}
                                setEditN={setEditN}
                                editSize={editSize}
                                setEditSize={setEditSize}
                                editQuality={editQuality}
                                setEditQuality={setEditQuality}
                                editBrushSize={editBrushSize}
                                setEditBrushSize={setEditBrushSize}
                                editShowMaskEditor={editShowMaskEditor}
                                setEditShowMaskEditor={setEditShowMaskEditor}
                                editGeneratedMaskFile={editGeneratedMaskFile}
                                setEditGeneratedMaskFile={setEditGeneratedMaskFile}
                                editIsMaskSaved={editIsMaskSaved}
                                setEditIsMaskSaved={setEditIsMaskSaved}
                                editOriginalImageSize={editOriginalImageSize}
                                setEditOriginalImageSize={setEditOriginalImageSize}
                                editDrawnPoints={editDrawnPoints}
                                setEditDrawnPoints={setEditDrawnPoints}
                                editMaskPreviewUrl={editMaskPreviewUrl}
                                setEditMaskPreviewUrl={setEditMaskPreviewUrl}
                                streamingAllowed={editN[0] === 1}
                                onEnhancePrompt={() => handlePromptEnhance('edit')}
                                isEnhancingPrompt={isEnhancingEditPrompt}
                                enhanceError={editPromptEnhanceError}
                                onSurpriseMe={() => handleSurpriseMe('edit')}
                                isSurprising={isSurprisingEdit}
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
                            <Alert variant='destructive' className='mb-4 border-destructive/50 bg-destructive/15 text-destructive'>
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
                            isLoading={isLoading || isSendingToEdit}
                            onSendToEdit={handleSendToEdit}
                            currentMode={mode}
                            baseImagePreviewUrl={editSourceImagePreviewUrls[0] || null}
                            streamingPreviewImages={streamingPreviewImages}
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
                        onSendToEdit={handleSendToEdit}
                    />
                </div>
            </div>
        </main>
    );
}

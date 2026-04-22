'use client';

import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GPT_IMAGE_MODELS, type GptImageModel } from '@/lib/cost-utils';
import {
    Upload,
    Eraser,
    Save,
    Square,
    RectangleHorizontal,
    RectangleVertical,
    Sparkles,
    Tally1,
    Tally2,
    Tally3,
    Loader2,
    X,
    ScanEye,
    UploadCloud,
    Lock,
    LockOpen,
    ClipboardPaste,
    Link2,
    ChevronDown,
    ChevronRight,
    Settings2
} from 'lucide-react';
import Image from 'next/image';
import * as React from 'react';

type DrawnPoint = {
    x: number;
    y: number;
    size: number;
};

export type EditingFormData = {
    prompt: string;
    n: number;
    size: '1024x1024' | '1536x1024' | '1024x1536' | 'auto';
    quality: 'low' | 'medium' | 'high' | 'auto';
    imageFiles: File[];
    maskFile: File | null;
    model: GptImageModel;
};

type EditingFormProps = {
    onSubmit: (data: EditingFormData) => void;
    isLoading: boolean;
    currentMode: 'generate' | 'edit' | 'video';
    onModeChange: (mode: 'generate' | 'edit' | 'video') => void;
    isPasswordRequiredByBackend: boolean | null;
    clientPasswordHash: string | null;
    onOpenPasswordDialog: () => void;
    editModel: EditingFormData['model'];
    setEditModel: React.Dispatch<React.SetStateAction<EditingFormData['model']>>;
    imageFiles: File[];
    sourceImagePreviewUrls: string[];
    setImageFiles: React.Dispatch<React.SetStateAction<File[]>>;
    setSourceImagePreviewUrls: React.Dispatch<React.SetStateAction<string[]>>;
    maxImages: number;
    editPrompt: string;
    setEditPrompt: React.Dispatch<React.SetStateAction<string>>;
    editN: number[];
    setEditN: React.Dispatch<React.SetStateAction<number[]>>;
    editSize: EditingFormData['size'];
    setEditSize: React.Dispatch<React.SetStateAction<EditingFormData['size']>>;
    editQuality: EditingFormData['quality'];
    setEditQuality: React.Dispatch<React.SetStateAction<EditingFormData['quality']>>;
    editBrushSize: number[];
    setEditBrushSize: React.Dispatch<React.SetStateAction<number[]>>;
    editShowMaskEditor: boolean;
    setEditShowMaskEditor: React.Dispatch<React.SetStateAction<boolean>>;
    editGeneratedMaskFile: File | null;
    setEditGeneratedMaskFile: React.Dispatch<React.SetStateAction<File | null>>;
    editIsMaskSaved: boolean;
    setEditIsMaskSaved: React.Dispatch<React.SetStateAction<boolean>>;
    editOriginalImageSize: { width: number; height: number } | null;
    setEditOriginalImageSize: React.Dispatch<React.SetStateAction<{ width: number; height: number } | null>>;
    editDrawnPoints: DrawnPoint[];
    setEditDrawnPoints: React.Dispatch<React.SetStateAction<DrawnPoint[]>>;
    editMaskPreviewUrl: string | null;
    setEditMaskPreviewUrl: React.Dispatch<React.SetStateAction<string | null>>;
    streamingAllowed: boolean;
    onEnhancePrompt: () => void;
    isEnhancingPrompt: boolean;
    enhanceError: string | null;
};

const RadioItemWithIcon = ({
    value,
    id,
    label,
    Icon
}: {
    value: string;
    id: string;
    label: string;
    Icon: React.ElementType;
}) => (
    <div className='flex items-center space-x-2'>
        <RadioGroupItem
            value={value}
            id={id}
            className='border-white/40 text-white data-[state=checked]:border-white data-[state=checked]:text-white'
        />
        <Label htmlFor={id} className='flex cursor-pointer items-center gap-2 text-base text-white/80'>
            <Icon className='h-5 w-5 text-white/60' />
            {label}
        </Label>
    </div>
);

export function EditingForm({
    onSubmit,
    isLoading,
    currentMode,
    onModeChange,
    isPasswordRequiredByBackend,
    clientPasswordHash,
    onOpenPasswordDialog,
    editModel,
    setEditModel,
    imageFiles,
    sourceImagePreviewUrls,
    setImageFiles,
    setSourceImagePreviewUrls,
    maxImages,
    editPrompt,
    setEditPrompt,
    editN,
    setEditN,
    editSize,
    setEditSize,
    editQuality,
    setEditQuality,
    editBrushSize,
    setEditBrushSize,
    editShowMaskEditor,
    setEditShowMaskEditor,
    editGeneratedMaskFile,
    setEditGeneratedMaskFile,
    editIsMaskSaved,
    setEditIsMaskSaved,
    editOriginalImageSize,
    setEditOriginalImageSize,
    editDrawnPoints,
    setEditDrawnPoints,
    editMaskPreviewUrl,
    setEditMaskPreviewUrl,
    streamingAllowed,
    onEnhancePrompt,
    isEnhancingPrompt,
    enhanceError
}: EditingFormProps) {
    const [firstImagePreviewUrl, setFirstImagePreviewUrl] = React.useState<string | null>(null);
    const [imageUrl, setImageUrl] = React.useState('');
    const [isFetchingImage, setIsFetchingImage] = React.useState(false);
    const [isPastingImage, setIsPastingImage] = React.useState(false);
    const [isAdvancedOpen, setIsAdvancedOpen] = React.useState(false);
    const [imageAddError, setImageAddError] = React.useState<string | null>(null);

    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const visualFeedbackCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const isDrawing = React.useRef(false);
    const lastPos = React.useRef<{ x: number; y: number } | null>(null);
    const maskInputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        if (editOriginalImageSize) {
            if (!visualFeedbackCanvasRef.current) {
                visualFeedbackCanvasRef.current = document.createElement('canvas');
            }
            visualFeedbackCanvasRef.current.width = editOriginalImageSize.width;
            visualFeedbackCanvasRef.current.height = editOriginalImageSize.height;
        }
    }, [editOriginalImageSize]);

    React.useEffect(() => {
        setEditGeneratedMaskFile(null);
        setEditIsMaskSaved(false);
        setEditOriginalImageSize(null);
        setFirstImagePreviewUrl(null);
        setEditDrawnPoints([]);
        setEditMaskPreviewUrl(null);

        if (imageFiles.length > 0 && sourceImagePreviewUrls.length > 0) {
            const img = new window.Image();
            img.onload = () => {
                setEditOriginalImageSize({ width: img.width, height: img.height });
            };
            img.src = sourceImagePreviewUrls[0];
            setFirstImagePreviewUrl(sourceImagePreviewUrls[0]);
        } else {
            setEditShowMaskEditor(false);
        }
    }, [
        imageFiles,
        sourceImagePreviewUrls,
        setEditGeneratedMaskFile,
        setEditIsMaskSaved,
        setEditOriginalImageSize,
        setEditDrawnPoints,
        setEditMaskPreviewUrl,
        setEditShowMaskEditor
    ]);

    React.useEffect(() => {
        const displayCtx = canvasRef.current?.getContext('2d');
        const displayCanvas = canvasRef.current;
        const feedbackCanvas = visualFeedbackCanvasRef.current;

        if (!displayCtx || !displayCanvas || !feedbackCanvas || !editOriginalImageSize) return;

        const feedbackCtx = feedbackCanvas.getContext('2d');
        if (!feedbackCtx) return;

        feedbackCtx.clearRect(0, 0, feedbackCanvas.width, feedbackCanvas.height);
        feedbackCtx.fillStyle = 'red';
        editDrawnPoints.forEach((point) => {
            feedbackCtx.beginPath();
            feedbackCtx.arc(point.x, point.y, point.size, 0, Math.PI * 2);
            feedbackCtx.fill();
        });

        displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
        displayCtx.save();
        displayCtx.globalAlpha = 0.5;
        displayCtx.drawImage(feedbackCanvas, 0, 0, displayCanvas.width, displayCanvas.height);
        displayCtx.restore();
    }, [editDrawnPoints, editOriginalImageSize]);

    const getMousePos = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    const addPoint = (x: number, y: number) => {
        setEditDrawnPoints((prevPoints) => [...prevPoints, { x, y, size: editBrushSize[0] }]);
        setEditIsMaskSaved(false);
        setEditMaskPreviewUrl(null);
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        isDrawing.current = true;
        const currentPos = getMousePos(e);
        if (!currentPos) return;
        lastPos.current = currentPos;
        addPoint(currentPos.x, currentPos.y);
    };

    const drawLine = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing.current) return;
        e.preventDefault();
        const currentPos = getMousePos(e);
        if (!currentPos || !lastPos.current) return;

        const dist = Math.hypot(currentPos.x - lastPos.current.x, currentPos.y - lastPos.current.y);
        const angle = Math.atan2(currentPos.y - lastPos.current.y, currentPos.x - lastPos.current.x);
        const step = Math.max(1, editBrushSize[0] / 4);

        for (let i = step; i < dist; i += step) {
            const x = lastPos.current.x + Math.cos(angle) * i;
            const y = lastPos.current.y + Math.sin(angle) * i;
            addPoint(x, y);
        }
        addPoint(currentPos.x, currentPos.y);

        lastPos.current = currentPos;
    };

    const drawMaskStroke = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    };

    const stopDrawing = () => {
        isDrawing.current = false;
        lastPos.current = null;
    };

    const handleClearMask = () => {
        setEditDrawnPoints([]);
        setEditGeneratedMaskFile(null);
        setEditIsMaskSaved(false);
        setEditMaskPreviewUrl(null);
    };

    const addImageFilesToForm = (files: File[]) => {
        if (files.length === 0) return;

        setImageAddError(null);

        const availableSlots = maxImages - imageFiles.length;

        if (availableSlots <= 0) {
            setImageAddError(`You can only select up to ${maxImages} images.`);
            return;
        }

        const filesToAdd = files.slice(0, availableSlots);

        if (filesToAdd.length === 0) return;

        if (files.length > filesToAdd.length) {
            setImageAddError(`Only ${availableSlots} slot${availableSlots === 1 ? '' : 's'} left (max ${maxImages}).`);
        }

        setImageFiles((prevFiles) => [...prevFiles, ...filesToAdd]);

        const newFilePromises = filesToAdd.map((file) => {
            return new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('Failed to read image file.'));
                reader.readAsDataURL(file);
            });
        });

        Promise.all(newFilePromises)
            .then((newUrls) => {
                setSourceImagePreviewUrls((prevUrls) => [...prevUrls, ...newUrls]);
            })
            .catch((error) => {
                console.error('Error reading new image files:', error);
                setImageAddError('Failed to read one of the selected images.');
            });
    };

    const generateAndSaveMask = () => {
        if (!editOriginalImageSize || editDrawnPoints.length === 0) {
            setEditGeneratedMaskFile(null);
            setEditIsMaskSaved(false);
            setEditMaskPreviewUrl(null);
            return;
        }

        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = editOriginalImageSize.width;
        offscreenCanvas.height = editOriginalImageSize.height;
        const offscreenCtx = offscreenCanvas.getContext('2d');

        if (!offscreenCtx) return;

        offscreenCtx.fillStyle = '#000000';
        offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
        offscreenCtx.globalCompositeOperation = 'destination-out';
        editDrawnPoints.forEach((point) => {
            drawMaskStroke(offscreenCtx, point.x, point.y, point.size);
        });

        try {
            const dataUrl = offscreenCanvas.toDataURL('image/png');
            setEditMaskPreviewUrl(dataUrl);
        } catch (e) {
            console.error('Error generating mask preview data URL:', e);
            setEditMaskPreviewUrl(null);
        }

        offscreenCanvas.toBlob((blob) => {
            if (blob) {
                const maskFile = new File([blob], 'generated-mask.png', { type: 'image/png' });
                setEditGeneratedMaskFile(maskFile);
                setEditIsMaskSaved(true);
                console.log('Mask generated and saved to state:', maskFile);
            } else {
                console.error('Failed to generate mask blob.');
                setEditIsMaskSaved(false);
                setEditMaskPreviewUrl(null);
            }
        }, 'image/png');
    };

    const handleImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            const newFiles = Array.from(event.target.files);
            addImageFilesToForm(newFiles);
            event.target.value = '';
        }
    };

    const handlePasteFromClipboard = async () => {
        if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
            setImageAddError('Clipboard paste is not supported in this browser. You can still press Ctrl/Cmd+V.');
            return;
        }

        if (imageFiles.length >= maxImages) {
            setImageAddError(`You can only select up to ${maxImages} images.`);
            return;
        }

        setIsPastingImage(true);
        setImageAddError(null);

        try {
            const items = await navigator.clipboard.read();
            const imageBlobs: Blob[] = [];

            for (const item of items) {
                for (const type of item.types) {
                    if (type.startsWith('image/')) {
                        const blob = await item.getType(type);
                        imageBlobs.push(blob);
                        break;
                    }
                }
            }

            if (imageBlobs.length === 0) {
                throw new Error('Clipboard does not contain an image.');
            }

            const files = imageBlobs.map((blob, index) => {
                const extension = blob.type.split('/')[1] || 'png';
                return new File([blob], `pasted-image-${Date.now()}-${index}.${extension}`, { type: blob.type });
            });

            addImageFilesToForm(files);
        } catch (err: unknown) {
            console.error('Error pasting image from clipboard:', err);
            setImageAddError(err instanceof Error ? err.message : 'Unable to read image from clipboard.');
        } finally {
            setIsPastingImage(false);
        }
    };

    const handleFetchFromUrl = async () => {
        if (!imageUrl.trim()) {
            setImageAddError('Please enter an image URL.');
            return;
        }

        if (imageFiles.length >= maxImages) {
            setImageAddError(`You can only select up to ${maxImages} images.`);
            return;
        }

        setIsFetchingImage(true);
        setImageAddError(null);

        try {
            const parsedUrl = new URL(imageUrl.trim());
            const response = await fetch(parsedUrl.toString());

            if (!response.ok) {
                throw new Error(`Failed to fetch image (status ${response.status}).`);
            }

            const blob = await response.blob();

            if (!blob.type.startsWith('image/')) {
                throw new Error('The URL did not return an image.');
            }

            const extensionFromType = blob.type.split('/')[1] || 'png';
            const urlPathname = parsedUrl.pathname.split('/').pop();
            const inferredName =
                urlPathname && urlPathname.includes('.') ? urlPathname : `fetched-image.${extensionFromType}`;
            const file = new File([blob], inferredName, { type: blob.type });

            addImageFilesToForm([file]);
            setImageUrl('');
        } catch (err: unknown) {
            console.error('Error fetching image from URL:', err);
            setImageAddError(err instanceof Error ? err.message : 'Unable to fetch image from the provided URL.');
        } finally {
            setIsFetchingImage(false);
        }
    };

    const handleRemoveImage = (indexToRemove: number) => {
        setImageFiles((prevFiles) => prevFiles.filter((_, index) => index !== indexToRemove));
        setSourceImagePreviewUrls((prevUrls) => prevUrls.filter((_, index) => index !== indexToRemove));
    };

    const handleMaskFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !editOriginalImageSize) {
            event.target.value = '';
            return;
        }

        if (file.type !== 'image/png') {
            alert('Invalid file type. Please upload a PNG file for the mask.');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        const img = new window.Image();
        const objectUrl = URL.createObjectURL(file);

        img.onload = () => {
            if (img.width !== editOriginalImageSize.width || img.height !== editOriginalImageSize.height) {
                alert(
                    `Mask dimensions (${img.width}x${img.height}) must match the source image dimensions (${editOriginalImageSize.width}x${editOriginalImageSize.height}).`
                );
                URL.revokeObjectURL(objectUrl);
                event.target.value = '';
                return;
            }

            setEditGeneratedMaskFile(file);
            setEditIsMaskSaved(true);
            setEditDrawnPoints([]);

            reader.onloadend = () => {
                setEditMaskPreviewUrl(reader.result as string);
                URL.revokeObjectURL(objectUrl);
            };
            reader.onerror = () => {
                console.error('Error reading mask file for preview.');
                setEditMaskPreviewUrl(null);
                URL.revokeObjectURL(objectUrl);
            };
            reader.readAsDataURL(file);

            event.target.value = '';
        };

        img.onerror = () => {
            alert('Failed to load the uploaded mask image to check dimensions.');
            URL.revokeObjectURL(objectUrl);
            event.target.value = '';
        };

        img.src = objectUrl;
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (imageFiles.length === 0) {
            alert('Please select at least one image to edit.');
            return;
        }
        if (editDrawnPoints.length > 0 && !editGeneratedMaskFile && !editIsMaskSaved) {
            alert('Please save the mask you have drawn before submitting.');
            return;
        }

        const formData: EditingFormData = {
            prompt: editPrompt,
            n: editN[0],
            size: editSize,
            quality: editQuality,
            imageFiles: imageFiles,
            maskFile: editGeneratedMaskFile,
            model: editModel
        };
        onSubmit(formData);
    };

    const displayFileNames = (files: File[]) => {
        if (files.length === 0) return 'No file selected.';
        if (files.length === 1) return files[0].name;
        return `${files.length} files selected`;
    };

    return (
        <Card className='flex w-full flex-col rounded-lg border border-white/10 bg-black lg:h-full lg:overflow-hidden'>
            <CardHeader className='flex items-start justify-between border-b border-white/10 pb-4'>
                <div>
                    <div className='flex items-center'>
                        <CardTitle className='py-1 text-lg font-medium text-white'>Edit Image</CardTitle>
                        {isPasswordRequiredByBackend && (
                            <Button
                                variant='ghost'
                                size='icon'
                                onClick={onOpenPasswordDialog}
                                className='ml-2 text-white/60 hover:text-white'
                                aria-label='Configure Password'>
                                {clientPasswordHash ? <Lock className='h-4 w-4' /> : <LockOpen className='h-4 w-4' />}
                            </Button>
                        )}
                    </div>
                    <CardDescription className='mt-1 text-white/60'>
                        Modify an existing image with a text prompt.
                    </CardDescription>
                </div>
                <ModeToggle currentMode={currentMode} onModeChange={onModeChange} />
            </CardHeader>
            <form onSubmit={handleSubmit} className='flex flex-1 flex-col lg:h-full lg:overflow-hidden'>
                <CardContent className='flex-1 space-y-5 p-4 lg:overflow-y-auto'>
                    {/* Streaming Previews section hidden by request
                    <div className='space-y-2'>
                        <div className='flex items-center gap-2'>
                            <Label className='text-white'>Streaming Previews</Label>
                            <span className='text-xs text-white/60'>Shows in-progress frames while your image updates (adds a small extra cost).</span>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className='h-4 w-4 cursor-help text-white/40 hover:text-white/60' />
                                </TooltipTrigger>
                                <TooltipContent className='max-w-[250px]'>
                                    Each preview image adds ~$0.003 to the cost (100 additional output tokens).
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        {!streamingAllowed && (
                            <p className='text-xs text-white/50'>Available when editing a single image (n = 1).</p>
                        )}
                    </div>
                    */}

                    <div className='space-y-1.5'>
                        <div className='flex items-center justify-between gap-2'>
                            <Label htmlFor='edit-prompt' className='text-white'>
                                Prompt
                            </Label>
                            <div className='flex items-center gap-2'>
                                {enhanceError && <span className='text-xs text-red-300'>{enhanceError}</span>}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type='button'
                                            variant='ghost'
                                            size='sm'
                                            onClick={onEnhancePrompt}
                                            disabled={isLoading || isEnhancingPrompt || !editPrompt.trim()}
                                            className='h-8 gap-1 rounded-full border border-white/15 bg-white/5 px-3 text-xs text-white/80 hover:bg-white/15 hover:text-white'>
                                            {isEnhancingPrompt ? (
                                                <Loader2 className='h-4 w-4 animate-spin' />
                                            ) : (
                                                <Sparkles className='h-4 w-4' />
                                            )}
                                            <span className='hidden sm:inline'>Auto enhance</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className='bg-black text-white'>
                                        Refine the edit prompt with GPT-5.3 Chat.
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        </div>
                        <Textarea
                            id='edit-prompt'
                            placeholder='e.g., Add a party hat to the main subject'
                            value={editPrompt}
                            onChange={(e) => setEditPrompt(e.target.value)}
                            required
                            disabled={isLoading}
                            className='min-h-[80px] rounded-md border border-white/20 bg-black text-white placeholder:text-white/40 focus:border-white/50 focus:ring-white/50'
                        />
                    </div>

                    <div className='space-y-2'>
                        <Label className='text-white'>Source Image(s) [Max: {maxImages}]</Label>
                        <Label
                            htmlFor='image-files-input'
                            className='flex h-10 w-full cursor-pointer items-center justify-between rounded-md border border-white/20 bg-black px-3 py-2 text-sm transition-colors hover:bg-white/5'>
                            <span className='truncate pr-2 text-white/60'>{displayFileNames(imageFiles)}</span>
                            <span className='flex shrink-0 items-center gap-1.5 rounded-md bg-white/10 px-3 py-1 text-xs font-medium text-white/80 hover:bg-white/20'>
                                <Upload className='h-3 w-3' /> Browse...
                            </span>
                        </Label>
                        <Input
                            id='image-files-input'
                            type='file'
                            accept='image/png, image/jpeg, image/webp'
                            multiple
                            onChange={handleImageFileChange}
                            disabled={isLoading || imageFiles.length >= maxImages}
                            className='sr-only'
                        />
                        <div className='flex flex-col gap-3 sm:flex-row'>
                            <Button
                                type='button'
                                variant='outline'
                                onClick={handlePasteFromClipboard}
                                disabled={isLoading || isPastingImage}
                                className='border-white/20 text-white/80 hover:bg-white/10 hover:text-white'>
                                {isPastingImage ? (
                                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                                ) : (
                                    <ClipboardPaste className='mr-2 h-4 w-4' />
                                )}
                                Paste
                            </Button>
                            <div className='flex flex-1 gap-2'>
                                <Input
                                    type='url'
                                    inputMode='url'
                                    placeholder='Paste image URL...'
                                    value={imageUrl}
                                    onChange={(e) => setImageUrl(e.target.value)}
                                    disabled={isLoading || isFetchingImage}
                                    className='border-white/20 bg-black text-white placeholder:text-white/40 focus:border-white/50 focus:ring-white/50'
                                />
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type='button'
                                            variant='outline'
                                            size='icon'
                                            onClick={handleFetchFromUrl}
                                            disabled={isLoading || isFetchingImage || !imageUrl.trim()}
                                            className='shrink-0 border-white/20 text-white/80 hover:bg-white/10 hover:text-white'>
                                            {isFetchingImage ? (
                                                <Loader2 className='h-4 w-4 animate-spin' />
                                            ) : (
                                                <Link2 className='h-4 w-4' />
                                            )}
                                            <span className='sr-only'>Fetch from URL</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className='bg-black text-white'>
                                        Fetch image from URL
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        </div>
                        {imageAddError && <p className='text-xs text-red-300'>{imageAddError}</p>}
                        {sourceImagePreviewUrls.length > 0 && (
                            <div className='flex space-x-2 overflow-x-auto pt-2'>
                                {sourceImagePreviewUrls.map((url, index) => (
                                    <div key={url} className='relative shrink-0'>
                                        <Image
                                            src={url}
                                            alt={`Source preview ${index + 1}`}
                                            width={80}
                                            height={80}
                                            className='rounded border border-white/10 object-cover'
                                            unoptimized
                                        />
                                        <Button
                                            type='button'
                                            variant='destructive'
                                            size='icon'
                                            className='absolute top-0 right-0 h-5 w-5 translate-x-1/3 -translate-y-1/3 transform rounded-full bg-red-600 p-0.5 text-white hover:bg-red-700'
                                            onClick={() => handleRemoveImage(index)}
                                            aria-label={`Remove image ${index + 1}`}>
                                            <X className='h-3 w-3' />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className='space-y-3'>
                        <Label className='block text-white'>Mask</Label>
                        <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() => setEditShowMaskEditor(!editShowMaskEditor)}
                            disabled={isLoading || !editOriginalImageSize}
                            className='w-full justify-start border-white/20 px-3 text-white/80 hover:bg-white/10 hover:text-white'>
                            {editShowMaskEditor
                                ? 'Close Mask Editor'
                                : editGeneratedMaskFile
                                  ? 'Edit Saved Mask'
                                  : 'Create Mask'}
                            {editIsMaskSaved && !editShowMaskEditor && (
                                <span className='ml-auto text-xs text-green-400'>(Saved)</span>
                            )}
                            <ScanEye className='mt-0.5' />
                        </Button>

                        {editShowMaskEditor && firstImagePreviewUrl && editOriginalImageSize && (
                            <div className='space-y-3 rounded-md border border-white/20 bg-black p-3'>
                                <p className='text-xs text-white/60'>
                                    Draw on the image below to mark areas for editing (drawn areas become transparent in
                                    the mask).
                                </p>
                                <div
                                    className='relative mx-auto w-full overflow-hidden rounded border border-white/10'
                                    style={{
                                        maxWidth: `min(100%, ${editOriginalImageSize.width}px)`,
                                        aspectRatio: `${editOriginalImageSize.width} / ${editOriginalImageSize.height}`
                                    }}>
                                    <Image
                                        src={firstImagePreviewUrl}
                                        alt='Image preview for masking'
                                        width={editOriginalImageSize.width}
                                        height={editOriginalImageSize.height}
                                        className='block h-auto w-full'
                                        unoptimized
                                    />
                                    <canvas
                                        ref={canvasRef}
                                        width={editOriginalImageSize.width}
                                        height={editOriginalImageSize.height}
                                        className='absolute top-0 left-0 h-full w-full cursor-crosshair'
                                        onMouseDown={startDrawing}
                                        onMouseMove={drawLine}
                                        onMouseUp={stopDrawing}
                                        onMouseLeave={stopDrawing}
                                        onTouchStart={startDrawing}
                                        onTouchMove={drawLine}
                                        onTouchEnd={stopDrawing}
                                    />
                                </div>
                                <div className='grid grid-cols-1 gap-4 pt-2'>
                                    <div className='space-y-2'>
                                        <Label htmlFor='brush-size-slider' className='text-sm text-white'>
                                            Brush Size: {editBrushSize[0]}px
                                        </Label>
                                        <Slider
                                            id='brush-size-slider'
                                            min={5}
                                            max={100}
                                            step={1}
                                            value={editBrushSize}
                                            onValueChange={setEditBrushSize}
                                            disabled={isLoading}
                                            className='mt-1 [&>button]:border-black [&>button]:bg-white [&>button]:ring-offset-black [&>span:first-child]:h-1 [&>span:first-child>span]:bg-white'
                                        />
                                    </div>
                                </div>
                                <div className='flex items-center justify-between gap-2 pt-3'>
                                    <Button
                                        type='button'
                                        variant='outline'
                                        size='sm'
                                        onClick={() => maskInputRef.current?.click()}
                                        disabled={isLoading || !editOriginalImageSize}
                                        className='mr-auto border-white/20 text-white/80 hover:bg-white/10 hover:text-white'>
                                        <UploadCloud className='mr-1.5 h-4 w-4' /> Upload Mask
                                    </Button>
                                    <Input
                                        ref={maskInputRef}
                                        id='mask-file-input'
                                        type='file'
                                        accept='image/png'
                                        onChange={handleMaskFileChange}
                                        className='sr-only'
                                    />
                                    <div className='flex gap-2'>
                                        <Button
                                            type='button'
                                            variant='outline'
                                            size='sm'
                                            onClick={handleClearMask}
                                            disabled={isLoading}
                                            className='border-white/20 text-white/80 hover:bg-white/10 hover:text-white'>
                                            <Eraser className='mr-1.5 h-4 w-4' /> Clear
                                        </Button>
                                        <Button
                                            type='button'
                                            variant='default'
                                            size='sm'
                                            onClick={generateAndSaveMask}
                                            disabled={isLoading || editDrawnPoints.length === 0}
                                            className='bg-white text-black hover:bg-white/90 disabled:opacity-50'>
                                            <Save className='mr-1.5 h-4 w-4' /> Save Mask
                                        </Button>
                                    </div>
                                </div>
                                {editMaskPreviewUrl && (
                                    <div className='mt-3 border-t border-white/10 pt-3 text-center'>
                                        <Label className='mb-1.5 block text-sm text-white'>
                                            Generated Mask Preview:
                                        </Label>
                                        <div className='inline-block rounded border border-gray-300 bg-white p-1'>
                                            <Image
                                                src={editMaskPreviewUrl}
                                                alt='Generated mask preview'
                                                width={0}
                                                height={134}
                                                className='block max-w-full'
                                                style={{ width: 'auto', height: '134px' }}
                                                unoptimized
                                            />
                                        </div>
                                    </div>
                                )}
                                {editIsMaskSaved && !editMaskPreviewUrl && (
                                    <p className='pt-1 text-center text-xs text-yellow-400'>
                                        Generating mask preview...
                                    </p>
                                )}
                                {editIsMaskSaved && editMaskPreviewUrl && (
                                    <p className='pt-1 text-center text-xs text-green-400'>Mask saved successfully!</p>
                                )}
                            </div>
                        )}
                        {!editShowMaskEditor && editGeneratedMaskFile && (
                            <p className='pt-1 text-xs text-green-400'>Mask applied: {editGeneratedMaskFile.name}</p>
                        )}
                    </div>

                    <div className='space-y-3'>
                        <Label className='block text-white'>Size</Label>
                        <RadioGroup
                            value={editSize}
                            onValueChange={(value) => setEditSize(value as EditingFormData['size'])}
                            disabled={isLoading}
                            className='flex flex-wrap gap-x-5 gap-y-3'>
                            <RadioItemWithIcon value='auto' id='edit-size-auto' label='Auto' Icon={Sparkles} />
                            <RadioItemWithIcon value='1024x1024' id='edit-size-square' label='Square' Icon={Square} />
                            <RadioItemWithIcon
                                value='1536x1024'
                                id='edit-size-landscape'
                                label='Landscape'
                                Icon={RectangleHorizontal}
                            />
                            <RadioItemWithIcon
                                value='1024x1536'
                                id='edit-size-portrait'
                                label='Portrait'
                                Icon={RectangleVertical}
                            />
                        </RadioGroup>
                    </div>

                    <div className='pt-2'>
                        <Button
                            type='button'
                            variant='ghost'
                            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                            className='flex w-full items-center justify-between rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10'>
                            <div className='flex items-center gap-2'>
                                <Settings2 className='h-4 w-4' />
                                Advanced Settings
                                <span className='hidden rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-normal text-white/60 sm:inline-flex'>
                                    {editModel}
                                </span>
                            </div>
                            {isAdvancedOpen ? (
                                <ChevronDown className='h-4 w-4' />
                            ) : (
                                <ChevronRight className='h-4 w-4' />
                            )}
                        </Button>
                    </div>

                    {isAdvancedOpen && (
                        <div className='animate-in fade-in slide-in-from-top-2 space-y-5 rounded-md border border-white/10 bg-black/20 p-4 duration-200'>
                            <div className='space-y-2'>
                                <div className='flex items-center justify-between gap-3'>
                                    <Label htmlFor='edit-model-select' className='text-white'>
                                        Model
                                    </Label>
                                    <span className='text-xs text-white/50'>Used for edits and cost tracking.</span>
                                </div>
                                <Select
                                    value={editModel}
                                    onValueChange={(value) => setEditModel(value as EditingFormData['model'])}
                                    disabled={isLoading}>
                                    <SelectTrigger
                                        id='edit-model-select'
                                        className='w-full rounded-md border border-white/20 bg-black text-white focus:border-white/50 focus:ring-white/50'>
                                        <SelectValue placeholder='Select model' />
                                    </SelectTrigger>
                                    <SelectContent className='border-white/20 bg-black text-white'>
                                        {GPT_IMAGE_MODELS.map((modelName) => (
                                            <SelectItem key={modelName} value={modelName} className='focus:bg-white/10'>
                                                {modelName}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className='space-y-3'>
                                <Label className='block text-white'>Quality</Label>
                                <RadioGroup
                                    value={editQuality}
                                    onValueChange={(value) => setEditQuality(value as EditingFormData['quality'])}
                                    disabled={isLoading}
                                    className='flex flex-wrap gap-x-5 gap-y-3'>
                                    <RadioItemWithIcon
                                        value='auto'
                                        id='edit-quality-auto'
                                        label='Auto'
                                        Icon={Sparkles}
                                    />
                                    <RadioItemWithIcon value='low' id='edit-quality-low' label='Low' Icon={Tally1} />
                                    <RadioItemWithIcon
                                        value='medium'
                                        id='edit-quality-medium'
                                        label='Medium'
                                        Icon={Tally2}
                                    />
                                    <RadioItemWithIcon value='high' id='edit-quality-high' label='High' Icon={Tally3} />
                                </RadioGroup>
                            </div>

                            <div className='space-y-2'>
                                <Label htmlFor='edit-n-slider' className='text-white'>
                                    Number of Images: {editN[0]}
                                </Label>
                                <Slider
                                    id='edit-n-slider'
                                    min={1}
                                    max={10}
                                    step={1}
                                    value={editN}
                                    onValueChange={setEditN}
                                    disabled={isLoading}
                                    className='mt-3 [&>button]:border-black [&>button]:bg-white [&>button]:ring-offset-black [&>span:first-child]:h-1 [&>span:first-child>span]:bg-white'
                                />
                            </div>
                        </div>
                    )}
                </CardContent>
                <CardFooter className='border-t border-white/10 p-4'>
                    <Button
                        type='submit'
                        disabled={isLoading || !editPrompt || imageFiles.length === 0}
                        className='flex w-full items-center justify-center gap-2 rounded-md bg-white text-black hover:bg-white/90 disabled:bg-white/10 disabled:text-white/40'>
                        {isLoading && <Loader2 className='h-4 w-4 animate-spin' />}
                        {isLoading ? 'Editing...' : 'Edit Image'}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}

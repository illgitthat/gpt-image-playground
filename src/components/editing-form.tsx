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
import { compressImagesForUpload } from '@/lib/image-compress';
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
    Settings2,
    Wand2
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
    onSurpriseMe: () => void;
    isSurprising: boolean;
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
            className='border-input text-foreground data-[state=checked]:border-foreground data-[state=checked]:text-foreground'
        />
        <Label htmlFor={id} className='flex cursor-pointer items-center gap-2 text-base text-foreground/90'>
            <Icon className='h-5 w-5 text-muted-foreground' />
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
    enhanceError,
    onSurpriseMe,
    isSurprising
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

        // Compress + downscale on the client before storing/uploading.
        // Sends original Files as a fallback if compression isn't possible.
        compressImagesForUpload(filesToAdd)
            .then((processedFiles) => {
                setImageFiles((prevFiles) => [...prevFiles, ...processedFiles]);

                const newFilePromises = processedFiles.map((file) => {
                    return new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.onerror = () => reject(new Error('Failed to read image file.'));
                        reader.readAsDataURL(file);
                    });
                });

                return Promise.all(newFilePromises);
            })
            .then((newUrls) => {
                if (!newUrls) return;
                setSourceImagePreviewUrls((prevUrls) => [...prevUrls, ...newUrls]);
            })
            .catch((error) => {
                console.error('Error processing new image files:', error);
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
        <Card className='flex w-full flex-col rounded-md border border-border bg-card shadow-[0_1px_0_0_var(--border)] lg:h-full lg:overflow-hidden'>
            <CardHeader className='flex items-center justify-between gap-4 border-b border-border px-5 pb-4 pt-5'>
                <ModeToggle currentMode={currentMode} onModeChange={onModeChange} />
                {isPasswordRequiredByBackend && (
                    <Button
                        variant='ghost'
                        size='icon'
                        onClick={onOpenPasswordDialog}
                        className='h-7 w-7 text-muted-foreground hover:text-foreground'
                        aria-label='Configure Password'>
                        {clientPasswordHash ? <Lock className='h-3.5 w-3.5' /> : <LockOpen className='h-3.5 w-3.5' />}
                    </Button>
                )}
            </CardHeader>
            <form onSubmit={handleSubmit} className='flex flex-1 flex-col lg:h-full lg:overflow-hidden'>
                <CardContent className='flex-1 space-y-5 p-4 lg:overflow-y-auto'>
                    {/* Streaming Previews section hidden by request
                    <div className='space-y-2'>
                        <div className='flex items-center gap-2'>
                            <Label className='text-foreground'>Streaming Previews</Label>
                            <span className='text-xs text-muted-foreground'>Shows in-progress frames while your image updates (adds a small extra cost).</span>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className='h-4 w-4 cursor-help text-muted-foreground/70 hover:text-muted-foreground' />
                                </TooltipTrigger>
                                <TooltipContent className='max-w-[250px]'>
                                    Each preview image adds ~$0.003 to the cost (100 additional output tokens).
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        {!streamingAllowed && (
                            <p className='text-xs text-muted-foreground/80'>Available when editing a single image (n = 1).</p>
                        )}
                    </div>
                    */}

                    <div className='space-y-1.5'>
                        <div className='flex items-center justify-between gap-2'>
                            <Label htmlFor='edit-prompt' className='text-foreground'>
                                Prompt
                            </Label>
                            <div className='flex items-center gap-2'>
                                {enhanceError && <span className='text-xs text-destructive'>{enhanceError}</span>}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type='button'
                                            variant='ghost'
                                            size='sm'
                                            onClick={onSurpriseMe}
                                            disabled={isLoading || isSurprising || isEnhancingPrompt}
                                            className='h-8 gap-1 rounded-full border border-border bg-muted/30 px-3 text-xs text-foreground/90 hover:bg-muted/80 hover:text-foreground'>
                                            {isSurprising ? (
                                                <Loader2 className='h-4 w-4 animate-spin' />
                                            ) : (
                                                <Wand2 className='h-4 w-4' />
                                            )}
                                            <span className='hidden sm:inline'>Surprise me</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className='bg-background text-foreground'>
                                        Generate a playful edit idea based on your source image(s).
                                    </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type='button'
                                            variant='ghost'
                                            size='sm'
                                            onClick={onEnhancePrompt}
                                            disabled={isLoading || isEnhancingPrompt || !editPrompt.trim()}
                                            className='h-8 gap-1 rounded-full border border-border bg-muted/30 px-3 text-xs text-foreground/90 hover:bg-muted/80 hover:text-foreground'>
                                            {isEnhancingPrompt ? (
                                                <Loader2 className='h-4 w-4 animate-spin' />
                                            ) : (
                                                <Sparkles className='h-4 w-4' />
                                            )}
                                            <span className='hidden sm:inline'>Auto enhance</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className='bg-background text-foreground'>
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
                            className={`min-h-[80px] rounded-md border bg-background text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:ring-ring ${
                                imageFiles.length > 0 && !editPrompt && !isLoading ? 'attention-pulse' : 'border-border'
                            }`}
                        />
                    </div>

                    <div className='space-y-2'>
                        <Label className='text-foreground'>Source Image(s) [Max: {maxImages}]</Label>
                        <Label
                            htmlFor='image-files-input'
                            className={`flex h-10 w-full cursor-pointer items-center justify-between rounded-md border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted/30 ${
                                imageFiles.length === 0 && !isLoading ? 'attention-pulse' : 'border-border'
                            }`}>
                            <span className='truncate pr-2 text-muted-foreground'>{displayFileNames(imageFiles)}</span>
                            <span className='flex shrink-0 items-center gap-1.5 rounded-md bg-muted/60 px-3 py-1 text-xs font-medium text-foreground/90 hover:bg-muted'>
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
                                className='border-border text-foreground/90 hover:bg-muted/60 hover:text-foreground'>
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
                                    className='border-border bg-background text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:ring-ring'
                                />
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type='button'
                                            variant='outline'
                                            size='icon'
                                            onClick={handleFetchFromUrl}
                                            disabled={isLoading || isFetchingImage || !imageUrl.trim()}
                                            className='shrink-0 border-border text-foreground/90 hover:bg-muted/60 hover:text-foreground'>
                                            {isFetchingImage ? (
                                                <Loader2 className='h-4 w-4 animate-spin' />
                                            ) : (
                                                <Link2 className='h-4 w-4' />
                                            )}
                                            <span className='sr-only'>Fetch from URL</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className='bg-background text-foreground'>
                                        Fetch image from URL
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        </div>
                        {imageAddError && <p className='text-xs text-destructive'>{imageAddError}</p>}
                        {sourceImagePreviewUrls.length > 0 && (
                            <div className='flex space-x-2 overflow-x-auto pt-2'>
                                {sourceImagePreviewUrls.map((url, index) => (
                                    <div key={url} className='relative shrink-0'>
                                        <Image
                                            src={url}
                                            alt={`Source preview ${index + 1}`}
                                            width={80}
                                            height={80}
                                            className='rounded border border-border object-cover'
                                            unoptimized
                                        />
                                        <Button
                                            type='button'
                                            variant='destructive'
                                            size='icon'
                                            className='absolute top-0 right-0 h-5 w-5 translate-x-1/3 -translate-y-1/3 transform rounded-full bg-destructive p-0.5 text-foreground hover:bg-destructive/90'
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
                        <Label className='block text-foreground'>Mask</Label>
                        <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() => setEditShowMaskEditor(!editShowMaskEditor)}
                            disabled={isLoading || !editOriginalImageSize}
                            className='w-full justify-start border-border px-3 text-foreground/90 hover:bg-muted/60 hover:text-foreground'>
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
                            <div className='space-y-3 rounded-md border border-border bg-background p-3'>
                                <p className='text-xs text-muted-foreground'>
                                    Draw on the image below to mark areas for editing (drawn areas become transparent in
                                    the mask).
                                </p>
                                <div
                                    className='relative mx-auto w-full overflow-hidden rounded border border-border'
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
                                        <Label htmlFor='brush-size-slider' className='text-sm text-foreground'>
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
                                            className='mt-1 [&>button]:border-background [&>button]:bg-primary [&>button]:ring-offset-black [&>span:first-child]:h-1 [&>span:first-child>span]:bg-primary'
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
                                        className='mr-auto border-border text-foreground/90 hover:bg-muted/60 hover:text-foreground'>
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
                                            className='border-border text-foreground/90 hover:bg-muted/60 hover:text-foreground'>
                                            <Eraser className='mr-1.5 h-4 w-4' /> Clear
                                        </Button>
                                        <Button
                                            type='button'
                                            variant='default'
                                            size='sm'
                                            onClick={generateAndSaveMask}
                                            disabled={isLoading || editDrawnPoints.length === 0}
                                            className='bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50'>
                                            <Save className='mr-1.5 h-4 w-4' /> Save Mask
                                        </Button>
                                    </div>
                                </div>
                                {editMaskPreviewUrl && (
                                    <div className='mt-3 border-t border-border pt-3 text-center'>
                                        <Label className='mb-1.5 block text-sm text-foreground'>
                                            Generated Mask Preview:
                                        </Label>
                                        <div className='inline-block rounded border border-input bg-primary p-1'>
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
                        <Label className='block text-foreground'>Size</Label>
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
                            className='flex w-full items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60'>
                            <div className='flex items-center gap-2'>
                                <Settings2 className='h-4 w-4' />
                                Advanced Settings
                                <span className='hidden rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[11px] font-normal text-muted-foreground sm:inline-flex'>
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
                        <div className='animate-in fade-in slide-in-from-top-2 space-y-5 rounded-md border border-border bg-background/20 p-4 duration-200'>
                            <div className='space-y-2'>
                                <div className='flex items-center justify-between gap-3'>
                                    <Label htmlFor='edit-model-select' className='text-foreground'>
                                        Model
                                    </Label>
                                    <span className='text-xs text-muted-foreground/80'>Used for edits and cost tracking.</span>
                                </div>
                                <Select
                                    value={editModel}
                                    onValueChange={(value) => setEditModel(value as EditingFormData['model'])}
                                    disabled={isLoading}>
                                    <SelectTrigger
                                        id='edit-model-select'
                                        className='w-full rounded-md border border-border bg-background text-foreground focus:border-ring focus:ring-ring'>
                                        <SelectValue placeholder='Select model' />
                                    </SelectTrigger>
                                    <SelectContent className='border-border bg-background text-foreground'>
                                        {GPT_IMAGE_MODELS.map((modelName) => (
                                            <SelectItem key={modelName} value={modelName} className='focus:bg-muted/60'>
                                                {modelName}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className='space-y-3'>
                                <Label className='block text-foreground'>Quality</Label>
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
                                <Label htmlFor='edit-n-slider' className='text-foreground'>
                                    Number of Images: {editN[0]}
                                </Label>
                                <Slider
                                    id='edit-n-slider'
                                    min={1}
                                    max={5}
                                    step={1}
                                    value={editN}
                                    onValueChange={setEditN}
                                    disabled={isLoading}
                                    className='mt-3 [&>button]:border-background [&>button]:bg-primary [&>button]:ring-offset-black [&>span:first-child]:h-1 [&>span:first-child>span]:bg-primary'
                                />
                            </div>
                        </div>
                    )}
                </CardContent>
                <CardFooter className='border-t border-border bg-muted/20 p-4'>
                    <Button
                        type='submit'
                        disabled={isLoading || !editPrompt || imageFiles.length === 0}
                        title={
                            !isLoading
                                ? imageFiles.length === 0
                                    ? 'Upload an image to enable'
                                    : !editPrompt
                                      ? 'Enter a prompt to enable'
                                      : undefined
                                : undefined
                        }
                        className='group relative flex w-full items-center justify-center gap-2 rounded-md border border-primary/60 bg-primary py-5 font-mono text-[11px] uppercase tracking-[0.22em] text-primary-foreground transition-all hover:brightness-105 hover:shadow-[0_8px_30px_-8px_oklch(0.86_0.20_125_/_0.55)] disabled:!pointer-events-auto disabled:cursor-not-allowed disabled:border-border disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none'>
                        {isLoading && <Loader2 className='h-4 w-4 animate-spin' />}
                        <span>
                            {isLoading
                                ? 'Re-mixing…'
                                : imageFiles.length === 0
                                  ? 'Upload an image …'
                                  : !editPrompt
                                    ? 'Enter a prompt …'
                                    : 'Edit image →'}
                        </span>
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}

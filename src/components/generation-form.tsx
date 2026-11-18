'use client';

import { ImageLightbox, type LightboxMedia } from '@/components/image-lightbox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DEFAULT_IMAGE_MODEL, type ImageModel } from '@/lib/cost-utils';
import { compressImagesForUpload } from '@/lib/image-compress';
import { DEFAULT_OUTPUT_COMPRESSION, MAX_IMAGES } from '@/lib/image-options';
import {
    Square,
    RectangleHorizontal,
    RectangleVertical,
    Sparkles,
    Loader2,
    Lock,
    LockOpen,
    Wand2,
    Upload,
    X,
    ClipboardPaste,
    ImagePlus,
    Undo2
} from 'lucide-react';
import Image from 'next/image';
import * as React from 'react';

export const DEFAULT_OUTPUT_FORMAT = 'webp' as const;

export type GenerationFormData = {
    prompt: string;
    n: number;
    size: '1024x1024' | '1536x1024' | '1024x1536' | 'auto';
    quality: 'low' | 'medium' | 'high' | 'auto';
    output_format: 'png' | 'jpeg' | 'webp';
    output_compression?: number;
    background: 'transparent' | 'opaque' | 'auto';
    moderation: 'low';
    model: ImageModel;
    referenceImages: File[];
};

type GenerationFormProps = {
    onSubmit: (data: GenerationFormData) => void;
    isLoading: boolean;
    isPasswordRequiredByBackend: boolean | null;
    clientPasswordHash: string | null;
    onOpenPasswordDialog: () => void;
    prompt: string;
    setPrompt: React.Dispatch<React.SetStateAction<string>>;
    n: number[];
    setN: React.Dispatch<React.SetStateAction<number[]>>;
    size: GenerationFormData['size'];
    setSize: React.Dispatch<React.SetStateAction<GenerationFormData['size']>>;
    referenceImages: File[];
    referenceImagePreviewUrls: string[];
    setReferenceImages: React.Dispatch<React.SetStateAction<File[]>>;
    setReferenceImagePreviewUrls: React.Dispatch<React.SetStateAction<string[]>>;
    maxReferenceImages: number;
    streamingAllowed: boolean;
    onEnhancePrompt: () => void;
    isEnhancingPrompt: boolean;
    enhanceError: string | null;
    onSurpriseMe: () => void;
    isSurprising: boolean;
    canUndoPrompt: boolean;
    onUndoPrompt: () => void;
    onCancel: () => void;
    isCancelling: boolean;
};

// One-tap starting points shown while the prompt is empty.
const PROMPT_IDEAS: { label: string; prompt: string }[] = [
    {
        label: 'Cozy cabin',
        prompt: 'A cozy log cabin in a snowy pine forest at dusk, warm light glowing from the windows, soft falling snow, cinematic photo'
    },
    {
        label: 'Sticker',
        prompt: 'A die-cut sticker of a cheerful corgi wearing sunglasses, bold outlines, flat bright colors, white border, plain background'
    },
    {
        label: 'Movie poster',
        prompt: 'A retro 1980s sci-fi movie poster of a lone astronaut facing a giant glowing planet, painted style, bold title lettering that reads "LAST ORBIT"'
    },
    {
        label: 'Tiny world',
        prompt: 'A miniature diorama of a busy ramen shop inside a glass jar, tilt-shift macro photo, warm lantern light, rich detail'
    }
];

// One segment of a compact toggle, backed by a (visually hidden) radio for keyboard and screen readers.
const Segment = ({
    value,
    id,
    label,
    Icon
}: {
    value: string;
    id: string;
    label: string;
    Icon?: React.ElementType;
}) => (
    <Label
        htmlFor={id}
        className='text-muted-foreground hover:text-foreground has-[[data-state=checked]]:bg-primary has-[[data-state=checked]]:text-primary-foreground has-[:focus-visible]:ring-ring flex h-9 min-w-12 cursor-pointer items-center justify-center gap-1.5 rounded-[5px] px-3 text-sm font-medium tabular-nums transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:ring-2'>
        <RadioGroupItem value={value} id={id} className='sr-only' />
        {Icon && <Icon className='h-4 w-4 shrink-0' aria-hidden='true' />}
        <span>{label}</span>
    </Label>
);

const SEGMENT_GROUP_CLASS = 'border-border bg-muted/30 flex gap-0.5 rounded-md border p-0.5';

export function GenerationForm({
    onSubmit,
    isLoading,
    isPasswordRequiredByBackend,
    clientPasswordHash,
    onOpenPasswordDialog,
    prompt,
    setPrompt,
    n,
    setN,
    size,
    setSize,
    referenceImages,
    referenceImagePreviewUrls,
    setReferenceImages,
    setReferenceImagePreviewUrls,
    maxReferenceImages,
    streamingAllowed,
    onEnhancePrompt,
    isEnhancingPrompt,
    enhanceError,
    onSurpriseMe,
    isSurprising,
    canUndoPrompt,
    onUndoPrompt,
    onCancel,
    isCancelling
}: GenerationFormProps) {
    const [imageAddError, setImageAddError] = React.useState<string | null>(null);
    const [isPastingImage, setIsPastingImage] = React.useState(false);
    const [isDraggingOver, setIsDraggingOver] = React.useState(false);
    const dragCounterRef = React.useRef(0);
    const refImageInputRef = React.useRef<HTMLInputElement>(null);
    const [lightboxOpen, setLightboxOpen] = React.useState(false);
    const [lightboxIndex, setLightboxIndex] = React.useState(0);
    const generateButtonRef = React.useRef<HTMLButtonElement>(null);
    const cancelledByUser = React.useRef(false);

    React.useEffect(() => {
        if (!isLoading && cancelledByUser.current) {
            generateButtonRef.current?.focus();
            cancelledByUser.current = false;
        }
    }, [isLoading]);

    const lightboxMedia: LightboxMedia[] = React.useMemo(
        () =>
            referenceImagePreviewUrls.map((url, i) => ({
                url,
                alt: `Reference image ${i + 1}`
            })),
        [referenceImagePreviewUrls]
    );

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current++;
        if (e.dataTransfer.types.includes('Files')) {
            setIsDraggingOver(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current--;
        if (dragCounterRef.current === 0) {
            setIsDraggingOver(false);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
        dragCounterRef.current = 0;
        if (isLoading || referenceImages.length >= maxReferenceImages) return;
        const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
        if (files.length > 0) {
            addReferenceImages(files);
        }
    };

    const addReferenceImages = (files: File[]) => {
        if (files.length === 0) return;
        setImageAddError(null);
        const availableSlots = maxReferenceImages - referenceImages.length;
        if (availableSlots <= 0) {
            setImageAddError(`You can only select up to ${maxReferenceImages} images.`);
            return;
        }
        const filesToAdd = files.slice(0, availableSlots);
        if (files.length > filesToAdd.length) {
            setImageAddError(
                `Only ${availableSlots} slot${availableSlots === 1 ? '' : 's'} left (max ${maxReferenceImages}).`
            );
        }
        compressImagesForUpload(filesToAdd)
            .then((processedFiles) => {
                setReferenceImages((prev) => [...prev, ...processedFiles]);
                return Promise.all(
                    processedFiles.map(
                        (file) =>
                            new Promise<string>((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result as string);
                                reader.onerror = () => reject(new Error('Failed to read image file.'));
                                reader.readAsDataURL(file);
                            })
                    )
                );
            })
            .then((newUrls) => {
                if (newUrls) setReferenceImagePreviewUrls((prev) => [...prev, ...newUrls]);
            })
            .catch(() => setImageAddError('Failed to read one of the selected images.'));
    };

    const handleRefImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            addReferenceImages(Array.from(event.target.files));
            event.target.value = '';
        }
    };

    const handleOpenRefImagePicker = () => {
        if (isLoading || referenceImages.length >= maxReferenceImages) return;
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        refImageInputRef.current?.click();
        window.scrollTo(scrollX, scrollY);
    };

    const handleRefPasteFromClipboard = async () => {
        if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
            setImageAddError('Clipboard paste is not supported in this browser.');
            return;
        }
        if (referenceImages.length >= maxReferenceImages) {
            setImageAddError(`You can only select up to ${maxReferenceImages} images.`);
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
                        imageBlobs.push(await item.getType(type));
                        break;
                    }
                }
            }
            if (imageBlobs.length === 0) throw new Error('Clipboard does not contain an image.');
            const files = imageBlobs.map((blob, i) => {
                const ext = blob.type.split('/')[1] || 'png';
                return new File([blob], `pasted-image-${Date.now()}-${i}.${ext}`, { type: blob.type });
            });
            addReferenceImages(files);
        } catch (err: unknown) {
            setImageAddError(err instanceof Error ? err.message : 'Unable to read image from clipboard.');
        } finally {
            setIsPastingImage(false);
        }
    };

    const handleRemoveRefImage = (indexToRemove: number) => {
        setReferenceImages((prev) => prev.filter((_, i) => i !== indexToRemove));
        setReferenceImagePreviewUrls((prev) => prev.filter((_, i) => i !== indexToRemove));
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        // Model and output settings are fixed defaults; the form only exposes prompt, references, count, and size.
        onSubmit({
            prompt,
            n: n[0],
            size,
            quality: 'auto',
            output_format: DEFAULT_OUTPUT_FORMAT,
            output_compression: DEFAULT_OUTPUT_COMPRESSION,
            background: 'auto',
            moderation: 'low',
            model: DEFAULT_IMAGE_MODEL,
            referenceImages
        });
    };

    return (
        <Card className='border-border bg-card flex w-full flex-col gap-0 rounded-md border py-0 shadow-[0_1px_0_0_var(--border)] lg:h-full lg:overflow-hidden'>
            <form onSubmit={handleSubmit} className='flex flex-1 flex-col lg:h-full lg:overflow-hidden'>
                <CardContent className='flex-1 space-y-5 p-4 lg:overflow-y-auto'>
                    <div className='space-y-1.5'>
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                            <Label htmlFor='prompt' className='text-foreground'>
                                Prompt
                            </Label>
                            <div className='flex items-center gap-2'>
                                {isPasswordRequiredByBackend && (
                                    <Button
                                        type='button'
                                        variant='ghost'
                                        size='icon'
                                        onClick={onOpenPasswordDialog}
                                        className='text-muted-foreground hover:text-foreground h-7 w-7'
                                        aria-label='Configure Password'>
                                        {clientPasswordHash ? (
                                            <Lock className='h-3.5 w-3.5' />
                                        ) : (
                                            <LockOpen className='h-3.5 w-3.5' />
                                        )}
                                    </Button>
                                )}
                                {enhanceError && <span className='text-destructive text-xs'>{enhanceError}</span>}
                                {canUndoPrompt && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                type='button'
                                                variant='ghost'
                                                size='icon'
                                                className='h-8 w-8'
                                                onClick={onUndoPrompt}
                                                disabled={isLoading || isEnhancingPrompt || isSurprising}
                                                aria-label='Undo prompt change'>
                                                <Undo2 className='h-4 w-4' />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Undo prompt change</TooltipContent>
                                    </Tooltip>
                                )}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type='button'
                                            variant='ghost'
                                            size='sm'
                                            onClick={onSurpriseMe}
                                            disabled={isLoading || isSurprising || isEnhancingPrompt}
                                            className='border-border bg-muted/30 text-foreground/90 hover:bg-muted/80 hover:text-foreground h-8 gap-1 rounded-full border px-3 text-xs'>
                                            {isSurprising ? (
                                                <Loader2 className='h-4 w-4 animate-spin' />
                                            ) : (
                                                <Wand2 className='h-4 w-4' />
                                            )}
                                            <span>Surprise me</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className='bg-background text-foreground'>
                                        Generate a new image idea.
                                    </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type='button'
                                            variant='ghost'
                                            size='sm'
                                            onClick={onEnhancePrompt}
                                            disabled={isLoading || isEnhancingPrompt || isSurprising || !prompt.trim()}
                                            className='border-border bg-muted/30 text-foreground/90 hover:bg-muted/80 hover:text-foreground h-8 gap-1 rounded-full border px-3 text-xs'>
                                            {isEnhancingPrompt ? (
                                                <Loader2 className='h-4 w-4 animate-spin' />
                                            ) : (
                                                <Sparkles className='h-4 w-4' />
                                            )}
                                            <span>Enhance prompt</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className='bg-background text-foreground'>
                                        Clarify the prompt while keeping your intent.
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        </div>
                        <Textarea
                            id='prompt'
                            placeholder='e.g., A photorealistic cat astronaut floating in space'
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(event) => {
                                // Ctrl/Cmd+Enter submits without leaving the prompt box.
                                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                                    event.preventDefault();
                                    event.currentTarget.form?.requestSubmit();
                                }
                            }}
                            required
                            disabled={isLoading}
                            autoFocus
                            className={`bg-background text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:ring-ring min-h-[80px] rounded-md border ${
                                !prompt && !isLoading ? 'attention-pulse' : 'border-border'
                            }`}
                        />
                        {!prompt && !isLoading && !isSurprising && (
                            <div className='flex flex-wrap items-center gap-1.5 pt-1'>
                                <span className='text-muted-foreground text-xs'>Try:</span>
                                {PROMPT_IDEAS.map((idea) => (
                                    <button
                                        key={idea.label}
                                        type='button'
                                        onClick={() => setPrompt(idea.prompt)}
                                        className='border-border bg-background text-foreground/80 hover:bg-muted/60 hover:text-foreground focus-visible:ring-ring rounded-full border px-3 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none'>
                                        {idea.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div
                        className='space-y-2'
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}>
                        <div className='flex items-center justify-between gap-2'>
                            <Label className='text-foreground'>
                                Reference Images
                                <span className='text-muted-foreground ml-1 text-xs font-normal'>(optional)</span>
                            </Label>
                            {referenceImages.length > 0 && (
                                <span className='text-muted-foreground text-xs'>
                                    {referenceImages.length}/{maxReferenceImages}
                                </span>
                            )}
                        </div>
                        {referenceImages.length === 0 ? (
                            <button
                                type='button'
                                onClick={handleOpenRefImagePicker}
                                onMouseDown={(event) => event.preventDefault()}
                                disabled={isLoading || referenceImages.length >= maxReferenceImages}
                                className={`bg-background flex min-h-[80px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-3 py-4 text-sm transition-colors ${
                                    isDraggingOver
                                        ? 'border-primary bg-primary/5 text-primary'
                                        : 'border-border text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                                } disabled:cursor-not-allowed disabled:opacity-50`}>
                                <ImagePlus className='h-5 w-5' />
                                <span className='pointer-coarse:hidden'>
                                    {isDraggingOver ? 'Drop images here' : 'Drop, paste, or click to add images'}
                                </span>
                                <span className='hidden pointer-coarse:inline'>Tap to add images</span>
                                <span className='text-muted-foreground/70 text-xs'>
                                    PNG, JPEG, WebP<span className='pointer-coarse:hidden'> · Ctrl+V to paste</span>
                                </span>
                            </button>
                        ) : (
                            <div
                                className={`space-y-2 rounded-md p-1 transition-colors ${isDraggingOver ? 'bg-primary/5 ring-primary ring-offset-background ring-2 ring-offset-1' : ''}`}>
                                <div className='flex flex-wrap gap-2'>
                                    {referenceImagePreviewUrls.map((url, index) => (
                                        <div key={index} className='group relative'>
                                            <button
                                                type='button'
                                                onClick={() => {
                                                    setLightboxIndex(index);
                                                    setLightboxOpen(true);
                                                }}
                                                className='focus:ring-ring relative cursor-zoom-in rounded-md focus:ring-2 focus:ring-offset-1 focus:outline-none'>
                                                <Image
                                                    src={url}
                                                    alt={`Reference ${index + 1}`}
                                                    width={64}
                                                    height={64}
                                                    className='border-border h-16 w-16 rounded-md border object-cover'
                                                />
                                                <span
                                                    aria-hidden='true'
                                                    className='bg-foreground/80 text-background pointer-events-none absolute bottom-1 left-1 rounded px-1 font-mono text-[10px]'>
                                                    {index + 1}
                                                </span>
                                            </button>
                                            <button
                                                type='button'
                                                onClick={() => handleRemoveRefImage(index)}
                                                disabled={isLoading}
                                                aria-label={`Remove reference ${index + 1}`}
                                                className='border-border bg-background text-muted-foreground hover:bg-destructive hover:text-destructive-foreground absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition-colors'>
                                                <X className='h-3 w-3' />
                                            </button>
                                        </div>
                                    ))}
                                    {referenceImages.length < maxReferenceImages && (
                                        <button
                                            type='button'
                                            onClick={handleOpenRefImagePicker}
                                            onMouseDown={(event) => event.preventDefault()}
                                            disabled={isLoading}
                                            className={`bg-background flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-dashed transition-colors ${
                                                isDraggingOver
                                                    ? 'border-primary text-primary'
                                                    : 'border-border text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                                            } disabled:cursor-not-allowed disabled:opacity-50`}
                                            aria-label='Add reference images'>
                                            <ImagePlus className='h-5 w-5' />
                                        </button>
                                    )}
                                </div>
                                <div className='flex gap-2'>
                                    <Button
                                        type='button'
                                        variant='outline'
                                        size='sm'
                                        onClick={handleRefPasteFromClipboard}
                                        disabled={
                                            isLoading || isPastingImage || referenceImages.length >= maxReferenceImages
                                        }
                                        className='border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground h-7 text-xs'>
                                        {isPastingImage ? (
                                            <Loader2 className='mr-1.5 h-3 w-3 animate-spin' />
                                        ) : (
                                            <ClipboardPaste className='mr-1.5 h-3 w-3' />
                                        )}
                                        Paste
                                    </Button>
                                </div>
                            </div>
                        )}
                        <input
                            ref={refImageInputRef}
                            id='gen-ref-image-input'
                            type='file'
                            accept='image/png, image/jpeg, image/webp'
                            multiple
                            onChange={handleRefImageFileChange}
                            disabled={isLoading || referenceImages.length >= maxReferenceImages}
                            className='hidden'
                        />
                        {imageAddError && <p className='text-destructive text-xs'>{imageAddError}</p>}
                    </div>

                    <div className='flex items-center justify-between gap-3'>
                        <Label className='text-foreground'>Number of images</Label>
                        <RadioGroup
                            aria-label='Number of images'
                            value={String(n[0])}
                            onValueChange={(value) => setN([Number(value)])}
                            disabled={isLoading}
                            className={SEGMENT_GROUP_CLASS}>
                            {Array.from({ length: MAX_IMAGES }, (_, index) => index + 1).map((count) => (
                                <Segment
                                    key={count}
                                    id={`count-${count}`}
                                    value={String(count)}
                                    label={String(count)}
                                />
                            ))}
                        </RadioGroup>
                    </div>

                    <div className='flex items-center justify-between gap-3'>
                        <Label className='text-foreground'>Size</Label>
                        <RadioGroup
                            aria-label='Image size'
                            value={size === 'auto' ? '1024x1024' : size}
                            onValueChange={(value) => setSize(value as GenerationFormData['size'])}
                            disabled={isLoading}
                            className={SEGMENT_GROUP_CLASS}>
                            <Segment value='1024x1024' id='size-square' label='Square' Icon={Square} />
                            <Segment value='1536x1024' id='size-landscape' label='Wide' Icon={RectangleHorizontal} />
                            <Segment value='1024x1536' id='size-portrait' label='Tall' Icon={RectangleVertical} />
                        </RadioGroup>
                    </div>
                </CardContent>
                <CardFooter className='border-border bg-muted/20 max-lg:bg-card gap-2 rounded-b-md border-t p-4 max-lg:sticky max-lg:bottom-0 max-lg:z-10'>
                    <Button
                        ref={generateButtonRef}
                        type='submit'
                        disabled={isLoading || isEnhancingPrompt || isSurprising || !prompt.trim()}
                        title={!prompt && !isLoading ? 'Enter a prompt to enable' : undefined}
                        className='group border-primary/60 bg-primary text-primary-foreground disabled:border-border disabled:text-muted-foreground relative flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md border py-5 font-mono text-[11px] tracking-[0.22em] uppercase transition-all hover:shadow-[0_8px_30px_-8px_oklch(0.86_0.20_125_/_0.55)] hover:brightness-105 disabled:!pointer-events-auto disabled:cursor-not-allowed disabled:bg-transparent disabled:opacity-100 disabled:shadow-none'>
                        {isLoading && <Loader2 className='h-4 w-4 animate-spin' />}
                        <span>{isLoading ? 'Generating…' : !prompt ? 'Enter a prompt …' : 'Generate →'}</span>
                    </Button>
                    {isLoading && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type='button'
                                    variant='outline'
                                    size='icon'
                                    className='h-10 w-10 shrink-0'
                                    onClick={() => {
                                        cancelledByUser.current = true;
                                        onCancel();
                                    }}
                                    disabled={isCancelling}
                                    aria-label='Cancel generation'>
                                    <Square className='h-4 w-4 fill-current' />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Cancel generation</TooltipContent>
                        </Tooltip>
                    )}
                </CardFooter>
            </form>
            <ImageLightbox
                media={lightboxMedia}
                open={lightboxOpen}
                onOpenChange={setLightboxOpen}
                initialIndex={lightboxIndex}
            />
        </Card>
    );
}

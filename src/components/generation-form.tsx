'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { ImageLightbox, type LightboxMedia } from '@/components/image-lightbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GPT_IMAGE_MODELS, type GptImageModel } from '@/lib/cost-utils';
import { compressImagesForUpload } from '@/lib/image-compress';
import {
    Square,
    RectangleHorizontal,
    RectangleVertical,
    Sparkles,
    Eraser,
    FileImage,
    Tally1,
    Tally2,
    Tally3,
    Loader2,
    BrickWall,
    Lock,
    LockOpen,
    ChevronDown,
    ChevronRight,
    Settings2,
    Wand2,
    Upload,
    X,
    ClipboardPaste,
    ImagePlus
} from 'lucide-react';
import Image from 'next/image';
import * as React from 'react';

export type GenerationFormData = {
    prompt: string;
    n: number;
    size: '1024x1024' | '1536x1024' | '1024x1536' | 'auto';
    quality: 'low' | 'medium' | 'high' | 'auto';
    output_format: 'png' | 'jpeg' | 'webp';
    output_compression?: number;
    background: 'transparent' | 'opaque' | 'auto';
    moderation: 'low';
    model: GptImageModel;
    referenceImages: File[];
};

type GenerationFormProps = {
    onSubmit: (data: GenerationFormData) => void;
    isLoading: boolean;
    isPasswordRequiredByBackend: boolean | null;
    clientPasswordHash: string | null;
    onOpenPasswordDialog: () => void;
    model: GenerationFormData['model'];
    setModel: React.Dispatch<React.SetStateAction<GenerationFormData['model']>>;
    prompt: string;
    setPrompt: React.Dispatch<React.SetStateAction<string>>;
    n: number[];
    setN: React.Dispatch<React.SetStateAction<number[]>>;
    size: GenerationFormData['size'];
    setSize: React.Dispatch<React.SetStateAction<GenerationFormData['size']>>;
    quality: GenerationFormData['quality'];
    setQuality: React.Dispatch<React.SetStateAction<GenerationFormData['quality']>>;
    outputFormat: GenerationFormData['output_format'];
    setOutputFormat: React.Dispatch<React.SetStateAction<GenerationFormData['output_format']>>;
    compression: number[];
    setCompression: React.Dispatch<React.SetStateAction<number[]>>;
    background: GenerationFormData['background'];
    setBackground: React.Dispatch<React.SetStateAction<GenerationFormData['background']>>;
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
};

const RadioItemWithIcon = ({
    value,
    id,
    label,
    Icon,
    disabled
}: {
    value: string;
    id: string;
    label: string;
    Icon: React.ElementType;
    disabled?: boolean;
}) => (
    <div className='flex items-center space-x-2'>
        <RadioGroupItem
            value={value}
            id={id}
            disabled={disabled}
            className='border-input text-foreground data-[state=checked]:border-foreground data-[state=checked]:text-foreground'
        />
        <Label
            htmlFor={id}
            className={`flex items-center gap-2 text-base text-foreground/90 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
            <Icon className='h-5 w-5 text-muted-foreground' />
            {label}
        </Label>
    </div>
);

export function GenerationForm({
    onSubmit,
    isLoading,
    isPasswordRequiredByBackend,
    clientPasswordHash,
    onOpenPasswordDialog,
    model,
    setModel,
    prompt,
    setPrompt,
    n,
    setN,
    size,
    setSize,
    quality,
    setQuality,
    outputFormat,
    setOutputFormat,
    compression,
    setCompression,
    background,
    setBackground,
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
    isSurprising
}: GenerationFormProps) {
    const showCompression = outputFormat === 'jpeg' || outputFormat === 'webp';
    const locksBackgroundToAuto = model === 'gpt-image-2';
    const [isAdvancedOpen, setIsAdvancedOpen] = React.useState(false);
    const [imageAddError, setImageAddError] = React.useState<string | null>(null);
    const [isPastingImage, setIsPastingImage] = React.useState(false);
    const [isDraggingOver, setIsDraggingOver] = React.useState(false);
    const dragCounterRef = React.useRef(0);
    const [lightboxOpen, setLightboxOpen] = React.useState(false);
    const [lightboxIndex, setLightboxIndex] = React.useState(0);

    const lightboxMedia: LightboxMedia[] = React.useMemo(
        () =>
            referenceImagePreviewUrls.map((url, i) => ({
                url,
                alt: `Reference image ${i + 1}`,
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

    React.useEffect(() => {
        if (locksBackgroundToAuto && background !== 'auto') {
            setBackground('auto');
        }
    }, [background, locksBackgroundToAuto, setBackground]);

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
            setImageAddError(`Only ${availableSlots} slot${availableSlots === 1 ? '' : 's'} left (max ${maxReferenceImages}).`);
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
        const formData: GenerationFormData = {
            prompt,
            n: n[0],
            size,
            quality,
            output_format: outputFormat,
            background: locksBackgroundToAuto ? 'auto' : background,
            moderation: 'low',
            model,
            referenceImages
        };
        if (showCompression) {
            formData.output_compression = compression[0];
        }
        onSubmit(formData);
    };

    return (
        <Card className='flex w-full flex-col rounded-md border border-border bg-card shadow-[0_1px_0_0_var(--border)] lg:h-full lg:overflow-hidden'>
            <form onSubmit={handleSubmit} className='flex flex-1 flex-col lg:h-full lg:overflow-hidden'>
                <CardContent className='flex-1 space-y-5 p-4 lg:overflow-y-auto'>
                    <div className='space-y-1.5'>
                        <div className='flex items-center justify-between gap-2'>
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
                                        className='h-7 w-7 text-muted-foreground hover:text-foreground'
                                        aria-label='Configure Password'>
                                        {clientPasswordHash ? <Lock className='h-3.5 w-3.5' /> : <LockOpen className='h-3.5 w-3.5' />}
                                    </Button>
                                )}
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
                                            <span>Surprise me</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className='bg-background text-foreground'>
                                        Generate a fresh, unexpected image idea with GPT-5.3 Chat.
                                    </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type='button'
                                            variant='ghost'
                                            size='sm'
                                            onClick={onEnhancePrompt}
                                            disabled={isLoading || isEnhancingPrompt || !prompt.trim()}
                                            className='h-8 gap-1 rounded-full border border-border bg-muted/30 px-3 text-xs text-foreground/90 hover:bg-muted/80 hover:text-foreground'>
                                            {isEnhancingPrompt ? (
                                                <Loader2 className='h-4 w-4 animate-spin' />
                                            ) : (
                                                <Sparkles className='h-4 w-4' />
                                            )}
                                            <span>Auto enhance</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className='bg-background text-foreground'>
                                        Refine the prompt with GPT-5.3 Chat.
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        </div>
                        <Textarea
                            id='prompt'
                            placeholder='e.g., A photorealistic cat astronaut floating in space'
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            required
                            disabled={isLoading}
                            autoFocus
                            className={`min-h-[80px] rounded-md border bg-background text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:ring-ring ${
                                !prompt && !isLoading ? 'attention-pulse' : 'border-border'
                            }`}
                        />
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
                                <span className='ml-1 text-xs font-normal text-muted-foreground'>(optional)</span>
                            </Label>
                            {referenceImages.length > 0 && (
                                <span className='text-xs text-muted-foreground'>
                                    {referenceImages.length}/{maxReferenceImages}
                                </span>
                            )}
                        </div>
                        {referenceImages.length === 0 ? (
                            <Label
                                htmlFor='gen-ref-image-input'
                                className={`flex min-h-[80px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed bg-background px-3 py-4 text-sm transition-colors ${
                                    isDraggingOver
                                        ? 'border-primary bg-primary/5 text-primary'
                                        : 'border-border text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                                }`}>
                                <ImagePlus className='h-5 w-5' />
                                <span>{isDraggingOver ? 'Drop images here' : 'Drop images here or click to browse'}</span>
                                <span className='text-xs text-muted-foreground/70'>PNG, JPEG, WebP</span>
                            </Label>
                        ) : (
                            <div className={`space-y-2 rounded-md p-1 transition-colors ${isDraggingOver ? 'bg-primary/5 ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}`}>
                                <div className='flex flex-wrap gap-2'>
                                    {referenceImagePreviewUrls.map((url, index) => (
                                        <div key={index} className='group relative'>
                                            <button
                                                type='button'
                                                onClick={() => { setLightboxIndex(index); setLightboxOpen(true); }}
                                                className='cursor-zoom-in rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1'>
                                                <Image
                                                    src={url}
                                                    alt={`Reference ${index + 1}`}
                                                    width={64}
                                                    height={64}
                                                    className='h-16 w-16 rounded-md border border-border object-cover'
                                                />
                                            </button>
                                            <button
                                                type='button'
                                                onClick={() => handleRemoveRefImage(index)}
                                                className='absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground'>
                                                <X className='h-3 w-3' />
                                            </button>
                                        </div>
                                    ))}
                                    {referenceImages.length < maxReferenceImages && (
                                        <Label
                                            htmlFor='gen-ref-image-input'
                                            className={`flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-dashed bg-background transition-colors ${
                                                isDraggingOver
                                                    ? 'border-primary text-primary'
                                                    : 'border-border text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                                            }`}>
                                            <ImagePlus className='h-5 w-5' />
                                        </Label>
                                    )}
                                </div>
                                <div className='flex gap-2'>
                                    <Button
                                        type='button'
                                        variant='outline'
                                        size='sm'
                                        onClick={handleRefPasteFromClipboard}
                                        disabled={isLoading || isPastingImage || referenceImages.length >= maxReferenceImages}
                                        className='h-7 border-border text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground'>
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
                            id='gen-ref-image-input'
                            type='file'
                            accept='image/png, image/jpeg, image/webp'
                            multiple
                            onChange={handleRefImageFileChange}
                            disabled={isLoading || referenceImages.length >= maxReferenceImages}
                            className='sr-only'
                        />
                        {imageAddError && <p className='text-xs text-destructive'>{imageAddError}</p>}
                    </div>

                    <div className='space-y-2'>
                        <Label htmlFor='n-slider' className='text-foreground'>
                            Number of Images: {n[0]}
                        </Label>
                        <Slider
                            id='n-slider'
                            min={1}
                            max={5}
                            step={1}
                            value={n}
                            onValueChange={setN}
                            disabled={isLoading}
                            className='mt-3 [&>button]:border-background [&>button]:bg-primary [&>button]:ring-offset-black [&>span:first-child]:h-1 [&>span:first-child>span]:bg-primary'
                        />
                    </div>

                    <div className='space-y-3'>
                        <Label className='block text-foreground'>Size</Label>
                        <RadioGroup
                            value={size}
                            onValueChange={(value) => setSize(value as GenerationFormData['size'])}
                            disabled={isLoading}
                            className='flex flex-wrap gap-x-5 gap-y-3'>
                            <RadioItemWithIcon value='auto' id='size-auto' label='Auto' Icon={Sparkles} />
                            <RadioItemWithIcon value='1024x1024' id='size-square' label='Square' Icon={Square} />
                            <RadioItemWithIcon
                                value='1536x1024'
                                id='size-landscape'
                                label='Landscape'
                                Icon={RectangleHorizontal}
                            />
                            <RadioItemWithIcon
                                value='1024x1536'
                                id='size-portrait'
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
                                    {model}
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
                                    <Label htmlFor='model-select' className='text-foreground'>
                                        Model
                                    </Label>
                                </div>
                                <Select
                                    value={model}
                                    onValueChange={(value) => setModel(value as GenerationFormData['model'])}
                                    disabled={isLoading}>
                                    <SelectTrigger
                                        id='model-select'
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
                                    value={quality}
                                    onValueChange={(value) => setQuality(value as GenerationFormData['quality'])}
                                    disabled={isLoading}
                                    className='flex flex-wrap gap-x-5 gap-y-3'>
                                    <RadioItemWithIcon value='auto' id='quality-auto' label='Auto' Icon={Sparkles} />
                                    <RadioItemWithIcon value='low' id='quality-low' label='Low' Icon={Tally1} />
                                    <RadioItemWithIcon
                                        value='medium'
                                        id='quality-medium'
                                        label='Medium'
                                        Icon={Tally2}
                                    />
                                    <RadioItemWithIcon value='high' id='quality-high' label='High' Icon={Tally3} />
                                </RadioGroup>
                            </div>

                            {!locksBackgroundToAuto && (
                                <div className='space-y-3'>
                                    <Label className='block text-foreground'>Background</Label>
                                    <RadioGroup
                                        value={background}
                                        onValueChange={(value) => setBackground(value as GenerationFormData['background'])}
                                        disabled={isLoading}
                                        className='flex flex-wrap gap-x-5 gap-y-3'>
                                        <RadioItemWithIcon value='auto' id='bg-auto' label='Auto' Icon={Sparkles} />
                                        <RadioItemWithIcon value='opaque' id='bg-opaque' label='Opaque' Icon={BrickWall} />
                                        <RadioItemWithIcon
                                            value='transparent'
                                            id='bg-transparent'
                                            label='Transparent'
                                            Icon={Eraser}
                                        />
                                    </RadioGroup>
                                </div>
                            )}

                            <div className='space-y-3'>
                                <Label className='block text-foreground'>Output Format</Label>
                                <RadioGroup
                                    value={outputFormat}
                                    onValueChange={(value) =>
                                        setOutputFormat(value as GenerationFormData['output_format'])
                                    }
                                    disabled={isLoading}
                                    className='flex flex-wrap gap-x-5 gap-y-3'>
                                    <RadioItemWithIcon value='png' id='format-png' label='PNG' Icon={FileImage} />
                                    <RadioItemWithIcon value='jpeg' id='format-jpeg' label='JPEG' Icon={FileImage} />
                                    <RadioItemWithIcon value='webp' id='format-webp' label='WebP' Icon={FileImage} />
                                </RadioGroup>
                            </div>

                            {showCompression && (
                                <div className='space-y-2 pt-2 transition-opacity duration-300'>
                                    <Label htmlFor='compression-slider' className='text-foreground'>
                                        Compression: {compression[0]}%
                                    </Label>
                                    <Slider
                                        id='compression-slider'
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={compression}
                                        onValueChange={setCompression}
                                        disabled={isLoading}
                                        className='mt-3 [&>button]:border-background [&>button]:bg-primary [&>button]:ring-offset-black [&>span:first-child]:h-1 [&>span:first-child>span]:bg-primary'
                                    />
                                </div>
                            )}

                        </div>
                    )}
                </CardContent>
                <CardFooter className='border-t border-border bg-muted/20 p-4'>
                    <Button
                        type='submit'
                        disabled={isLoading || !prompt}
                        title={!prompt && !isLoading ? 'Enter a prompt to enable' : undefined}
                        className='group relative flex w-full items-center justify-center gap-2 rounded-md border border-primary/60 bg-primary py-5 font-mono text-[11px] uppercase tracking-[0.22em] text-primary-foreground transition-all hover:brightness-105 hover:shadow-[0_8px_30px_-8px_oklch(0.86_0.20_125_/_0.55)] disabled:!pointer-events-auto disabled:cursor-not-allowed disabled:border-border disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none'>
                        {isLoading && <Loader2 className='h-4 w-4 animate-spin' />}
                        <span>{isLoading ? 'Generating…' : !prompt ? 'Enter a prompt …' : 'Generate →'}</span>
                    </Button>
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

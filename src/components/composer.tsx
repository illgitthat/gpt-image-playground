'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ImageModel } from '@/lib/cost-utils';
import { compressImagesForUpload } from '@/lib/image-compress';
import { MAX_IMAGES } from '@/lib/image-options';
import { cn } from '@/lib/utils';
import {
    ArrowUp,
    Clapperboard,
    Dices,
    ImageIcon,
    Loader2,
    Plus,
    RectangleHorizontal,
    RectangleVertical,
    Sparkles,
    Square,
    Undo2,
    X
} from 'lucide-react';
import Image from 'next/image';
import * as React from 'react';

export type ImageSize = '1024x1024' | '1536x1024' | '1024x1536' | 'auto';

export type OutputMode = 'image' | 'video';

export type GenerationFormData = {
    prompt: string;
    n: number;
    size: ImageSize;
    quality: 'low' | 'medium' | 'high' | 'auto';
    output_format: 'png' | 'jpeg' | 'webp';
    output_compression?: number;
    background: 'transparent' | 'opaque' | 'auto';
    moderation: 'low';
    model: ImageModel;
    referenceImages: File[];
};

const SIZES: { value: ImageSize; label: string; Icon: React.ElementType }[] = [
    { value: '1024x1024', label: 'Square', Icon: Square },
    { value: '1536x1024', label: 'Wide', Icon: RectangleHorizontal },
    { value: '1024x1536', label: 'Tall', Icon: RectangleVertical }
];

const OUTPUT_MODES: { value: OutputMode; label: string; Icon: React.ElementType }[] = [
    { value: 'image', label: 'Image', Icon: ImageIcon },
    { value: 'video', label: 'Video', Icon: Clapperboard }
];

type ComposerProps = {
    prompt: string;
    setPrompt: (value: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
    isLoading: boolean;
    isCancelling: boolean;
    size: ImageSize;
    setSize: (size: ImageSize) => void;
    count: number;
    setCount: (count: number) => void;
    referenceImages: File[];
    referencePreviewUrls: string[];
    setReferenceImages: React.Dispatch<React.SetStateAction<File[]>>;
    setReferencePreviewUrls: React.Dispatch<React.SetStateAction<string[]>>;
    maxReferenceImages: number;
    outputMode: OutputMode;
    // Absent when video is not available; the Image/Video switch is then hidden.
    setOutputMode?: (mode: OutputMode) => void;
    // Length of the next clip, and the lengths on offer.
    videoSeconds: number;
    videoSecondsOptions: number[];
    setVideoSeconds: (seconds: number) => void;
    // The image on the stage that the next prompt will change, if any.
    editTargetUrl: string | null;
    onStopEditing: () => void;
    onEnhance: () => void;
    isEnhancing: boolean;
    onSurprise: () => void;
    isSurprising: boolean;
    canUndo: boolean;
    onUndo: () => void;
    helperError: string | null;
    autoFocus?: boolean;
};

function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
    });
}

function ToolButton({
    label,
    onClick,
    disabled,
    children,
    className
}: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type='button'
                    onClick={onClick}
                    disabled={disabled}
                    aria-label={label}
                    className={cn(
                        'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring flex h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 sm:h-10 sm:min-w-10 sm:px-2.5',
                        className
                    )}>
                    {children}
                </button>
            </TooltipTrigger>
            <TooltipContent side='top'>{label}</TooltipContent>
        </Tooltip>
    );
}

export function Composer({
    prompt,
    setPrompt,
    onSubmit,
    onCancel,
    isLoading,
    isCancelling,
    size,
    setSize,
    count,
    setCount,
    referenceImages,
    referencePreviewUrls,
    setReferenceImages,
    setReferencePreviewUrls,
    maxReferenceImages,
    outputMode,
    setOutputMode,
    videoSeconds,
    videoSecondsOptions,
    setVideoSeconds,
    editTargetUrl,
    onStopEditing,
    onEnhance,
    isEnhancing,
    onSurprise,
    isSurprising,
    canUndo,
    onUndo,
    helperError,
    autoFocus
}: ComposerProps) {
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const dragDepth = React.useRef(0);
    const [isDragging, setIsDragging] = React.useState(false);
    const [attachError, setAttachError] = React.useState<string | null>(null);

    const busy = isLoading || isEnhancing || isSurprising;
    const uploadSlots = maxReferenceImages - referenceImages.length - (editTargetUrl ? 1 : 0);
    const isVideo = outputMode === 'video';
    const hasStartImage = Boolean(editTargetUrl) || referenceImages.length > 0;
    // An image can be animated without a description.
    const canSend = !busy && (prompt.trim().length > 0 || (isVideo && hasStartImage));

    // Grow with the text, up to about eight lines.
    const fitTextarea = React.useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
    }, []);
    React.useLayoutEffect(fitTextarea, [prompt, fitTextarea]);
    // Lines rewrap when the window changes width (or a phone rotates).
    React.useEffect(() => {
        window.addEventListener('resize', fitTextarea);
        return () => window.removeEventListener('resize', fitTextarea);
    }, [fitTextarea]);

    const addFiles = React.useCallback(
        (files: File[]) => {
            const images = files.filter((file) => file.type.startsWith('image/'));
            if (images.length === 0) return;
            setAttachError(null);
            if (uploadSlots <= 0) {
                setAttachError(`You can attach up to ${maxReferenceImages} images.`);
                return;
            }
            if (images.length > uploadSlots) {
                setAttachError(`Only ${uploadSlots} more image${uploadSlots === 1 ? '' : 's'} fit.`);
            }
            compressImagesForUpload(images.slice(0, uploadSlots))
                .then(async (processed) => {
                    const urls = await Promise.all(processed.map(readAsDataUrl));
                    setReferenceImages((previous) => [...previous, ...processed]);
                    setReferencePreviewUrls((previous) => [...previous, ...urls]);
                })
                .catch(() => setAttachError('Could not read one of those images.'));
        },
        [maxReferenceImages, setReferenceImages, setReferencePreviewUrls, uploadSlots]
    );

    const removeReference = (index: number) => {
        setReferenceImages((previous) => previous.filter((_, i) => i !== index));
        setReferencePreviewUrls((previous) => previous.filter((_, i) => i !== index));
        setAttachError(null);
    };

    const submit = () => {
        if (canSend) onSubmit();
    };

    const hasAttachments = Boolean(editTargetUrl) || referencePreviewUrls.length > 0;
    const placeholder = isVideo
        ? hasStartImage
            ? 'How should it move? (optional)'
            : 'Describe the video you want…'
        : editTargetUrl
          ? 'Describe a change, like “make it night”'
          : referenceImages.length > 0
            ? 'What should happen with these images?'
            : 'Describe the image you want…';

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                submit();
            }}
            onDragEnter={(event) => {
                if (!event.dataTransfer.types.includes('Files')) return;
                event.preventDefault();
                dragDepth.current++;
                setIsDragging(true);
            }}
            onDragLeave={() => {
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (dragDepth.current === 0) setIsDragging(false);
            }}
            onDragOver={(event) => {
                if (event.dataTransfer.types.includes('Files')) event.preventDefault();
            }}
            onDrop={(event) => {
                event.preventDefault();
                dragDepth.current = 0;
                setIsDragging(false);
                if (!isLoading) addFiles(Array.from(event.dataTransfer.files));
            }}
            className={cn(
                'composer bg-card relative w-full rounded-[1.75rem] border p-2 transition-shadow',
                isDragging ? 'border-primary ring-primary/30 ring-4' : 'border-border'
            )}>
            {(hasAttachments || setOutputMode) && (
                <div className='flex flex-wrap items-center gap-2 px-1 pt-1'>
                    {setOutputMode && (
                        <div
                            role='radiogroup'
                            aria-label='What to make'
                            className='bg-muted/60 flex shrink-0 items-center rounded-full p-0.5'>
                            {OUTPUT_MODES.map(({ value, label, Icon }) => (
                                <button
                                    key={value}
                                    type='button'
                                    role='radio'
                                    aria-checked={outputMode === value}
                                    disabled={isLoading}
                                    onClick={() => setOutputMode(value)}
                                    className={cn(
                                        'focus-visible:ring-ring flex h-8 items-center gap-1.5 rounded-full px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50',
                                        outputMode === value
                                            ? 'bg-background text-foreground font-medium shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                    )}>
                                    <Icon className='h-4 w-4' aria-hidden='true' />
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                    {editTargetUrl && (
                        <div className='bg-primary/12 text-foreground border-primary/30 flex items-center gap-2 rounded-full border py-1 pr-1 pl-1 text-xs'>
                            <Image
                                src={editTargetUrl}
                                alt=''
                                width={28}
                                height={28}
                                className='h-7 w-7 rounded-full object-cover'
                                unoptimized
                            />
                            <span className='font-medium'>
                                {isVideo ? 'Animating this image' : 'Editing this image'}
                            </span>
                            <button
                                type='button'
                                onClick={onStopEditing}
                                disabled={isLoading}
                                aria-label={
                                    isVideo
                                        ? 'Stop animating this image'
                                        : 'Stop editing this image and start a new one'
                                }
                                className='hover:bg-foreground/10 flex h-6 w-6 items-center justify-center rounded-full transition-colors'>
                                <X className='h-3.5 w-3.5' />
                            </button>
                        </div>
                    )}
                    {referencePreviewUrls.map((url, index) => (
                        <div key={index} className='group relative'>
                            <Image
                                src={url}
                                alt={`Attached image ${index + 1}`}
                                width={44}
                                height={44}
                                className='border-border h-11 w-11 rounded-xl border object-cover'
                                unoptimized
                            />
                            <button
                                type='button'
                                onClick={() => removeReference(index)}
                                disabled={isLoading}
                                aria-label={`Remove attached image ${index + 1}`}
                                className='bg-foreground text-background absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full shadow-sm'>
                                <X className='h-3 w-3' />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <textarea
                ref={textareaRef}
                id='prompt'
                rows={1}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                    // Enter sends on keyboards; on touch screens Enter stays a newline unless Ctrl/Cmd is held.
                    const touch = window.matchMedia('(pointer: coarse)').matches;
                    if (event.metaKey || event.ctrlKey || (!touch && !event.shiftKey)) {
                        event.preventDefault();
                        submit();
                    }
                }}
                onPaste={(event) => {
                    const files = Array.from(event.clipboardData.files);
                    if (files.some((file) => file.type.startsWith('image/'))) {
                        event.preventDefault();
                        addFiles(files);
                    }
                }}
                placeholder={placeholder}
                aria-label='Prompt'
                disabled={isLoading}
                autoFocus={autoFocus}
                className='text-foreground placeholder:text-muted-foreground/80 block max-h-[220px] min-h-[52px] w-full resize-none bg-transparent px-3 pt-3 pb-1 text-base leading-relaxed outline-none disabled:opacity-60'
            />

            <div className='flex items-center gap-1 pt-1'>
                <ToolButton
                    label={
                        uploadSlots > 0
                            ? isVideo
                                ? 'Add a photo to animate'
                                : 'Add a photo'
                            : isVideo
                              ? 'A video starts from one image'
                              : `Up to ${maxReferenceImages} images`
                    }
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading || uploadSlots <= 0}>
                    <Plus className='h-5 w-5' />
                </ToolButton>
                <input
                    ref={fileInputRef}
                    type='file'
                    accept='image/png, image/jpeg, image/webp'
                    multiple={maxReferenceImages > 1}
                    className='hidden'
                    onChange={(event) => {
                        if (event.target.files) addFiles(Array.from(event.target.files));
                        event.target.value = '';
                    }}
                />

                {!(isVideo && hasStartImage) && (
                    <div
                        role='radiogroup'
                        aria-label={isVideo ? 'Video shape' : 'Image shape'}
                        className='bg-muted/60 flex shrink-0 items-center rounded-full p-0.5'>
                        {SIZES.map(({ value, label, Icon }) => {
                            const selected = (size === 'auto' ? '1024x1024' : size) === value;
                            return (
                                <button
                                    key={value}
                                    type='button'
                                    role='radio'
                                    aria-checked={selected}
                                    aria-label={label}
                                    title={label}
                                    disabled={isLoading}
                                    onClick={() => setSize(value)}
                                    className={cn(
                                        'focus-visible:ring-ring flex h-8 items-center justify-center gap-1.5 rounded-full px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50 sm:h-9 sm:px-2.5',
                                        selected
                                            ? 'bg-background text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                    )}>
                                    <Icon className='h-4 w-4' aria-hidden='true' />
                                    <span className='hidden md:inline'>{label}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {isVideo ? (
                    <ToolButton
                        label={
                            videoSecondsOptions.length > 1
                                ? `${videoSeconds}-second clip. Tap to change the length`
                                : `Videos are ${videoSeconds} seconds long`
                        }
                        onClick={() => {
                            const next = videoSecondsOptions.indexOf(videoSeconds) + 1;
                            setVideoSeconds(videoSecondsOptions[next % videoSecondsOptions.length] ?? videoSeconds);
                        }}
                        disabled={isLoading || videoSecondsOptions.length < 2}
                        className={cn(
                            'tabular-nums disabled:opacity-100',
                            videoSeconds !== videoSecondsOptions[0] && 'bg-muted text-foreground'
                        )}>
                        <span className='font-medium'>{videoSeconds}s</span>
                    </ToolButton>
                ) : (
                    <ToolButton
                        label={count === 1 ? 'Make 2 at once' : 'Make 1 at a time'}
                        onClick={() => setCount(count >= MAX_IMAGES ? 1 : count + 1)}
                        disabled={isLoading}
                        className={cn('tabular-nums', count > 1 && 'bg-muted text-foreground')}>
                        <span className='font-medium'>{count}×</span>
                    </ToolButton>
                )}

                <div className='flex-1' />

                {canUndo && (
                    <ToolButton label='Undo prompt change' onClick={onUndo} disabled={busy}>
                        <Undo2 className='h-4 w-4' />
                    </ToolButton>
                )}
                {/* On very narrow phones only one helper fits: ideas for an empty prompt, improvement for a written one. */}
                <ToolButton
                    label='Surprise me with an idea'
                    onClick={onSurprise}
                    disabled={busy}
                    className={cn(prompt.trim() && 'max-[400px]:hidden')}>
                    {isSurprising ? (
                        <Loader2 className='h-4 w-4 animate-spin' />
                    ) : (
                        <Dices className='h-[18px] w-[18px]' />
                    )}
                </ToolButton>
                <ToolButton
                    label='Improve my prompt'
                    onClick={onEnhance}
                    disabled={busy || !prompt.trim()}
                    className={cn(!prompt.trim() && 'max-[400px]:hidden')}>
                    {isEnhancing ? (
                        <Loader2 className='h-4 w-4 animate-spin' />
                    ) : (
                        <Sparkles className='h-[18px] w-[18px]' />
                    )}
                </ToolButton>

                {isLoading ? (
                    <button
                        type='button'
                        onClick={onCancel}
                        disabled={isCancelling}
                        aria-label='Stop'
                        className='bg-foreground text-background focus-visible:ring-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95 disabled:opacity-50'>
                        <Square className='h-4 w-4 fill-current' />
                    </button>
                ) : (
                    <button
                        type='submit'
                        disabled={!canSend}
                        aria-label={isVideo ? 'Make video' : editTargetUrl ? 'Apply change' : 'Generate'}
                        className='bg-primary text-primary-foreground focus-visible:ring-ring disabled:bg-muted disabled:text-muted-foreground flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none enabled:hover:scale-105 enabled:active:scale-95'>
                        <ArrowUp className='h-5 w-5' strokeWidth={2.5} />
                    </button>
                )}
            </div>

            {(attachError || helperError) && (
                <p role='alert' className='text-destructive px-3 pt-1 pb-1 text-xs'>
                    {attachError || helperError}
                </p>
            )}
            {isDragging && (
                <div className='bg-card/90 text-primary pointer-events-none absolute inset-0 flex items-center justify-center rounded-[1.75rem] text-sm font-medium'>
                    Drop images to use them
                </div>
            )}
        </form>
    );
}

'use client';

import { Button } from '@/components/ui/button';
import { ImageLightbox, type LightboxMedia } from '@/components/image-lightbox';
import { cn } from '@/lib/utils';
import { Loader2, Send, Grid, Download, Maximize2, ImagePlus } from 'lucide-react';
import Image from 'next/image';
import * as React from 'react';

type ImageInfo = {
    path: string;
    filename: string;
};

type ImageOutputProps = {
    imageBatch: ImageInfo[] | null;
    viewMode: 'grid' | number;
    onViewChange: (view: 'grid' | number) => void;
    altText?: string;
    isLoading: boolean;
    onSendToEdit: (filename: string) => void;
    baseImagePreviewUrl: string | null;
    streamingPreviewImages?: Map<number, string>;
    onSendToVideo?: (filename: string) => void;
    loadingQuality?: 'low' | 'medium' | 'high' | 'auto';
    loadingCount?: number;
};

function formatElapsed(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
}

const GENERATION_TIPS = [
    'Higher quality settings produce more detailed results but take longer',
    'Try "Enhance prompt" to get richer, more descriptive prompts',
    'Reference images help guide style and composition',
    'Generate multiple images to compare variations',
    'Transparent backgrounds work best with simple subjects',
    'Use landscape or portrait sizes for different compositions',
    'Detailed prompts with specific adjectives tend to produce better results',
];

const PHASE_MESSAGES: [number, string][] = [
    [0, 'Interpreting prompt…'],
    [5, 'Setting up generation…'],
    [15, 'Composing image…'],
    [40, 'Rendering details…'],
    [80, 'Refining output…'],
    [150, 'Finalizing — hang tight…'],
    [240, 'Still working — complex images take time…'],
];

function getPhaseMessage(elapsed: number): string {
    let msg = PHASE_MESSAGES[0][1];
    for (const [threshold, message] of PHASE_MESSAGES) {
        if (elapsed >= threshold) msg = message;
    }
    return msg;
}

function getEstimatedDuration(quality?: string, count?: number): number {
    let base = 60;
    if (quality === 'high') base = 120;
    else if (quality === 'low') base = 30;
    else if (quality === 'medium') base = 60;
    const multiplier = count && count > 1 ? 1 + 0.5 * (count - 1) : 1;
    return base * multiplier;
}

function getEstimatedProgress(elapsed: number, estimatedDuration: number): number {
    // Asymptotic approach: fast initially, slows near end. Never reaches 100%.
    const ratio = elapsed / estimatedDuration;
    return Math.min(1 - Math.exp(-2 * ratio), 0.92);
}

function GenerationLoader({
    elapsedSeconds,
    quality,
    count,
}: {
    elapsedSeconds: number;
    quality?: string;
    count?: number;
}) {
    const phaseMessage = getPhaseMessage(elapsedSeconds);
    const tipIndex = Math.floor(elapsedSeconds / 10) % GENERATION_TIPS.length;
    const estimatedDuration = getEstimatedDuration(quality, count);
    const progress = getEstimatedProgress(elapsedSeconds, estimatedDuration);

    return (
        <div className='flex flex-col items-center justify-center gap-4'>
            {/* Elapsed time with spinner */}
            <div className='relative flex h-20 w-20 items-center justify-center'>
                <Loader2 className='absolute h-16 w-16 animate-spin text-primary/20' />
                <span className='relative font-mono text-xs tabular-nums text-foreground/80'>
                    {formatElapsed(elapsedSeconds)}
                </span>
            </div>

            {/* Phase message */}
            <p className='text-sm font-medium text-foreground/90'>{phaseMessage}</p>

            {/* Progress bar */}
            <div className='h-1 w-44 overflow-hidden rounded-full bg-border'>
                <div
                    className='generation-progress-fill h-full rounded-full bg-primary/50 transition-[width] duration-1000 ease-out'
                    style={{ width: `${progress * 100}%` }}
                />
            </div>

            {/* Rotating tip */}
            <p
                key={tipIndex}
                className='rise-in max-w-[260px] text-center text-[11px] leading-relaxed text-muted-foreground/60'
            >
                {GENERATION_TIPS[tipIndex]}
            </p>
        </div>
    );
}

const getGridColsClass = (count: number): string => {
    if (count <= 1) return 'grid-cols-1';
    if (count <= 4) return 'grid-cols-2';
    if (count <= 9) return 'grid-cols-3';
    return 'grid-cols-3';
};

const responsiveContainImageStyle = { width: 'auto', height: 'auto' } as const;
const eagerImageProps = { loading: 'eager' as const, fetchPriority: 'high' as const };

export function ImageOutput({
    imageBatch,
    viewMode,
    onViewChange,
    altText = 'Generated image output',
    isLoading,
    onSendToEdit,
    baseImagePreviewUrl,
    streamingPreviewImages,
    onSendToVideo,
    loadingQuality,
    loadingCount
}: ImageOutputProps) {
    const handleSendClick = () => {
        // Send to edit only works when a single image is selected
        if (typeof viewMode === 'number' && imageBatch && imageBatch[viewMode]) {
            onSendToEdit(imageBatch[viewMode].filename);
        }
    };

    const handleSendToVideoClick = () => {
        if (typeof viewMode === 'number' && imageBatch && imageBatch[viewMode] && onSendToVideo) {
            onSendToVideo(imageBatch[viewMode].filename);
        }
    };

    const handleDownload = async () => {
        if (typeof viewMode === 'number' && imageBatch && imageBatch[viewMode]) {
            const img = imageBatch[viewMode];
            try {
                const response = await fetch(img.path);
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = img.filename; // Use the filename from the image info
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } catch (error) {
                console.error('Download failed:', error);
            }
        }
    };

    const showCarousel = imageBatch && imageBatch.length > 1;
    const isSingleImageView = typeof viewMode === 'number';
    const canSendToEdit = !isLoading && isSingleImageView && imageBatch && imageBatch[viewMode];
    const canSendToVideo = !isLoading && isSingleImageView && imageBatch && imageBatch[viewMode] && Boolean(onSendToVideo);
    const canDownload = !isLoading && isSingleImageView && imageBatch && imageBatch[viewMode];

    const [lightboxOpen, setLightboxOpen] = React.useState(false);

    // Elapsed time counter during loading
    const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
    React.useEffect(() => {
        if (!isLoading) {
            setElapsedSeconds(0);
            return;
        }
        const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
        return () => clearInterval(interval);
    }, [isLoading]);

    const lightboxMedia: LightboxMedia[] = React.useMemo(() => {
        if (!imageBatch) return [];
        return imageBatch.map((img) => ({
            url: img.path,
            filename: img.filename,
            alt: altText,
        }));
    }, [imageBatch, altText]);

    return (
        <div className='relative flex h-full min-h-[300px] w-full flex-col items-center justify-between gap-4 overflow-hidden rounded-md border border-border bg-card p-5 shadow-[0_1px_0_0_var(--border)]'>
            <div className='absolute right-5 top-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground'>
                {!isLoading && imageBatch && imageBatch.length > 0 ? `${typeof viewMode === 'number' ? viewMode + 1 : '·'} / ${imageBatch.length}` : ''}
            </div>
            <div className='relative flex h-full w-full flex-grow items-center justify-center overflow-hidden'>
                {isLoading ? (
                    streamingPreviewImages && streamingPreviewImages.size > 0 ? (
                        // Show streaming preview images
                        streamingPreviewImages.size === 1 ? (
                            // Single image: centered like final view
                            <div className='relative flex h-full w-full items-center justify-center'>
                                {(() => {
                                    const entries = Array.from(streamingPreviewImages.entries());
                                    const latestEntry = entries[entries.length - 1];
                                    if (!latestEntry) return null;
                                    const [, dataUrl] = latestEntry;
                                    return (
                                        <div className='relative'>
                                            <Image
                                                src={dataUrl}
                                                alt='Streaming preview — still refining'
                                                width={512}
                                                height={512}
                                                className='h-auto w-auto max-h-full max-w-full object-contain'
                                                style={responsiveContainImageStyle}
                                                unoptimized
                                            />
                                            {/* Gradient scrim anchored to image bottom */}
                                            <div className='pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/50 to-transparent' />
                                            {/* Status pill anchored to image bottom */}
                                            <div className='absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-background/80 px-3 py-1.5 backdrop-blur-sm shadow-sm'>
                                                <Loader2 className='h-3.5 w-3.5 animate-spin text-primary' />
                                                <p className='text-xs font-medium text-foreground/90'>Refining — not the final image</p>
                                                <span className='font-mono text-[10px] tabular-nums text-muted-foreground'>{formatElapsed(elapsedSeconds)}</span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        ) : (
                            // Multiple images: grid with streaming previews + placeholders
                            <div className='relative flex h-full w-full flex-col items-center justify-center gap-3'>
                                <div className={`grid ${getGridColsClass(loadingCount ?? streamingPreviewImages.size)} max-h-full w-full max-w-full gap-2 p-1`}>
                                    {Array.from({ length: loadingCount ?? streamingPreviewImages.size }, (_, i) => {
                                        const preview = streamingPreviewImages.get(i);
                                        return (
                                            <div key={i} className={`relative aspect-square overflow-hidden rounded-md bg-muted/20 ${preview ? 'border border-primary/25 shadow-[0_0_0_1px_var(--primary)/10]' : 'border border-dashed border-border'}`}>
                                                {preview ? (
                                                    <Image
                                                        src={preview}
                                                        alt={`Streaming preview ${i + 1} — still refining`}
                                                        fill
                                                        style={{ objectFit: 'contain' }}
                                                        unoptimized
                                                    />
                                                ) : (
                                                    <div className='flex h-full w-full flex-col items-center justify-center gap-1.5'>
                                                        <Loader2 className='h-5 w-5 animate-spin text-muted-foreground/30' />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className='flex items-center gap-2 rounded-full bg-background/80 px-3 py-1.5 backdrop-blur-sm shadow-sm'>
                                    <Loader2 className='h-3.5 w-3.5 animate-spin text-primary' />
                                    <p className='text-xs font-medium text-foreground/90'>Refining — not final results</p>
                                    <span className='font-mono text-[10px] tabular-nums text-muted-foreground'>{formatElapsed(elapsedSeconds)}</span>
                                </div>
                            </div>
                        )
                    ) : baseImagePreviewUrl ? (
                        <div className='relative flex h-full w-full items-center justify-center'>
                            <Image
                                src={baseImagePreviewUrl}
                                alt='Reference image'
                                fill
                                style={{ objectFit: 'contain' }}
                                className='blur-md filter'
                                unoptimized
                            />
                            <div className='absolute inset-0 flex items-center justify-center bg-background/50'>
                                <GenerationLoader elapsedSeconds={elapsedSeconds} quality={loadingQuality} count={loadingCount} />
                            </div>
                        </div>
                    ) : (
                        <GenerationLoader elapsedSeconds={elapsedSeconds} quality={loadingQuality} count={loadingCount} />
                    )
                ) : imageBatch && imageBatch.length > 0 ? (
                    viewMode === 'grid' ? (
                        <div
                            className={`grid ${getGridColsClass(imageBatch.length)} max-h-full w-full max-w-full gap-1 p-1`}>
                            {imageBatch.map((img, index) => (
                                <button
                                    key={img.filename}
                                    className='relative aspect-square overflow-hidden rounded border border-border hover:border-foreground/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring'
                                    onClick={() => onViewChange(index)}
                                >
                                    <Image
                                        src={img.path}
                                        alt={`Generated image ${index + 1}`}
                                        fill
                                        style={{ objectFit: 'contain' }}
                                        sizes='(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw'
                                        unoptimized
                                        {...(index === 0 ? eagerImageProps : {})}
                                    />
                                </button>
                            ))}
                        </div>
                    ) : imageBatch[viewMode] ? (
                        <>
                            <button
                                className='relative flex h-full w-full items-center justify-center cursor-zoom-in group focus:outline-none'
                                onClick={() => setLightboxOpen(true)}>
                                <Image
                                    src={imageBatch[viewMode].path}
                                    alt={altText}
                                    width={512}
                                    height={512}
                                    className='h-auto w-auto max-h-full max-w-full object-contain'
                                    style={responsiveContainImageStyle}
                                    unoptimized
                                    {...eagerImageProps}
                                />
                                <div className='absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/50 rounded p-1 text-foreground backdrop-blur-sm'>
                                    <Maximize2 className='h-4 w-4' />
                                </div>
                            </button>
                            <ImageLightbox
                                media={lightboxMedia}
                                open={lightboxOpen}
                                onOpenChange={setLightboxOpen}
                                initialIndex={typeof viewMode === 'number' ? viewMode : 0}
                            />
                        </>
                    ) : (
                        <div className='text-center text-muted-foreground/70'>
                            <p>Error displaying image.</p>
                        </div>
                    )
                ) : (
                    <div className='flex flex-col items-center gap-3 text-center'>
                        <div className='flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-border'>
                            <div className='h-2 w-2 rounded-full bg-primary/60' />
                        </div>
                        <p className='font-display text-2xl italic text-muted-foreground'>
                            No image yet
                        </p>
                    </div>
                )}
            </div>

            <div className='flex h-10 w-full shrink-0 items-center justify-center gap-4'>
                {showCarousel && (
                    <div className='flex items-center gap-1.5 rounded-md border border-border bg-muted/50 p-1'>
                        <Button
                            variant='ghost'
                            size='icon'
                            className={cn(
                                'h-8 w-8 rounded p-1',
                                viewMode === 'grid'
                                    ? 'bg-muted text-foreground'
                                    : 'text-muted-foreground/80 hover:bg-muted/60 hover:text-foreground/90'
                            )}
                            onClick={() => onViewChange('grid')}
                            aria-label='Show grid view'>
                            <Grid className='h-4 w-4' />
                        </Button>
                        {imageBatch.map((img, index) => (
                            <Button
                                key={img.filename}
                                variant='ghost'
                                size='icon'
                                className={cn(
                                    'h-8 w-8 overflow-hidden rounded p-0.5',
                                    viewMode === index
                                        ? 'ring-2 ring-ring ring-offset-1 ring-offset-black'
                                        : 'opacity-60 hover:opacity-100'
                                )}
                                onClick={() => onViewChange(index)}
                                aria-label={`Select image ${index + 1}`}>
                                <Image
                                    src={img.path}
                                    alt={`Thumbnail ${index + 1}`}
                                    width={28}
                                    height={28}
                                    className='h-full w-full object-cover'
                                    unoptimized
                                />
                            </Button>
                        ))}
                    </div>
                )}

                <div className='flex items-center gap-2'>
                    <Button
                        variant='outline'
                        size='sm'
                        onClick={handleDownload}
                        disabled={!canDownload}
                        className={cn(
                            'shrink-0 border-border text-foreground/90 hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
                            showCarousel && viewMode === 'grid' ? 'invisible' : 'visible'
                        )}>
                        <Download className='mr-2 h-4 w-4' />
                        Download
                    </Button>
                    <Button
                        variant='outline'
                        size='sm'
                        onClick={handleSendClick}
                        disabled={!canSendToEdit}
                        className={cn(
                            'shrink-0 border-border text-foreground/90 hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
                            showCarousel && viewMode === 'grid' ? 'invisible' : 'visible'
                        )}>
                        <Send className='mr-2 h-4 w-4' />
                        Use as Reference
                    </Button>
                    {/* Send to Video button hidden - feature temporarily disabled
                    {onSendToVideo && (
                        <Button
                            variant='outline'
                            size='sm'
                            onClick={handleSendToVideoClick}
                            disabled={!canSendToVideo}
                            className={cn(
                                'shrink-0 border-border text-foreground/90 hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
                                showCarousel && viewMode === 'grid' ? 'invisible' : 'visible'
                            )}>
                            <Send className='mr-2 h-4 w-4' />
                            Send to Video
                        </Button>
                    )}
                    */}
                </div>
            </div>
        </div>
    );
}

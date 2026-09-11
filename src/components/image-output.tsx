'use client';

import { ImageLightbox, type LightboxMedia } from '@/components/image-lightbox';
import { Button } from '@/components/ui/button';
import { downloadImage } from '@/lib/image-download';
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
    isPreparing?: boolean;
    completedCount?: number;
    onSendToEdit: (filename: string) => void;
    baseImagePreviewUrl: string | null;
    streamingPreviewImages?: Map<number, string>;
    onSendToVideo?: (filename: string) => void;
    loadingCount?: number;
};

function formatElapsed(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
}

function GenerationLoader({ elapsedSeconds, status }: { elapsedSeconds: number; status: string }) {
    return (
        <div className='flex flex-col items-center justify-center gap-4'>
            {/* Elapsed time with spinner */}
            <div className='relative flex h-20 w-20 items-center justify-center'>
                <Loader2 className='text-primary/20 absolute h-16 w-16 animate-spin' />
                <span className='text-foreground/80 relative font-mono text-xs tabular-nums'>
                    {formatElapsed(elapsedSeconds)}
                </span>
            </div>

            <p role='status' className='text-foreground/90 text-sm font-medium'>
                {status}
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
    isPreparing = false,
    completedCount = 0,
    onSendToEdit,
    baseImagePreviewUrl,
    streamingPreviewImages,
    onSendToVideo,
    loadingCount
}: ImageOutputProps) {
    const status = isPreparing
        ? 'Loading reference…'
        : completedCount > 0
          ? `${completedCount}/${loadingCount ?? 1} complete`
          : 'Generating…';
    const [downloadError, setDownloadError] = React.useState<{ path: string; message: string } | null>(null);
    const [isDownloading, setIsDownloading] = React.useState(false);
    React.useEffect(() => setDownloadError(null), [imageBatch, viewMode]);
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
        if (!isDownloading && typeof viewMode === 'number' && imageBatch && imageBatch[viewMode]) {
            const img = imageBatch[viewMode];
            setDownloadError(null);
            setIsDownloading(true);
            try {
                await downloadImage(img.path, img.filename);
            } catch (error) {
                console.error('Download failed:', error);
                setDownloadError({
                    path: img.path,
                    message: error instanceof Error ? error.message : 'Download failed. Try again.'
                });
            } finally {
                setIsDownloading(false);
            }
        }
    };

    const showCarousel = imageBatch && imageBatch.length > 1;
    const isSingleImageView = typeof viewMode === 'number';
    const canSendToEdit = !isLoading && !isPreparing && isSingleImageView && imageBatch && imageBatch[viewMode];
    const canSendToVideo =
        !isLoading && !isPreparing && isSingleImageView && imageBatch && imageBatch[viewMode] && Boolean(onSendToVideo);
    const canDownload = !isLoading && !isPreparing && isSingleImageView && imageBatch && imageBatch[viewMode];

    const [lightboxOpen, setLightboxOpen] = React.useState(false);

    // Elapsed time counter during loading
    const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
    React.useEffect(() => {
        if (!isLoading) {
            setElapsedSeconds(0);
            return;
        }
        const startedAt = Date.now();
        const interval = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
        return () => clearInterval(interval);
    }, [isLoading]);

    const lightboxMedia: LightboxMedia[] = React.useMemo(() => {
        if (!imageBatch) return [];
        return imageBatch.map((img) => ({
            url: img.path,
            filename: img.filename,
            alt: altText
        }));
    }, [imageBatch, altText]);

    return (
        <div className='border-border bg-card relative flex h-full min-h-[300px] w-full flex-col items-center justify-between gap-4 overflow-hidden rounded-md border p-5 shadow-[0_1px_0_0_var(--border)]'>
            <div className='text-muted-foreground absolute top-4 right-5 font-mono text-[10px] tracking-[0.18em] uppercase'>
                {!isLoading && imageBatch && imageBatch.length > 0
                    ? `${typeof viewMode === 'number' ? viewMode + 1 : '·'} / ${imageBatch.length}`
                    : ''}
            </div>
            <div className='relative flex h-full w-full flex-grow items-center justify-center overflow-hidden'>
                {isLoading || isPreparing ? (
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
                                                alt='Image preview'
                                                width={512}
                                                height={512}
                                                className='h-auto max-h-full w-auto max-w-full object-contain'
                                                style={responsiveContainImageStyle}
                                                unoptimized
                                            />
                                            {/* Gradient scrim anchored to image bottom */}
                                            <div className='pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/50 to-transparent' />
                                            {/* Status pill anchored to image bottom */}
                                            <div className='bg-background/80 absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 shadow-sm backdrop-blur-sm'>
                                                <Loader2 className='text-primary h-3.5 w-3.5 animate-spin' />
                                                <p role='status' className='text-foreground/90 text-xs font-medium'>
                                                    {status}
                                                </p>
                                                <span className='text-muted-foreground font-mono text-[10px] tabular-nums'>
                                                    {formatElapsed(elapsedSeconds)}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        ) : (
                            // Multiple images: grid with streaming previews + placeholders
                            <div className='relative flex h-full w-full flex-col items-center justify-center gap-3'>
                                <div
                                    className={`grid ${getGridColsClass(loadingCount ?? streamingPreviewImages.size)} max-h-full w-full max-w-full gap-2 p-1`}>
                                    {Array.from({ length: loadingCount ?? streamingPreviewImages.size }, (_, i) => {
                                        const preview = streamingPreviewImages.get(i);
                                        return (
                                            <div
                                                key={i}
                                                className={`bg-muted/20 relative aspect-square overflow-hidden rounded-md ${preview ? 'border-primary/25 border shadow-[0_0_0_1px_var(--primary)/10]' : 'border-border border border-dashed'}`}>
                                                {preview ? (
                                                    <Image
                                                        src={preview}
                                                        alt={`Image ${i + 1} preview`}
                                                        fill
                                                        style={{ objectFit: 'contain' }}
                                                        unoptimized
                                                    />
                                                ) : (
                                                    <div className='flex h-full w-full flex-col items-center justify-center gap-1.5'>
                                                        <Loader2 className='text-muted-foreground/30 h-5 w-5 animate-spin' />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className='bg-background/80 flex items-center gap-2 rounded-full px-3 py-1.5 shadow-sm backdrop-blur-sm'>
                                    <Loader2 className='text-primary h-3.5 w-3.5 animate-spin' />
                                    <p role='status' className='text-foreground/90 text-xs font-medium'>
                                        {status}
                                    </p>
                                    <span className='text-muted-foreground font-mono text-[10px] tabular-nums'>
                                        {formatElapsed(elapsedSeconds)}
                                    </span>
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
                            <div className='bg-background/50 absolute inset-0 flex items-center justify-center'>
                                <GenerationLoader elapsedSeconds={elapsedSeconds} status={status} />
                            </div>
                        </div>
                    ) : (
                        <GenerationLoader elapsedSeconds={elapsedSeconds} status={status} />
                    )
                ) : imageBatch && imageBatch.length > 0 ? (
                    viewMode === 'grid' ? (
                        <div
                            className={`grid ${getGridColsClass(imageBatch.length)} max-h-full w-full max-w-full gap-1 p-1`}>
                            {imageBatch.map((img, index) => (
                                <button
                                    key={img.filename}
                                    className='border-border hover:border-foreground/50 focus:ring-ring relative aspect-square overflow-hidden rounded border transition-colors focus:ring-2 focus:outline-none'
                                    onClick={() => onViewChange(index)}>
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
                                className='group relative flex h-full w-full cursor-zoom-in items-center justify-center focus:outline-none'
                                onClick={() => setLightboxOpen(true)}>
                                <Image
                                    src={imageBatch[viewMode].path}
                                    alt={altText}
                                    width={512}
                                    height={512}
                                    className='h-auto max-h-full w-auto max-w-full object-contain'
                                    style={responsiveContainImageStyle}
                                    unoptimized
                                    {...eagerImageProps}
                                />
                                <div className='bg-background/50 text-foreground absolute top-2 right-2 rounded p-1 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100'>
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
                        <div className='text-muted-foreground/70 text-center'>
                            <p>Error displaying image.</p>
                        </div>
                    )
                ) : (
                    <div className='flex flex-col items-center gap-3 text-center'>
                        <div className='border-border flex h-16 w-16 items-center justify-center rounded-full border border-dashed'>
                            <div className='bg-primary/60 h-2 w-2 rounded-full' />
                        </div>
                        <p className='font-display text-muted-foreground text-2xl italic'>No image yet</p>
                    </div>
                )}
            </div>

            {downloadError && typeof viewMode === 'number' && imageBatch?.[viewMode]?.path === downloadError.path && (
                <p role='alert' className='text-destructive text-sm'>
                    {downloadError.message}
                </p>
            )}
            <div className='flex h-10 w-full shrink-0 items-center justify-center gap-4'>
                {showCarousel && (
                    <div className='border-border bg-muted/50 flex items-center gap-1.5 rounded-md border p-1'>
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
                                        ? 'ring-ring ring-2 ring-offset-1 ring-offset-black'
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
                        disabled={!canDownload || isDownloading}
                        className={cn(
                            'border-border text-foreground/90 hover:bg-muted/60 hover:text-foreground shrink-0 disabled:pointer-events-none disabled:opacity-50',
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
                            'border-border text-foreground/90 hover:bg-muted/60 hover:text-foreground shrink-0 disabled:pointer-events-none disabled:opacity-50',
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

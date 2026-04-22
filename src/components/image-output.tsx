'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2, Send, Grid, Download, Maximize2 } from 'lucide-react';
import Image from 'next/image';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTrigger,
    DialogTitle,
} from '@/components/ui/dialog';

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
    currentMode: 'generate' | 'edit' | 'video';
    baseImagePreviewUrl: string | null;
    streamingPreviewImages?: Map<number, string>;
    onSendToVideo?: (filename: string) => void;
};

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
    currentMode,
    baseImagePreviewUrl,
    streamingPreviewImages,
    onSendToVideo
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

    return (
        <div className='relative flex h-full min-h-[300px] w-full flex-col items-center justify-between gap-4 overflow-hidden rounded-md border border-border bg-card p-5 shadow-[0_1px_0_0_var(--border)]'>
            <div className='absolute right-5 top-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground'>
                {isLoading ? 'generating…' : imageBatch && imageBatch.length > 0 ? `${typeof viewMode === 'number' ? viewMode + 1 : '·'} / ${imageBatch.length}` : ''}
            </div>
            <div className='relative mt-8 flex h-full w-full flex-grow items-center justify-center overflow-hidden'>
                {isLoading ? (
                    streamingPreviewImages && streamingPreviewImages.size > 0 ? (
                        // Show streaming preview images - single image centered like final view
                        <div className='relative flex h-full w-full items-center justify-center'>
                            {/* Show the latest preview image (highest index) */}
                            {(() => {
                                const entries = Array.from(streamingPreviewImages.entries());
                                const latestEntry = entries[entries.length - 1];
                                if (!latestEntry) return null;
                                const [, dataUrl] = latestEntry;
                                return (
                                    <Image
                                        src={dataUrl}
                                        alt='Streaming preview'
                                        width={512}
                                        height={512}
                                        className='h-auto w-auto max-h-full max-w-full object-contain'
                                        style={responsiveContainImageStyle}
                                        unoptimized
                                    />
                                );
                            })()}
                            {/* Overlay loader at bottom center */}
                            <div className='absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-background/70 px-3 py-1.5 text-foreground/90'>
                                <Loader2 className='h-4 w-4 animate-spin' />
                                <p className='text-sm'>Streaming...</p>
                            </div>
                        </div>
                    ) : currentMode === 'edit' && baseImagePreviewUrl ? (
                        <div className='relative flex h-full w-full items-center justify-center'>
                            <Image
                                src={baseImagePreviewUrl}
                                alt='Base image for editing'
                                fill
                                style={{ objectFit: 'contain' }}
                                className='blur-md filter'
                                unoptimized
                            />
                            <div className='absolute inset-0 flex flex-col items-center justify-center bg-background/50 text-foreground/90'>
                                <Loader2 className='mb-2 h-8 w-8 animate-spin' />
                                <p>Editing image...</p>
                            </div>
                        </div>
                    ) : (
                        <div className='flex flex-col items-center justify-center text-muted-foreground'>
                            <Loader2 className='mb-2 h-8 w-8 animate-spin' />
                            <p>Generating image...</p>
                        </div>
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
                        <Dialog>
                            <DialogTrigger asChild>
                                <button className='relative flex h-full w-full items-center justify-center cursor-zoom-in group focus:outline-none'>
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
                            </DialogTrigger>
                            <DialogContent className='max-w-[95vw] max-h-[95vh] w-auto h-auto p-0 border-none bg-transparent shadow-none flex items-center justify-center outline-none sm:max-w-[95vw] [&>button]:bg-background/50 [&>button]:text-foreground [&>button]:hover:bg-background/70 [&>button]:top-4 [&>button]:right-4 [&>button]:h-10 [&>button]:w-10 [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button]:rounded-full'>
                                <DialogTitle className='sr-only'>Full resolution view</DialogTitle>
                                <DialogDescription className='sr-only'>
                                    A full-size preview of the selected generated image.
                                </DialogDescription>
                                <div className='relative flex items-center justify-center w-full h-full'>
                                    <Image
                                        src={imageBatch[viewMode].path}
                                        alt={altText}
                                        width={2048}
                                        height={2048}
                                        className='h-auto w-auto max-w-[90vw] max-h-[90vh] object-contain'
                                        style={responsiveContainImageStyle}
                                        unoptimized
                                    />
                                </div>
                            </DialogContent>
                        </Dialog>
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
                        Send to Edit
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

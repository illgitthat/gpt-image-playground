'use client';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { downloadImage } from '@/lib/image-download';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, X, Download } from 'lucide-react';
import Image from 'next/image';
import * as React from 'react';

export type LightboxMedia = {
    url: string;
    filename?: string;
    alt?: string;
    isVideo?: boolean;
};

type ImageLightboxProps = {
    media: LightboxMedia[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialIndex?: number;
};

export function ImageLightbox({ media, open, onOpenChange, initialIndex = 0 }: ImageLightboxProps) {
    const [index, setIndex] = React.useState(initialIndex);
    const [downloadError, setDownloadError] = React.useState<{ url: string; message: string } | null>(null);
    const [isDownloading, setIsDownloading] = React.useState(false);

    React.useEffect(() => setDownloadError(null), [index, open]);

    // Sync index when initialIndex or open state changes
    React.useEffect(() => {
        if (open) setIndex(initialIndex);
    }, [open, initialIndex]);

    // Clamp index if media array changes
    React.useEffect(() => {
        if (index >= media.length && media.length > 0) {
            setIndex(media.length - 1);
        }
    }, [media.length, index]);

    const prev = React.useCallback(() => {
        setIndex((i) => (i > 0 ? i - 1 : media.length - 1));
    }, [media.length]);

    const next = React.useCallback(() => {
        setIndex((i) => (i < media.length - 1 ? i + 1 : 0));
    }, [media.length]);

    // Keyboard navigation
    React.useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                prev();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                next();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, prev, next]);

    const current = media[index];
    if (!current) return null;

    const hasGallery = media.length > 1;

    const handleDownload = async () => {
        if (!current || isDownloading) return;
        setDownloadError(null);
        setIsDownloading(true);
        try {
            await downloadImage(current.url, current.filename || 'image');
        } catch (err) {
            console.error('Download failed:', err);
            setDownloadError({
                url: current.url,
                message: err instanceof Error ? err.message : 'Download failed. Try again.'
            });
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                className='flex h-auto max-h-[95vh] w-auto max-w-[95vw] items-center justify-center border-none bg-black/95 p-0 shadow-none outline-none sm:max-w-[95vw]'>
                <DialogTitle className='sr-only'>Full resolution view</DialogTitle>
                <DialogDescription className='sr-only'>A full-size preview of the selected image.</DialogDescription>
                {downloadError?.url === current.url && (
                    <p
                        role='alert'
                        className='bg-background text-destructive absolute inset-x-4 top-16 z-50 rounded-md border p-3 text-sm'>
                        {downloadError.message}
                    </p>
                )}

                {/* Close button */}
                <button
                    onClick={() => onOpenChange(false)}
                    className='bg-background/50 text-foreground hover:bg-background/70 absolute top-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-sm transition-colors'
                    aria-label='Close lightbox'>
                    <X className='h-5 w-5' />
                </button>

                {/* Download button */}
                {!current.isVideo && (
                    <button
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className='bg-background/50 text-foreground hover:bg-background/70 absolute top-4 right-16 z-50 flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-sm transition-colors'
                        aria-label='Download image'>
                        <Download className='h-5 w-5' />
                    </button>
                )}

                {/* Prev / Next arrows */}
                {hasGallery && (
                    <>
                        <button
                            onClick={prev}
                            className='bg-background/50 text-foreground hover:bg-background/70 absolute top-1/2 left-4 z-50 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full backdrop-blur-sm transition-colors'
                            aria-label='Previous image'>
                            <ChevronLeft className='h-6 w-6' />
                        </button>
                        <button
                            onClick={next}
                            className='bg-background/50 text-foreground hover:bg-background/70 absolute top-1/2 right-4 z-50 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full backdrop-blur-sm transition-colors'
                            aria-label='Next image'>
                            <ChevronRight className='h-6 w-6' />
                        </button>
                    </>
                )}

                {/* Main image / video */}
                {current.isVideo ? (
                    <video
                        src={current.url}
                        controls
                        autoPlay
                        loop
                        className='max-h-[85vh] max-w-[90vw] object-contain'
                    />
                ) : (
                    <Image
                        src={current.url}
                        alt={current.alt || 'Image preview'}
                        width={2048}
                        height={2048}
                        className='h-auto max-h-[85vh] w-auto max-w-[90vw] object-contain'
                        style={{ width: 'auto', height: 'auto' }}
                        unoptimized
                    />
                )}

                {/* Gallery thumbnails */}
                {hasGallery && (
                    <div className='bg-background/60 absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-full p-1.5 backdrop-blur-sm'>
                        {media.map((item, i) => (
                            <button
                                key={item.filename || i}
                                onClick={() => setIndex(i)}
                                className={cn(
                                    'h-10 w-10 overflow-hidden rounded transition-all',
                                    index === i
                                        ? 'ring-ring ring-2 ring-offset-1 ring-offset-black'
                                        : 'opacity-50 hover:opacity-100'
                                )}
                                aria-label={`View image ${i + 1}`}>
                                {item.isVideo ? (
                                    <video src={item.url} muted className='h-full w-full object-cover' />
                                ) : (
                                    <Image
                                        src={item.url}
                                        alt={`Thumbnail ${i + 1}`}
                                        width={40}
                                        height={40}
                                        className='h-full w-full object-cover'
                                        unoptimized
                                    />
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {/* Counter */}
                {hasGallery && (
                    <div className='bg-background/60 text-foreground absolute top-4 left-1/2 z-50 -translate-x-1/2 rounded-full px-3 py-1 text-sm backdrop-blur-sm'>
                        {index + 1} / {media.length}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

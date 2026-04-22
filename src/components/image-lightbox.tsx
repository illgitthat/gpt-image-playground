'use client';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
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
            if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, prev, next]);

    const current = media[index];
    if (!current) return null;

    const hasGallery = media.length > 1;

    const handleDownload = async () => {
        if (!current) return;
        try {
            const response = await fetch(current.url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = current.filename || 'image';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
        } catch (err) {
            console.error('Download failed:', err);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className='max-w-[95vw] max-h-[95vh] w-auto h-auto p-0 border-none bg-black/95 shadow-none flex items-center justify-center outline-none sm:max-w-[95vw] [&>button]:hidden'>
                <DialogTitle className='sr-only'>Full resolution view</DialogTitle>
                <DialogDescription className='sr-only'>
                    A full-size preview of the selected image.
                </DialogDescription>

                {/* Close button */}
                <button
                    onClick={() => onOpenChange(false)}
                    className='absolute top-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-background/50 text-foreground backdrop-blur-sm transition-colors hover:bg-background/70'
                    aria-label='Close lightbox'>
                    <X className='h-5 w-5' />
                </button>

                {/* Download button */}
                {!current.isVideo && (
                    <button
                        onClick={handleDownload}
                        className='absolute top-4 right-16 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-background/50 text-foreground backdrop-blur-sm transition-colors hover:bg-background/70'
                        aria-label='Download image'>
                        <Download className='h-5 w-5' />
                    </button>
                )}

                {/* Prev / Next arrows */}
                {hasGallery && (
                    <>
                        <button
                            onClick={prev}
                            className='absolute left-4 top-1/2 z-50 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/50 text-foreground backdrop-blur-sm transition-colors hover:bg-background/70'
                            aria-label='Previous image'>
                            <ChevronLeft className='h-6 w-6' />
                        </button>
                        <button
                            onClick={next}
                            className='absolute right-4 top-1/2 z-50 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/50 text-foreground backdrop-blur-sm transition-colors hover:bg-background/70'
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
                        className='h-auto w-auto max-h-[85vh] max-w-[90vw] object-contain'
                        style={{ width: 'auto', height: 'auto' }}
                        unoptimized
                    />
                )}

                {/* Gallery thumbnails */}
                {hasGallery && (
                    <div className='absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-background/60 p-1.5 backdrop-blur-sm'>
                        {media.map((item, i) => (
                            <button
                                key={item.filename || i}
                                onClick={() => setIndex(i)}
                                className={cn(
                                    'h-10 w-10 overflow-hidden rounded transition-all',
                                    index === i
                                        ? 'ring-2 ring-ring ring-offset-1 ring-offset-black'
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
                    <div className='absolute top-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-background/60 px-3 py-1 text-sm text-foreground backdrop-blur-sm'>
                        {index + 1} / {media.length}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

'use client';

import type { HistoryMetadata } from '@/app/page';
import { cn } from '@/lib/utils';
import { videoUrl } from '@/lib/video-client';
import { Layers, Play } from 'lucide-react';
import Image from 'next/image';
import * as React from 'react';

type GalleryProps = {
    history: HistoryMetadata[];
    activeTimestamp: number | null;
    getImageSrc: (filename: string) => string | undefined;
    onOpen: (item: HistoryMetadata) => void;
    onClear: () => void;
};

// Every image and video this browser has made, newest first. Tap one to bring it back to the stage.
export function Gallery({ history, activeTimestamp, getImageSrc, onOpen, onClear }: GalleryProps) {
    const items = history.filter((item) =>
        item.mode === 'video' ? (item.videos?.length ?? 0) > 0 : (item.images?.length ?? 0) > 0
    );
    if (items.length === 0) return null;

    return (
        <section aria-labelledby='gallery-heading' className='w-full'>
            <div className='mb-3 flex items-baseline justify-between gap-4'>
                <h2 id='gallery-heading' className='text-foreground text-sm font-semibold'>
                    {items.some((item) => item.mode === 'video') ? 'Your images and videos' : 'Your images'}
                    <span className='text-muted-foreground ml-2 text-xs font-normal tabular-nums'>{items.length}</span>
                </h2>
                <button
                    type='button'
                    onClick={onClear}
                    className='text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-full px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none'>
                    Clear all
                </button>
            </div>
            <ul className='grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8'>
                {items.map((item, index) => {
                    const isVideo = item.mode === 'video';
                    const first = isVideo ? item.videos![0] : item.images![0];
                    // Videos made from an image have a saved still; others show their own first frame.
                    const src = isVideo
                        ? item.poster
                            ? `/api/image/${item.poster}`
                            : undefined
                        : (item.storageModeUsed || 'fs') === 'indexeddb'
                          ? getImageSrc(first.filename)
                          : `/api/image/${first.filename}`;
                    const active = item.timestamp === activeTimestamp;
                    return (
                        <li key={item.timestamp}>
                            <button
                                type='button'
                                onClick={() => onOpen(item)}
                                title={item.prompt}
                                aria-label={`Open ${isVideo ? 'video' : 'image'}: ${item.prompt || 'untitled'}`}
                                aria-current={active ? 'true' : undefined}
                                className={cn(
                                    'group bg-muted focus-visible:ring-ring relative block aspect-square w-full overflow-hidden rounded-2xl transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
                                    active
                                        ? 'ring-primary ring-offset-background ring-2 ring-offset-2'
                                        : 'hover:-translate-y-0.5 hover:shadow-lg'
                                )}>
                                {src ? (
                                    <Image
                                        src={src}
                                        alt=''
                                        width={240}
                                        height={240}
                                        className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-105'
                                        unoptimized
                                        loading={index < 8 ? 'eager' : 'lazy'}
                                    />
                                ) : isVideo ? (
                                    <video
                                        src={`${videoUrl(first.filename)}#t=0.1`}
                                        preload='metadata'
                                        muted
                                        playsInline
                                        tabIndex={-1}
                                        aria-hidden='true'
                                        className='pointer-events-none h-full w-full object-cover'
                                    />
                                ) : (
                                    <span className='text-muted-foreground flex h-full w-full items-center justify-center text-xs'>
                                        missing
                                    </span>
                                )}
                                {isVideo && (
                                    <span className='bg-background/75 text-foreground absolute right-1.5 bottom-1.5 flex h-6 w-6 items-center justify-center rounded-full backdrop-blur'>
                                        <Play className='h-3 w-3 fill-current' />
                                    </span>
                                )}
                                {!isVideo && item.images!.length > 1 && (
                                    <span className='bg-background/75 text-foreground absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] backdrop-blur'>
                                        <Layers className='h-3 w-3' />
                                        {item.images!.length}
                                    </span>
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

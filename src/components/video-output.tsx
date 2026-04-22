"use client";

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2, Download, Video } from 'lucide-react';
import * as React from 'react';

export type VideoInfo = {
    path: string;
    filename: string;
};

type VideoOutputProps = {
    videoBatch: VideoInfo[] | null;
    viewIndex: number;
    onViewChange: (index: number) => void;
    isLoading: boolean;
    elapsedSeconds?: number;
};

function formatElapsedTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function VideoOutput({ videoBatch, viewIndex, onViewChange, isLoading, elapsedSeconds = 0 }: VideoOutputProps) {
    const activeVideo = videoBatch && videoBatch[viewIndex] ? videoBatch[viewIndex] : null;

    return (
        <div className='flex h-full min-h-[300px] w-full flex-col gap-4 overflow-hidden rounded-lg border border-border bg-background p-4'>
            <div className='relative flex h-full w-full flex-grow items-center justify-center overflow-hidden'>
                {isLoading ? (
                    <div className='flex flex-col items-center justify-center gap-4 text-muted-foreground'>
                        <div className='relative'>
                            <div className='absolute inset-0 animate-ping rounded-full bg-purple-500/20' />
                            <div className='relative rounded-full bg-gradient-to-tr from-purple-500/30 to-pink-500/30 p-4'>
                                <Loader2 className='h-10 w-10 animate-spin text-purple-400' />
                            </div>
                        </div>
                        <div className='flex flex-col items-center gap-2'>
                            <p className='text-base font-medium text-foreground/90'>Rendering video...</p>
                            <div className='flex items-center gap-2 rounded-full bg-muted/30 px-4 py-2 backdrop-blur-sm'>
                                <div className='h-2 w-2 animate-pulse rounded-full bg-green-400' />
                                <span className='font-mono text-lg tabular-nums text-foreground'>
                                    {formatElapsedTime(elapsedSeconds)}
                                </span>
                            </div>
                            <p className='text-xs text-muted-foreground/70'>This may take a few minutes</p>
                        </div>
                    </div>
                ) : activeVideo ? (
                    <video
                        key={activeVideo.filename}
                        src={activeVideo.path}
                        controls
                        className='max-h-full w-full max-w-full rounded-md border border-border bg-background'
                    />
                ) : (
                    <div className='text-center text-muted-foreground/70'>
                        <p>Your generated video will appear here.</p>
                    </div>
                )}
            </div>

            {videoBatch && videoBatch.length > 1 && (
                <div className='flex flex-wrap items-center justify-center gap-2'>
                    {videoBatch.map((vid, index) => (
                        <Button
                            key={vid.filename}
                            variant='ghost'
                            size='sm'
                            className={cn(
                                'h-9 gap-1 rounded-full border border-border text-xs text-foreground/90 hover:bg-muted/60 hover:text-foreground',
                                viewIndex === index ? 'bg-muted text-foreground' : ''
                            )}
                            onClick={() => onViewChange(index)}>
                            <Video className='h-4 w-4' />
                            {index + 1}
                        </Button>
                    ))}
                </div>
            )}

            {activeVideo && (
                <div className='flex justify-end'>
                    <a
                        href={activeVideo.path}
                        download={activeVideo.filename}
                        className='inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground/90 hover:bg-muted/60 hover:text-foreground'>
                        <Download className='h-4 w-4' />
                        Download MP4
                    </a>
                </div>
            )}
        </div>
    );
}

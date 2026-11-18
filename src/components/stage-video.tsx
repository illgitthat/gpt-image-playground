'use client';

import { Volume2 } from 'lucide-react';
import * as React from 'react';

// Browsers only let a video start with sound when the play follows a tap or click. Phones are
// stricter still: the tap has to have touched that very <video> element. A finished video
// arrives many seconds after the tap that asked for it, so the page keeps one element for its
// whole life and "unlocks" it during the tap; later plays on it may then start with sound.
let sharedVideo: HTMLVideoElement | null = null;

function stageVideoElement(): HTMLVideoElement {
    if (!sharedVideo) {
        sharedVideo = document.createElement('video');
        sharedVideo.controls = true;
        sharedVideo.loop = true;
        sharedVideo.playsInline = true;
        sharedVideo.preload = 'auto';
        sharedVideo.className =
            'stage-image block h-auto max-h-[min(56vh,640px)] w-auto max-w-full rounded-3xl bg-black shadow-[0_30px_80px_-30px_rgb(0_0_0/0.55)]';
    }
    return sharedVideo;
}

// Call from a tap or click handler that leads to a video being shown.
export function unlockVideoSound(): void {
    if (typeof document === 'undefined') return;
    const video = stageVideoElement();
    try {
        // An idle element is unlocked by loading it; one on screen by (re)playing it, which
        // does not interrupt it the way loading would.
        if (video.isConnected) void video.play().catch(() => undefined);
        else video.load();
    } catch {
        // Nothing to unlock on this browser.
    }
}

type StageVideoProps = {
    src: string;
    poster: string | null;
    label: string;
    onPlaybackChange: (failed: boolean) => void;
};

export function StageVideo({ src, poster, label, onPlaybackChange }: StageVideoProps) {
    const holder = React.useRef<HTMLDivElement>(null);
    // True when the browser refused sound and the video is playing silently instead.
    const [needsTap, setNeedsTap] = React.useState(false);
    const report = React.useRef(onPlaybackChange);
    React.useEffect(() => {
        report.current = onPlaybackChange;
    });

    React.useEffect(() => {
        const video = stageVideoElement();
        const container = holder.current;
        if (!container) return;
        let cancelled = false;

        const onError = () => report.current(true);
        const onLoaded = () => report.current(false);
        const onVolume = () => {
            if (!video.muted) setNeedsTap(false);
        };
        video.addEventListener('error', onError);
        video.addEventListener('loadeddata', onLoaded);
        video.addEventListener('volumechange', onVolume);

        video.setAttribute('aria-label', label);
        if (poster) video.poster = poster;
        else video.removeAttribute('poster');
        video.muted = false;
        video.src = src;
        container.prepend(video);
        setNeedsTap(false);

        video.play().catch((error: unknown) => {
            if (cancelled) return;
            // Sound was not allowed: play silently and offer a one-tap way to turn it on.
            if (error instanceof DOMException && error.name === 'NotAllowedError') {
                video.muted = true;
                setNeedsTap(true);
                video.play().catch(() => undefined);
            }
        });

        return () => {
            cancelled = true;
            video.removeEventListener('error', onError);
            video.removeEventListener('loadeddata', onLoaded);
            video.removeEventListener('volumechange', onVolume);
            video.pause();
            video.removeAttribute('src');
            video.remove();
        };
    }, [src, poster, label]);

    return (
        <div ref={holder} className='relative max-w-full'>
            {needsTap && (
                <button
                    type='button'
                    onClick={() => {
                        const video = stageVideoElement();
                        video.muted = false;
                        void video.play().catch(() => undefined);
                        setNeedsTap(false);
                    }}
                    className='bg-background/80 text-foreground focus-visible:ring-ring absolute top-3 left-3 flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium shadow-lg backdrop-blur-md focus-visible:ring-2 focus-visible:outline-none'>
                    <Volume2 className='h-4 w-4' />
                    Tap for sound
                </button>
            )}
        </div>
    );
}

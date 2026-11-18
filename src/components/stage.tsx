'use client';

import type { ImageSize } from '@/components/composer';
import { ImageLightbox, type LightboxMedia } from '@/components/image-lightbox';
import { canShareImages, downloadImage, shareImage } from '@/lib/image-download';
import { cn } from '@/lib/utils';
import { Check, Copy, Download, Loader2, Maximize2, Pencil, RotateCcw, Share2, Trash2 } from 'lucide-react';
import Image from 'next/image';
import * as React from 'react';

export type StageImage = { path: string; filename: string };

// What is being made right now, shown while the request runs.
export type PendingGeneration = {
    prompt: string;
    size: ImageSize;
    count: number;
    // The image being changed, when this is an edit.
    baseUrl: string | null;
};

type StageProps = {
    images: StageImage[] | null;
    selectedIndex: number;
    onSelect: (index: number) => void;
    prompt: string;
    pending: PendingGeneration | null;
    completedCount: number;
    previews: Map<number, string>;
    // Whether the next prompt will change the selected image.
    isEditing: boolean;
    onEdit: () => void;
    onReusePrompt: () => void;
    onDelete: () => void;
};

// MAI returns no partial previews; typical generations take about this long.
const TYPICAL_GENERATION_SECONDS = 25;

const ASPECT: Record<ImageSize, string> = {
    '1024x1024': '1 / 1',
    auto: '1 / 1',
    '1536x1024': '3 / 2',
    '1024x1536': '2 / 3'
};

function formatElapsed(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
}

function Developing({ pending, completedCount }: { pending: PendingGeneration; completedCount: number }) {
    const [elapsed, setElapsed] = React.useState(0);
    React.useEffect(() => {
        const startedAt = Date.now();
        const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
        return () => clearInterval(timer);
    }, []);

    // Ease toward 95% so the bar never claims to be done before the image arrives.
    const progress = Math.min(95, 100 * (1 - Math.exp(-elapsed / (TYPICAL_GENERATION_SECONDS / 2))));
    const overdue = elapsed > TYPICAL_GENERATION_SECONDS * 1.6;
    const verb = pending.baseUrl
        ? 'Applying your change'
        : pending.count > 1
          ? `Making ${pending.count} images`
          : 'Making your image';
    const status = completedCount > 0 && pending.count > 1 ? `${completedCount} of ${pending.count} done` : verb;

    return (
        <div
            className='developing border-border relative mx-auto w-full overflow-hidden rounded-3xl border'
            style={{ aspectRatio: ASPECT[pending.size], maxHeight: 'min(56vh, 640px)', maxWidth: 'min(100%, 640px)' }}>
            {pending.baseUrl && (
                <Image
                    src={pending.baseUrl}
                    alt=''
                    fill
                    className='scale-110 object-cover opacity-90 blur-xl'
                    unoptimized
                />
            )}
            <div className='developing-sheen absolute inset-0' aria-hidden='true' />
            <div className='absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center'>
                <p role='status' className='text-foreground text-lg font-semibold tracking-tight'>
                    {status}
                    <span className='developing-dots' aria-hidden='true' />
                </p>
                <p className='text-foreground/75 line-clamp-3 max-w-md text-sm'>{pending.prompt}</p>
                <div className='w-full max-w-[220px] space-y-2'>
                    <div
                        className='bg-foreground/15 h-1 w-full overflow-hidden rounded-full'
                        role='progressbar'
                        aria-label='Estimated progress'
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(progress)}>
                        <div
                            className='bg-primary h-full rounded-full transition-[width] duration-1000 ease-linear'
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className='text-foreground/60 font-mono text-[11px] tabular-nums'>
                        {formatElapsed(elapsed)} ·{' '}
                        {overdue ? 'taking longer than usual' : `usually about ${TYPICAL_GENERATION_SECONDS}s`}
                    </p>
                </div>
            </div>
        </div>
    );
}

function ActionButton({
    label,
    onClick,
    disabled,
    children,
    destructive,
    compact
}: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
    destructive?: boolean;
    // Icon only; the label is still read out and shown on hover.
    compact?: boolean;
}) {
    return (
        <button
            type='button'
            onClick={onClick}
            disabled={disabled}
            title={label}
            className={cn(
                'focus-visible:ring-ring flex h-10 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50',
                destructive
                    ? 'text-muted-foreground hover:bg-destructive/15 hover:text-destructive'
                    : 'text-foreground/90 hover:bg-muted'
            )}>
            {children}
            <span className={cn(destructive && 'sr-only', compact && 'sr-only')}>{label}</span>
        </button>
    );
}

export function Stage({
    images,
    selectedIndex,
    onSelect,
    prompt,
    pending,
    completedCount,
    previews,
    isEditing,
    onEdit,
    onReusePrompt,
    onDelete
}: StageProps) {
    const [lightboxOpen, setLightboxOpen] = React.useState(false);
    const [busy, setBusy] = React.useState<'download' | 'share' | null>(null);
    const [actionError, setActionError] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState(false);
    // Detected after mount so server and client markup match.
    const [shareSupported, setShareSupported] = React.useState(false);
    React.useEffect(() => setShareSupported(canShareImages()), []);

    const current = images?.[selectedIndex] ?? images?.[0] ?? null;
    React.useEffect(() => setActionError(null), [current?.filename]);

    const lightboxMedia: LightboxMedia[] = React.useMemo(
        () => (images ?? []).map((image) => ({ url: image.path, filename: image.filename, alt: prompt })),
        [images, prompt]
    );

    if (pending) {
        const finished = Array.from(previews.entries()).sort(([a], [b]) => a - b);
        return (
            <div className='w-full space-y-3'>
                <Developing pending={pending} completedCount={completedCount} />
                {finished.length > 0 && pending.count > 1 && (
                    <div className='flex justify-center gap-2'>
                        {finished.map(([index, url]) => (
                            <Image
                                key={index}
                                src={url}
                                alt={`Finished image ${index + 1}`}
                                width={56}
                                height={56}
                                className='border-border h-14 w-14 rounded-xl border object-cover'
                                unoptimized
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    if (!current || !images) return null;

    const run = async (kind: 'download' | 'share') => {
        if (busy) return;
        setBusy(kind);
        setActionError(null);
        try {
            if (kind === 'download') await downloadImage(current.path, current.filename);
            else await shareImage(current.path, current.filename);
        } catch (error) {
            console.error(`${kind} failed:`, error);
            setActionError(error instanceof Error ? error.message : 'That did not work. Try again.');
        } finally {
            setBusy(null);
        }
    };

    const copyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(prompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch (error) {
            console.error('Copy failed:', error);
        }
    };

    return (
        <div className='stage-in flex w-full flex-col items-center gap-3'>
            <div className='relative max-w-full'>
                <button
                    type='button'
                    onClick={() => setLightboxOpen(true)}
                    aria-label='View full size'
                    className='group focus-visible:ring-ring relative block max-w-full cursor-zoom-in overflow-hidden rounded-3xl shadow-[0_30px_80px_-30px_rgb(0_0_0/0.55)] focus-visible:ring-2 focus-visible:ring-offset-4 focus-visible:outline-none'>
                    <Image
                        key={current.filename}
                        src={current.path}
                        alt={prompt || 'Generated image'}
                        width={1024}
                        height={1024}
                        className='stage-image block h-auto max-h-[min(56vh,640px)] w-auto max-w-full object-contain'
                        style={{ width: 'auto', height: 'auto' }}
                        unoptimized
                        loading='eager'
                        fetchPriority='high'
                    />
                    <span className='bg-background/70 text-foreground absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 pointer-coarse:hidden'>
                        <Maximize2 className='h-4 w-4' />
                    </span>
                </button>
                {images.length > 1 && (
                    <div
                        role='radiogroup'
                        aria-label='Choose an image'
                        className='bg-background/70 absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2 rounded-2xl p-1.5 backdrop-blur-md'>
                        {images.map((image, index) => (
                            <button
                                key={image.filename}
                                type='button'
                                role='radio'
                                aria-checked={index === selectedIndex}
                                aria-label={`Image ${index + 1}`}
                                onClick={() => onSelect(index)}
                                className={cn(
                                    'focus-visible:ring-ring overflow-hidden rounded-[10px] transition-all focus-visible:ring-2 focus-visible:outline-none',
                                    index === selectedIndex ? 'ring-primary ring-2' : 'opacity-55 hover:opacity-100'
                                )}>
                                <Image
                                    src={image.path}
                                    alt=''
                                    width={44}
                                    height={44}
                                    className='h-11 w-11 object-cover'
                                    unoptimized
                                />
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className='flex w-full max-w-[640px] flex-col items-center gap-2 sm:flex-row sm:gap-3'>
                {prompt && (
                    <p className='text-muted-foreground line-clamp-2 px-2 text-center text-sm leading-relaxed sm:line-clamp-1 sm:flex-1 sm:px-1 sm:text-left'>
                        {prompt}
                    </p>
                )}
                <div className='flex shrink-0 flex-wrap items-center justify-center gap-0.5'>
                    {!isEditing && (
                        <button
                            type='button'
                            onClick={onEdit}
                            className='bg-primary text-primary-foreground focus-visible:ring-ring flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'>
                            <Pencil className='h-4 w-4' />
                            Edit this image
                        </button>
                    )}
                    <ActionButton label='Download' onClick={() => run('download')} disabled={busy !== null}>
                        {busy === 'download' ? (
                            <Loader2 className='h-4 w-4 animate-spin' />
                        ) : (
                            <Download className='h-4 w-4' />
                        )}
                    </ActionButton>
                    {shareSupported && (
                        <ActionButton label='Share' onClick={() => run('share')} disabled={busy !== null}>
                            {busy === 'share' ? (
                                <Loader2 className='h-4 w-4 animate-spin' />
                            ) : (
                                <Share2 className='h-4 w-4' />
                            )}
                        </ActionButton>
                    )}
                    {prompt && (
                        <>
                            <ActionButton label='Reuse prompt' onClick={onReusePrompt} compact>
                                <RotateCcw className='h-4 w-4' />
                            </ActionButton>
                            <ActionButton label={copied ? 'Copied' : 'Copy prompt'} onClick={copyPrompt} compact>
                                {copied ? <Check className='h-4 w-4' /> : <Copy className='h-4 w-4' />}
                            </ActionButton>
                        </>
                    )}
                    <ActionButton label='Delete' onClick={onDelete} destructive>
                        <Trash2 className='h-4 w-4' />
                    </ActionButton>
                </div>
            </div>
            {actionError && (
                <p role='alert' className='text-destructive text-sm'>
                    {actionError}
                </p>
            )}

            <ImageLightbox
                media={lightboxMedia}
                open={lightboxOpen}
                onOpenChange={setLightboxOpen}
                initialIndex={selectedIndex}
            />
        </div>
    );
}

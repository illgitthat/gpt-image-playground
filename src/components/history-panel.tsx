'use client';

import type { HistoryMetadata } from '@/app/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose
} from '@/components/ui/dialog';
import { ImageLightbox, type LightboxMedia } from '@/components/image-lightbox';
import { GPT_IMAGE_MODELS, getModelRates, type GptImageModel } from '@/lib/cost-utils';
import { cn } from '@/lib/utils';
import {
    Copy,
    Check,
    Layers,
    DollarSign,
    ImagePlus,
    Sparkles as SparklesIcon,
    Trash2,
    RotateCcw
} from 'lucide-react';
import Image from 'next/image';
import * as React from 'react';

type HistoryPanelProps = {
    history: HistoryMetadata[];
    onSelectImage: (item: HistoryMetadata, options?: { skipModeChange?: boolean }) => void;
    onClearHistory: () => void;
    getImageSrc: (filename: string) => string | undefined;
    onDeleteItemRequest: (item: HistoryMetadata) => void;
    itemPendingDeleteConfirmation: HistoryMetadata | null;
    onConfirmDeletion: () => void;
    onCancelDeletion: () => void;
    deletePreferenceDialogValue: boolean;
    onDeletePreferenceDialogChange: (isChecked: boolean) => void;
    onReusePrompt: (prompt: string, mode: 'generate' | 'edit' | 'video') => void;
    onSendToEdit?: (filename: string) => void;
    onReuseWithReferences?: (prompt: string, referenceFilenames: string[]) => void;
};

const formatDuration = (ms: number): string => {
    if (ms < 1000) {
        return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
};

const formatUsd = (value: number): string => {
    if (!Number.isFinite(value)) {
        return 'N/A';
    }

    if (value > 0 && value < 0.01) {
        return '<$0.01';
    }

    return `$${value.toFixed(2)}`;
};

const formatUsdBadge = (value: number): string => {
    if (!Number.isFinite(value)) {
        return 'N/A';
    }

    if (value > 0 && value < 0.01) {
        return '<0.01';
    }

    return value.toFixed(2);
};

const calculateCost = (value: number, rate: number): string => {
    const cost = value * rate;
    return formatUsd(cost);
};

const getImageModelForRates = (model: HistoryMetadata['model']): GptImageModel => {
    if (model && model !== 'sora-2') {
        return model;
    }

    return 'gpt-image-1';
};

export function HistoryPanel({
    history,
    onSelectImage,
    onClearHistory,
    getImageSrc,
    onDeleteItemRequest,
    itemPendingDeleteConfirmation,
    onConfirmDeletion,
    onCancelDeletion,
    deletePreferenceDialogValue,
    onDeletePreferenceDialogChange,
    onReusePrompt,
    onSendToEdit,
    onReuseWithReferences
}: HistoryPanelProps) {
    const [openPromptDialogTimestamp, setOpenPromptDialogTimestamp] = React.useState<number | null>(null);
    const [openCostDialogTimestamp, setOpenCostDialogTimestamp] = React.useState<number | null>(null);
    const [isTotalCostDialogOpen, setIsTotalCostDialogOpen] = React.useState(false);
    const [copiedTimestamp, setCopiedTimestamp] = React.useState<number | null>(null);

    // Lightbox state
    const [lightboxOpen, setLightboxOpen] = React.useState(false);
    const [lightboxMedia, setLightboxMedia] = React.useState<LightboxMedia[]>([]);

    const openLightbox = (item: HistoryMetadata) => {
        const mediaItems = item.videos && item.videos.length > 0 ? item.videos : item.images;
        if (!mediaItems || mediaItems.length === 0) return;
        const storageMode = item.storageModeUsed || 'fs';
        const isVideo = item.mode === 'video';
        const media: LightboxMedia[] = mediaItems.map((m) => ({
            url: storageMode === 'indexeddb' ? (getImageSrc(m.filename) || '') : `/api/image/${m.filename}`,
            filename: m.filename,
            alt: item.prompt || 'Generated image',
            isVideo,
        })).filter((m) => m.url !== '');
        setLightboxMedia(media);
        setLightboxOpen(true);
    };

    const { totalCost, totalImages } = React.useMemo(() => {
        let cost = 0;
        let images = 0;
        history.forEach((item) => {
            if (item.costDetails) {
                cost += item.costDetails.estimated_cost_usd;
            }
            images += item.images?.length ?? 0;
        });

        return { totalCost: cost, totalImages: images };
    }, [history]);

    const averageCost = totalImages > 0 ? totalCost / totalImages : 0;

    const handleCopy = async (text: string | null | undefined, timestamp: number) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopiedTimestamp(timestamp);
            setTimeout(() => setCopiedTimestamp(null), 1500);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    const handleReuseHistoryPrompt = (item: HistoryMetadata) => {
        if (!item.prompt) return;

        const referenceFilenames = item.referenceImageFilenames ?? [];
        if (item.mode !== 'video' && referenceFilenames.length > 0 && onReuseWithReferences) {
            onReuseWithReferences(item.prompt, referenceFilenames);
            return;
        }

        onReusePrompt(item.prompt, item.mode);
    };

    return (
        <Card className='flex h-full w-full flex-col overflow-hidden rounded-md border border-border bg-card shadow-[0_1px_0_0_var(--border)]'>
            <CardHeader className='flex flex-row items-start justify-between gap-4 border-b border-border px-5 py-4'>
                <div className='flex items-center gap-3'>
                    <CardTitle className='font-display text-3xl font-normal leading-none tracking-tight text-foreground'>
                        History
                    </CardTitle>
                </div>
                {history.length > 0 && (
                    <Button
                        variant='ghost'
                        size='sm'
                        onClick={onClearHistory}
                        className='h-auto rounded-md px-2 py-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground'>
                        Clear
                    </Button>
                )}
            </CardHeader>
            <CardContent className='flex-grow overflow-y-auto p-4'>
                {history.length === 0 ? (
                    <div className='flex h-full items-center justify-center text-muted-foreground/70'>
                        <p>Generated images will appear here.</p>
                    </div>
                ) : (
                    <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'>
                        {[...history].map((item, itemIndex) => {
                            const mediaItems = item.videos && item.videos.length > 0 ? item.videos : item.images;
                            const firstMedia = mediaItems?.[0];
                            const mediaCount = mediaItems?.length ?? 0;
                            const isMultiImage = mediaCount > 1;
                            const itemKey = item.timestamp;
                            const originalStorageMode = item.storageModeUsed || 'fs';
                            const isAboveTheFoldThumbnail = itemIndex === 0;
                            const referenceFilenames = item.referenceImageFilenames ?? [];
                            const hasReusablePrompt = item.prompt.trim().length > 0;
                            const reuseLabel =
                                referenceFilenames.length > 0 && item.mode !== 'video' && onReuseWithReferences
                                    ? 'Reuse prompt and references'
                                    : 'Reuse prompt';

                            const isVideo = item.mode === 'video';

                            let thumbnailUrl: string | undefined;
                            if (firstMedia) {
                                if (originalStorageMode === 'indexeddb') {
                                    thumbnailUrl = getImageSrc(firstMedia.filename);
                                } else {
                                    thumbnailUrl = `/api/image/${firstMedia.filename}`;
                                }
                            }

                            return (
                                <div key={itemKey} className='flex flex-col'>
                                    <div className='group relative'>
                                        <button
                                            onClick={() => openLightbox(item)}
                                            className='relative block aspect-square w-full overflow-hidden rounded-t-md border border-border transition-all duration-150 group-hover:border-foreground/40 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-black focus:outline-none'
                                            aria-label={`View image batch from ${new Date(item.timestamp).toLocaleString()}`}>
                                            {thumbnailUrl ? (
                                                isVideo ? (
                                                    <video
                                                        src={thumbnailUrl}
                                                        muted
                                                        playsInline
                                                        loop
                                                        className='h-full w-full object-cover'
                                                    />
                                                ) : (
                                                    <Image
                                                        src={thumbnailUrl}
                                                        alt={`Preview for batch generated at ${new Date(item.timestamp).toLocaleString()}`}
                                                        width={150}
                                                        height={150}
                                                        className='h-full w-full object-cover'
                                                        unoptimized
                                                        loading={isAboveTheFoldThumbnail ? 'eager' : undefined}
                                                        fetchPriority={isAboveTheFoldThumbnail ? 'high' : undefined}
                                                    />
                                                )
                                            ) : (
                                                <div className='flex h-full w-full items-center justify-center bg-muted text-muted-foreground/80'>
                                                    ?
                                                </div>
                                            )}
                                            {item.mode === 'video' && (
                                                <div
                                                    className='pointer-events-none absolute top-1 left-1 z-10 flex items-center gap-1 rounded-full bg-foreground/70 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-background backdrop-blur-sm'>
                                                    <SparklesIcon size={12} />
                                                    Video
                                                </div>
                                            )}
                                            {isMultiImage && (
                                                <div className='pointer-events-none absolute right-1 bottom-1 z-10 flex items-center gap-1 rounded-full bg-background/70 px-1.5 py-0.5 text-[12px] text-foreground'>
                                                    <Layers size={16} />
                                                    {mediaCount}
                                                </div>
                                            )}
                                        </button>
                                        {!isVideo && firstMedia && onSendToEdit && (
                                            <button
                                                type='button'
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSelectImage(item, { skipModeChange: true });
                                                    onSendToEdit(firstMedia.filename);
                                                }}
                                                title='Use as Reference'
                                                aria-label='Use as Reference'
                                                className='absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-1.5 border-t border-primary/40 bg-primary/90 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground opacity-0 backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100 focus:opacity-100 focus:outline-none'>
                                                <ImagePlus size={11} />
                                                Reference
                                            </button>
                                        )}
                                    </div>

                                    <div className='space-y-1 rounded-b-md border border-t-0 border-border bg-background p-2 text-xs text-muted-foreground'>
                                        <p title={`Generated on: ${new Date(item.timestamp).toLocaleString()}`}>
                                            <span className='font-medium text-foreground/90'>Time:</span>{' '}
                                            {formatDuration(item.durationMs)}
                                        </p>
                                        <p>
                                            <span className='font-medium text-foreground/90'>Model:</span>{' '}
                                            {item.model || (isVideo ? 'sora-2' : 'gpt-image-1')}
                                        </p>
                                        {isVideo ? (
                                            <>
                                                <p>
                                                    <span className='font-medium text-foreground/90'>Resolution:</span>{' '}
                                                    {item.videoSize}
                                                </p>
                                                <p>
                                                    <span className='font-medium text-foreground/90'>Duration:</span>{' '}
                                                    {item.videoSeconds ? `${item.videoSeconds}s` : '—'}
                                                </p>
                                            </>
                                        ) : (
                                            <>
                                                <p>
                                                    <span className='font-medium text-foreground/90'>Quality:</span>{' '}
                                                    {item.quality}
                                                </p>
                                            </>
                                        )}
                                        {referenceFilenames.length > 0 && (
                                            <div className='mt-1.5'>
                                                <div className='flex items-center gap-2'>
                                                    <span className='text-[11px] font-medium text-foreground/90'>References:</span>
                                                </div>
                                                <div className='mt-1 flex flex-wrap gap-1'>
                                                    {referenceFilenames.map((refFilename) => {
                                                        const src = getImageSrc(refFilename);
                                                        return src ? (
                                                            <Image
                                                                key={refFilename}
                                                                src={src}
                                                                alt='Reference'
                                                                width={32}
                                                                height={32}
                                                                className='h-8 w-8 rounded border border-border object-cover'
                                                                unoptimized
                                                            />
                                                        ) : (
                                                            <div
                                                                key={refFilename}
                                                                className='flex h-8 w-8 items-center justify-center rounded border border-border bg-muted text-[9px] text-muted-foreground'>
                                                                ?
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                        <div className='mt-2 flex items-center gap-1'>
                                            <Dialog
                                                open={openPromptDialogTimestamp === itemKey}
                                                onOpenChange={(isOpen) =>
                                                    !isOpen && setOpenPromptDialogTimestamp(null)
                                                }>
                                                <DialogTrigger asChild>
                                                    <button
                                                        type='button'
                                                        className='flex-grow cursor-pointer rounded-md border border-border bg-muted/30 px-2 py-1.5 text-left text-[11px] leading-snug text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground'
                                                        onClick={() => setOpenPromptDialogTimestamp(itemKey)}
                                                        title={item.prompt || 'No prompt'}>
                                                        <span className='line-clamp-2'>{item.prompt || 'No prompt recorded.'}</span>
                                                    </button>
                                                </DialogTrigger>
                                                <DialogContent className='border-border bg-popover text-foreground sm:max-w-[625px]'>
                                                    <DialogHeader>
                                                        <DialogTitle className='text-foreground'>Prompt</DialogTitle>
                                                        <DialogDescription className='sr-only'>
                                                            The full prompt used to generate this image batch.
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <div className='max-h-[400px] overflow-y-auto rounded-md border border-border bg-muted p-3 py-4 text-sm text-foreground/90'>
                                                        {item.prompt || 'No prompt recorded.'}
                                                    </div>
                                                    <DialogFooter>
                                                        <Button
                                                            variant='outline'
                                                            size='sm'
                                                            disabled={!hasReusablePrompt}
                                                            onClick={() => {
                                                                if (hasReusablePrompt) {
                                                                    handleReuseHistoryPrompt(item);
                                                                    setOpenPromptDialogTimestamp(null);
                                                                }
                                                            }}
                                                            className='border-border text-foreground/90 hover:bg-muted hover:text-foreground'>
                                                            <RotateCcw className='mr-2 h-4 w-4' />
                                                            {reuseLabel}
                                                        </Button>
                                                        <Button
                                                            variant='outline'
                                                            size='sm'
                                                            onClick={() => handleCopy(item.prompt, itemKey)}
                                                            className='border-border text-foreground/90 hover:bg-muted hover:text-foreground'>
                                                            {copiedTimestamp === itemKey ? (
                                                                <Check className='mr-2 h-4 w-4 text-green-400' />
                                                            ) : (
                                                                <Copy className='mr-2 h-4 w-4' />
                                                            )}
                                                            {copiedTimestamp === itemKey ? 'Copied!' : 'Copy'}
                                                        </Button>
                                                        <DialogClose asChild>
                                                            <Button
                                                                type='button'
                                                                variant='secondary'
                                                                size='sm'
                                                                className='bg-muted text-foreground hover:bg-muted/80'>
                                                                Close
                                                            </Button>
                                                        </DialogClose>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        type='button'
                                                        variant='outline'
                                                        size='icon'
                                                        disabled={!hasReusablePrompt}
                                                        onClick={() => handleReuseHistoryPrompt(item)}
                                                        aria-label={reuseLabel}
                                                        className='h-6 w-6 border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-40'>
                                                        <RotateCcw size={13} />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent side='top'>{reuseLabel}</TooltipContent>
                                            </Tooltip>
                                            <Dialog
                                                open={itemPendingDeleteConfirmation?.timestamp === item.timestamp}
                                                onOpenChange={(isOpen) => {
                                                    if (!isOpen) onCancelDeletion();
                                                }}>
                                                <DialogTrigger asChild>
                                                    <Button
                                                        className='h-6 w-6 bg-destructive/70 text-foreground hover:bg-destructive/70'
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onDeleteItemRequest(item);
                                                        }}
                                                        aria-label='Delete history item'>
                                                        <Trash2 size={14} />
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent className='border-border bg-popover text-foreground sm:max-w-md'>
                                                    <DialogHeader>
                                                        <DialogTitle className='text-foreground'>
                                                            Confirm Deletion
                                                        </DialogTitle>
                                                        <DialogDescription className='pt-2 text-foreground/90'>
                                                            Are you sure you want to delete this history entry? This
                                                            will remove {mediaCount} item(s). This action cannot be
                                                            undone.
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <div className='flex items-center space-x-2 py-2'>
                                                        <Checkbox
                                                            id={`dont-ask-${item.timestamp}`}
                                                            checked={deletePreferenceDialogValue}
                                                            onCheckedChange={(checked) =>
                                                                onDeletePreferenceDialogChange(!!checked)
                                                            }
                                                            className='border-input bg-primary data-[state=checked]:border-border data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:border-input dark:!bg-primary'
                                                        />
                                                        <label
                                                            htmlFor={`dont-ask-${item.timestamp}`}
                                                            className='text-sm leading-none font-medium text-foreground/90 peer-disabled:cursor-not-allowed peer-disabled:opacity-70'>
                                                            Don&apos;t ask me again
                                                        </label>
                                                    </div>
                                                    <DialogFooter className='gap-2 sm:justify-end'>
                                                        <Button
                                                            type='button'
                                                            variant='outline'
                                                            size='sm'
                                                            onClick={onCancelDeletion}
                                                            className='border-border text-foreground/90 hover:bg-muted hover:text-foreground'>
                                                            Cancel
                                                        </Button>
                                                        <Button
                                                            type='button'
                                                            variant='destructive'
                                                            size='sm'
                                                            onClick={onConfirmDeletion}
                                                            className='bg-destructive text-white hover:bg-destructive'>
                                                            Delete
                                                        </Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Lightbox */}
                <ImageLightbox
                    media={lightboxMedia}
                    open={lightboxOpen}
                    onOpenChange={setLightboxOpen}
                />
            </CardContent>
        </Card>
    );
}

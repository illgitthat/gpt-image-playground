"use client";

import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    Film,
    ImageUp,
    Loader2,
    Lock,
    LockOpen,
    RectangleHorizontal,
    RectangleVertical,
    Sparkles,
    Trash2
} from 'lucide-react';
import NextImage from 'next/image';
import * as React from 'react';

export type VideoFormData = {
    prompt: string;
    size: '1280x720' | '720x1280';
    seconds: number;
    referenceImage: File | null;
};

type VideoFormProps = {
    onSubmit: (data: VideoFormData) => void;
    isLoading: boolean;
    currentMode: 'generate' | 'edit' | 'video';
    onModeChange: (mode: 'generate' | 'edit' | 'video') => void;
    isPasswordRequiredByBackend: boolean | null;
    clientPasswordHash: string | null;
    onOpenPasswordDialog: () => void;
    prompt: string;
    setPrompt: React.Dispatch<React.SetStateAction<string>>;
    size: VideoFormData['size'];
    setSize: React.Dispatch<React.SetStateAction<VideoFormData['size']>>;
    seconds: number[];
    setSeconds: React.Dispatch<React.SetStateAction<number[]>>;
    referenceImage: File | null;
    setReferenceImage: React.Dispatch<React.SetStateAction<File | null>>;
    referencePreviewUrl: string | null;
    setReferencePreviewUrl: React.Dispatch<React.SetStateAction<string | null>>;
    onEnhancePrompt: () => void;
    isEnhancingPrompt: boolean;
    enhanceError: string | null;
};

export function VideoForm({
    onSubmit,
    isLoading,
    currentMode,
    onModeChange,
    isPasswordRequiredByBackend,
    clientPasswordHash,
    onOpenPasswordDialog,
    prompt,
    setPrompt,
    size,
    setSize,
    seconds,
    setSeconds,
    referenceImage,
    setReferenceImage,
    referencePreviewUrl,
    setReferencePreviewUrl,
    onEnhancePrompt,
    isEnhancingPrompt,
    enhanceError,
}: VideoFormProps) {
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [referenceDims, setReferenceDims] = React.useState<{ width: number; height: number } | null>(null);
    const [userChoseSize, setUserChoseSize] = React.useState(false);
    const previousPreviewUrl = React.useRef<string | null>(null);

    const targetSize = React.useMemo(() => {
        const [w, h] = size.split('x').map((v) => parseInt(v, 10));
        return { width: w, height: h };
    }, [size]);

    const recommendedSize = React.useMemo<VideoFormData['size']>(() => {
        if (!referenceDims) return size;
        return referenceDims.width >= referenceDims.height ? '1280x720' : '720x1280';
    }, [referenceDims, size]);

    const maybeAutoSelectSize = React.useCallback(
        (dims: { width: number; height: number }) => {
            const suggested = dims.width >= dims.height ? '1280x720' : '720x1280';
            if (!userChoseSize && size !== suggested) {
                setSize(suggested);
            }
        },
        [setSize, size, userChoseSize]
    );

    const syncReferenceMetadata = React.useCallback(
        (previewUrl: string) => {
            if (typeof window === 'undefined' || !previewUrl) return;

            const img = new window.Image();
            img.onload = () => {
                const dims = { width: img.width, height: img.height };
                setReferenceDims(dims);
                maybeAutoSelectSize(dims);
            };
            img.onerror = () => setReferenceDims(null);
            img.src = previewUrl;
        },
        [maybeAutoSelectSize]
    );

    React.useEffect(() => {
        if (referencePreviewUrl) {
            if (referencePreviewUrl !== previousPreviewUrl.current) {
                previousPreviewUrl.current = referencePreviewUrl;
                setUserChoseSize(false);
                syncReferenceMetadata(referencePreviewUrl);
            }
        } else {
            previousPreviewUrl.current = null;
            setReferenceDims(null);
        }
    }, [referencePreviewUrl, syncReferenceMetadata]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setUserChoseSize(false);
        setReferenceImage(file);
        const objectUrl = URL.createObjectURL(file);
        setReferencePreviewUrl((prev) => {
            if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
            return objectUrl;
        });
    };

    const handleRemoveFile = () => {
        setReferenceImage(null);
        setReferencePreviewUrl((prev) => {
            if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
            return null;
        });
        setReferenceDims(null);
        setUserChoseSize(false);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSubmit({
            prompt,
            size,
            seconds: seconds[0],
            referenceImage
        });
    };

    return (
        <Card className='flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-background'>
            <CardHeader className='flex items-start justify-between border-b border-border pb-4'>
                <div>
                    <div className='flex items-center'>
                        <CardTitle className='py-1 text-lg font-medium text-foreground'>Image to Video</CardTitle>
                        {isPasswordRequiredByBackend && (
                            <Button
                                variant='ghost'
                                size='icon'
                                onClick={onOpenPasswordDialog}
                                className='ml-2 text-muted-foreground hover:text-foreground'
                                aria-label='Configure Password'>
                                {clientPasswordHash ? <Lock className='h-4 w-4' /> : <LockOpen className='h-4 w-4' />}
                            </Button>
                        )}
                    </div>
                    <CardDescription className='mt-1 text-muted-foreground'>
                        Generate a short video from a prompt, optionally guided by a reference image (Sora 2).
                    </CardDescription>
                </div>
                <ModeToggle currentMode={currentMode} onModeChange={onModeChange} />
            </CardHeader>
            <form onSubmit={handleSubmit} className='flex h-full flex-1 flex-col overflow-hidden'>
                <CardContent className='flex-1 space-y-5 overflow-y-auto p-4'>
                    <div className='space-y-1.5'>
                        <div className='flex items-center justify-between gap-2'>
                            <Label htmlFor='video-prompt' className='text-foreground'>
                                Prompt
                            </Label>
                            <div className='flex items-center gap-2'>
                                {enhanceError && <span className='text-xs text-destructive'>{enhanceError}</span>}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type='button'
                                            variant='ghost'
                                            size='sm'
                                            onClick={onEnhancePrompt}
                                            disabled={isLoading || isEnhancingPrompt || !prompt.trim()}
                                            className='h-8 gap-1 rounded-full border border-border bg-muted/30 px-3 text-xs text-foreground/90 hover:bg-muted/80 hover:text-foreground'>
                                            {isEnhancingPrompt ? (
                                                <Loader2 className='h-4 w-4 animate-spin' />
                                            ) : (
                                                <Sparkles className='h-4 w-4' />
                                            )}
                                            <span className='hidden sm:inline'>Auto enhance</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className='bg-background text-foreground'>
                                        Refine the video prompt with GPT-5.3 Chat.
                                    </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className='text-xs text-muted-foreground/80'>Keep it concise and clear about motion/style.</span>
                                    </TooltipTrigger>
                                    <TooltipContent className='bg-background text-foreground'>
                                        Describe the motion or changes you want in the final video.
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        </div>
                        <Textarea
                            id='video-prompt'
                            placeholder='e.g., slow pan across the scene with warm sunset lighting'
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            required
                            disabled={isLoading}
                            className='min-h-[80px] rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:ring-ring'
                        />
                        <div className='rounded-md border border-border bg-muted/30 p-3 text-xs'>
                            <p className='text-muted-foreground'>
                                <span className='font-medium text-foreground/90'>Note:</span> Sora video generation takes a while (5+ minutes for longer videos). Keep this tab open.
                            </p>
                            <p className='mt-1 text-amber-200/80'>
                                <span className='font-medium text-amber-200'>Policy:</span> Sora 2 blocks all IP and photorealistic content.
                            </p>
                        </div>
                    </div>

                    <div className='space-y-3'>
                        <Label className='block text-foreground'>Reference Image (optional)</Label>
                        <div className='flex items-center gap-3'>
                            <Button
                                type='button'
                                variant='outline'
                                className='flex-1 justify-start border-border text-foreground/90 hover:bg-muted/60 hover:text-foreground'
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isLoading}>
                                <ImageUp className='mr-2 h-4 w-4' />
                                {referenceImage ? 'Replace image' : 'Upload image (optional)'}
                            </Button>
                            {referenceImage && (
                                <Button
                                    type='button'
                                    variant='destructive'
                                    size='icon'
                                    onClick={handleRemoveFile}
                                    disabled={isLoading}
                                    className='h-10 w-10'>
                                    <Trash2 className='h-4 w-4' />
                                </Button>
                            )}
                        </div>
                        <Input
                            ref={fileInputRef}
                            type='file'
                            accept='image/png, image/jpeg, image/webp'
                            onChange={handleFileChange}
                            disabled={isLoading}
                            className='sr-only'
                        />
                        <p className='text-xs text-muted-foreground'>
                            Leave blank for prompt-only video generation, or add a reference to anchor layout/style.
                        </p>
                        {referencePreviewUrl && (
                            <div className='flex items-center gap-3 rounded-md border border-border bg-muted/30 p-2'>
                                <div className='relative h-16 w-16 overflow-hidden rounded'>
                                    <NextImage
                                        src={referencePreviewUrl}
                                        alt='Reference preview'
                                        fill
                                        className='object-cover'
                                        unoptimized
                                    />
                                </div>
                                <div className='space-y-1 text-xs text-foreground/90'>
                                    <p>Reference: {referenceDims ? `${referenceDims.width}×${referenceDims.height}` : 'Loading…'}</p>
                                    {referenceDims && (referenceDims.width !== targetSize.width || referenceDims.height !== targetSize.height) ? (
                                        <div className='space-y-1 rounded-md border border-border bg-background/40 p-2'>
                                            <p className='text-[11px] text-amber-200'>We&apos;ll auto center-crop/resize to {size} for Sora.</p>
                                            {size !== recommendedSize && (
                                                <Button
                                                    type='button'
                                                    size='sm'
                                                    variant='outline'
                                                    className='h-7 border-input text-[11px] text-foreground/90 hover:bg-muted/60'
                                                    onClick={() => setSize(recommendedSize)}>
                                                    Use suggested {recommendedSize}
                                                </Button>
                                            )}
                                        </div>
                                    ) : (
                                        <p className='text-[11px] text-green-200'>Size matches selected resolution.</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className='space-y-3'>
                        <Label className='block text-foreground'>Resolution</Label>
                        <RadioGroup
                            value={size}
                            onValueChange={(value) => {
                                setUserChoseSize(true);
                                setSize(value as VideoFormData['size']);
                            }}
                            disabled={isLoading}
                            className='flex flex-wrap gap-x-5 gap-y-3'>
                            <div className='flex items-center space-x-2'>
                                <RadioGroupItem
                                    value='1280x720'
                                    id='video-size-landscape'
                                    className='border-input text-foreground data-[state=checked]:border-foreground data-[state=checked]:text-foreground'
                                />
                                <Label htmlFor='video-size-landscape' className='flex cursor-pointer items-center gap-2 text-base text-foreground/90'>
                                    <RectangleHorizontal className='h-5 w-5 text-muted-foreground' />
                                    1280×720 (Landscape)
                                </Label>
                            </div>
                            <div className='flex items-center space-x-2'>
                                <RadioGroupItem
                                    value='720x1280'
                                    id='video-size-portrait'
                                    className='border-input text-foreground data-[state=checked]:border-foreground data-[state=checked]:text-foreground'
                                />
                                <Label htmlFor='video-size-portrait' className='flex cursor-pointer items-center gap-2 text-base text-foreground/90'>
                                    <RectangleVertical className='h-5 w-5 text-muted-foreground' />
                                    720×1280 (Portrait)
                                </Label>
                            </div>
                        </RadioGroup>
                        <p className='text-xs text-muted-foreground'>If you add a reference, we will auto center-crop/resize it to the chosen resolution.</p>
                    </div>

                    <div className='space-y-2'>
                        <Label htmlFor='video-seconds-slider' className='text-foreground'>
                            Duration: {seconds[0]}s
                        </Label>
                        <Slider
                            id='video-seconds-slider'
                            min={4}
                            max={12}
                            step={4}
                            value={seconds}
                            onValueChange={setSeconds}
                            disabled={isLoading}
                            className='mt-3 [&>button]:border-background [&>button]:bg-primary [&>button]:ring-offset-black [&>span:first-child]:h-1 [&>span:first-child>span]:bg-primary'
                        />
                        <p className='text-xs text-muted-foreground'>Sora accepts 4s, 8s, or 12s clips.</p>
                    </div>
                </CardContent>
                <CardFooter className='border-t border-border p-4'>
                    <Button
                        type='submit'
                        disabled={isLoading || !prompt}
                        className='flex w-full items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted/60 disabled:text-muted-foreground/70'>
                        {isLoading ? <Loader2 className='h-4 w-4 animate-spin' /> : <Film className='h-4 w-4' />}
                        {isLoading ? 'Rendering video...' : 'Create Video'}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}

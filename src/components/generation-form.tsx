'use client';

import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GPT_IMAGE_MODELS, type GptImageModel } from '@/lib/cost-utils';
import {
    Square,
    RectangleHorizontal,
    RectangleVertical,
    Sparkles,
    Eraser,
    FileImage,
    Tally1,
    Tally2,
    Tally3,
    Loader2,
    BrickWall,
    Lock,
    LockOpen,
    Copy,
    Check,
    ChevronDown,
    ChevronRight,
    Settings2
} from 'lucide-react';
import * as React from 'react';

export type GenerationFormData = {
    prompt: string;
    n: number;
    size: '1024x1024' | '1536x1024' | '1024x1536' | 'auto';
    quality: 'low' | 'medium' | 'high' | 'auto';
    output_format: 'png' | 'jpeg' | 'webp';
    output_compression?: number;
    background: 'transparent' | 'opaque' | 'auto';
    moderation: 'low';
    model: GptImageModel;
};

type GenerationFormProps = {
    onSubmit: (data: GenerationFormData) => void;
    isLoading: boolean;
    currentMode: 'generate' | 'edit' | 'video';
    onModeChange: (mode: 'generate' | 'edit' | 'video') => void;
    isPasswordRequiredByBackend: boolean | null;
    clientPasswordHash: string | null;
    onOpenPasswordDialog: () => void;
    model: GenerationFormData['model'];
    setModel: React.Dispatch<React.SetStateAction<GenerationFormData['model']>>;
    prompt: string;
    setPrompt: React.Dispatch<React.SetStateAction<string>>;
    n: number[];
    setN: React.Dispatch<React.SetStateAction<number[]>>;
    size: GenerationFormData['size'];
    setSize: React.Dispatch<React.SetStateAction<GenerationFormData['size']>>;
    quality: GenerationFormData['quality'];
    setQuality: React.Dispatch<React.SetStateAction<GenerationFormData['quality']>>;
    outputFormat: GenerationFormData['output_format'];
    setOutputFormat: React.Dispatch<React.SetStateAction<GenerationFormData['output_format']>>;
    compression: number[];
    setCompression: React.Dispatch<React.SetStateAction<number[]>>;
    background: GenerationFormData['background'];
    setBackground: React.Dispatch<React.SetStateAction<GenerationFormData['background']>>;
    streamingAllowed: boolean;
    onEnhancePrompt: () => void;
    isEnhancingPrompt: boolean;
    enhanceError: string | null;
};

const RadioItemWithIcon = ({
    value,
    id,
    label,
    Icon,
    disabled
}: {
    value: string;
    id: string;
    label: string;
    Icon: React.ElementType;
    disabled?: boolean;
}) => (
    <div className='flex items-center space-x-2'>
        <RadioGroupItem
            value={value}
            id={id}
            disabled={disabled}
            className='border-input text-foreground data-[state=checked]:border-foreground data-[state=checked]:text-foreground'
        />
        <Label
            htmlFor={id}
            className={`flex items-center gap-2 text-base text-foreground/90 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
            <Icon className='h-5 w-5 text-muted-foreground' />
            {label}
        </Label>
    </div>
);

export function GenerationForm({
    onSubmit,
    isLoading,
    currentMode,
    onModeChange,
    isPasswordRequiredByBackend,
    clientPasswordHash,
    onOpenPasswordDialog,
    model,
    setModel,
    prompt,
    setPrompt,
    n,
    setN,
    size,
    setSize,
    quality,
    setQuality,
    outputFormat,
    setOutputFormat,
    compression,
    setCompression,
    background,
    setBackground,
    streamingAllowed,
    onEnhancePrompt,
    isEnhancingPrompt,
    enhanceError
}: GenerationFormProps) {
    const showCompression = outputFormat === 'jpeg' || outputFormat === 'webp';
    const locksBackgroundToAuto = model === 'gpt-image-2';
    const [isCopied, setIsCopied] = React.useState(false);
    const [isAdvancedOpen, setIsAdvancedOpen] = React.useState(false);

    React.useEffect(() => {
        if (locksBackgroundToAuto && background !== 'auto') {
            setBackground('auto');
        }
    }, [background, locksBackgroundToAuto, setBackground]);

    const handleCopyPrompt = async () => {
        if (!prompt) return;
        try {
            await navigator.clipboard.writeText(prompt);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy prompt:', err);
        }
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData: GenerationFormData = {
            prompt,
            n: n[0],
            size,
            quality,
            output_format: outputFormat,
            background: locksBackgroundToAuto ? 'auto' : background,
            moderation: 'low',
            model
        };
        if (showCompression) {
            formData.output_compression = compression[0];
        }
        onSubmit(formData);
    };

    return (
        <Card className='flex w-full flex-col rounded-md border border-border bg-card shadow-[0_1px_0_0_var(--border)] lg:h-full lg:overflow-hidden'>
            <CardHeader className='flex items-start justify-between gap-4 border-b border-border px-5 pb-4 pt-5'>
                <div className='flex flex-col gap-1.5'>
                    <span className='eyebrow'>I — Compose</span>
                    <div className='flex items-center gap-2'>
                        <CardTitle className='font-display text-3xl font-normal leading-none tracking-tight text-foreground'>
                            Generate <span className='italic text-primary'>image</span>
                        </CardTitle>
                        {isPasswordRequiredByBackend && (
                            <Button
                                variant='ghost'
                                size='icon'
                                onClick={onOpenPasswordDialog}
                                className='h-7 w-7 text-muted-foreground hover:text-foreground'
                                aria-label='Configure Password'>
                                {clientPasswordHash ? <Lock className='h-3.5 w-3.5' /> : <LockOpen className='h-3.5 w-3.5' />}
                            </Button>
                        )}
                    </div>
                    <CardDescription className='text-xs text-muted-foreground'>
                        Cast a prompt; receive a picture.
                    </CardDescription>
                </div>
                <ModeToggle currentMode={currentMode} onModeChange={onModeChange} />
            </CardHeader>
            <form onSubmit={handleSubmit} className='flex flex-1 flex-col lg:h-full lg:overflow-hidden'>
                <CardContent className='flex-1 space-y-5 p-4 lg:overflow-y-auto'>
                    {/* Streaming Previews section hidden by request
                    <div className='space-y-2'>
                        <div className='flex items-center gap-2'>
                            <Label className='text-foreground'>Streaming Previews</Label>
                            <span className='text-xs text-muted-foreground'>Shows in-progress frames while your image generates (adds a small extra cost).</span>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className='h-4 w-4 cursor-help text-muted-foreground/70 hover:text-muted-foreground' />
                                </TooltipTrigger>
                                <TooltipContent className='max-w-[250px]'>
                                    Each preview image adds ~$0.003 to the cost (100 additional output tokens).
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        {!streamingAllowed && (
                            <p className='text-xs text-muted-foreground/80'>Available when generating a single image (n = 1).</p>
                        )}
                    </div>
                    */}

                    <div className='space-y-1.5'>
                        <div className='flex items-center justify-between gap-2'>
                            <Label htmlFor='prompt' className='text-foreground'>
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
                                            onClick={handleCopyPrompt}
                                            disabled={!prompt.trim()}
                                            className='h-8 w-8 rounded-full border border-border bg-muted/30 p-0 text-foreground/90 hover:bg-muted/80 hover:text-foreground'>
                                            {isCopied ? (
                                                <Check className='h-4 w-4 text-green-400' />
                                            ) : (
                                                <Copy className='h-4 w-4' />
                                            )}
                                            <span className='sr-only'>Copy prompt</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className='bg-background text-foreground'>
                                        {isCopied ? 'Copied!' : 'Copy prompt'}
                                    </TooltipContent>
                                </Tooltip>
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
                                        Refine the prompt with GPT-5.3 Chat.
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        </div>
                        <Textarea
                            id='prompt'
                            placeholder='e.g., A photorealistic cat astronaut floating in space'
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            required
                            disabled={isLoading}
                            className='min-h-[80px] rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:ring-ring'
                        />
                    </div>

                    <div className='space-y-2'>
                        <Label htmlFor='n-slider' className='text-foreground'>
                            Number of Images: {n[0]}
                        </Label>
                        <Slider
                            id='n-slider'
                            min={1}
                            max={10}
                            step={1}
                            value={n}
                            onValueChange={setN}
                            disabled={isLoading}
                            className='mt-3 [&>button]:border-background [&>button]:bg-primary [&>button]:ring-offset-black [&>span:first-child]:h-1 [&>span:first-child>span]:bg-primary'
                        />
                    </div>

                    <div className='space-y-3'>
                        <Label className='block text-foreground'>Size</Label>
                        <RadioGroup
                            value={size}
                            onValueChange={(value) => setSize(value as GenerationFormData['size'])}
                            disabled={isLoading}
                            className='flex flex-wrap gap-x-5 gap-y-3'>
                            <RadioItemWithIcon value='auto' id='size-auto' label='Auto' Icon={Sparkles} />
                            <RadioItemWithIcon value='1024x1024' id='size-square' label='Square' Icon={Square} />
                            <RadioItemWithIcon
                                value='1536x1024'
                                id='size-landscape'
                                label='Landscape'
                                Icon={RectangleHorizontal}
                            />
                            <RadioItemWithIcon
                                value='1024x1536'
                                id='size-portrait'
                                label='Portrait'
                                Icon={RectangleVertical}
                            />
                        </RadioGroup>
                    </div>

                    <div className='pt-2'>
                        <Button
                            type='button'
                            variant='ghost'
                            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                            className='flex w-full items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60'>
                            <div className='flex items-center gap-2'>
                                <Settings2 className='h-4 w-4' />
                                Advanced Settings
                                <span className='hidden rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[11px] font-normal text-muted-foreground sm:inline-flex'>
                                    {model}
                                </span>
                            </div>
                            {isAdvancedOpen ? (
                                <ChevronDown className='h-4 w-4' />
                            ) : (
                                <ChevronRight className='h-4 w-4' />
                            )}
                        </Button>
                    </div>

                    {isAdvancedOpen && (
                        <div className='animate-in fade-in slide-in-from-top-2 space-y-5 rounded-md border border-border bg-background/20 p-4 duration-200'>
                            <div className='space-y-2'>
                                <div className='flex items-center justify-between gap-3'>
                                    <Label htmlFor='model-select' className='text-foreground'>
                                        Model
                                    </Label>
                                </div>
                                <Select
                                    value={model}
                                    onValueChange={(value) => setModel(value as GenerationFormData['model'])}
                                    disabled={isLoading}>
                                    <SelectTrigger
                                        id='model-select'
                                        className='w-full rounded-md border border-border bg-background text-foreground focus:border-ring focus:ring-ring'>
                                        <SelectValue placeholder='Select model' />
                                    </SelectTrigger>
                                    <SelectContent className='border-border bg-background text-foreground'>
                                        {GPT_IMAGE_MODELS.map((modelName) => (
                                            <SelectItem key={modelName} value={modelName} className='focus:bg-muted/60'>
                                                {modelName}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className='space-y-3'>
                                <Label className='block text-foreground'>Quality</Label>
                                <RadioGroup
                                    value={quality}
                                    onValueChange={(value) => setQuality(value as GenerationFormData['quality'])}
                                    disabled={isLoading}
                                    className='flex flex-wrap gap-x-5 gap-y-3'>
                                    <RadioItemWithIcon value='auto' id='quality-auto' label='Auto' Icon={Sparkles} />
                                    <RadioItemWithIcon value='low' id='quality-low' label='Low' Icon={Tally1} />
                                    <RadioItemWithIcon
                                        value='medium'
                                        id='quality-medium'
                                        label='Medium'
                                        Icon={Tally2}
                                    />
                                    <RadioItemWithIcon value='high' id='quality-high' label='High' Icon={Tally3} />
                                </RadioGroup>
                            </div>

                            {!locksBackgroundToAuto && (
                                <div className='space-y-3'>
                                    <Label className='block text-foreground'>Background</Label>
                                    <RadioGroup
                                        value={background}
                                        onValueChange={(value) => setBackground(value as GenerationFormData['background'])}
                                        disabled={isLoading}
                                        className='flex flex-wrap gap-x-5 gap-y-3'>
                                        <RadioItemWithIcon value='auto' id='bg-auto' label='Auto' Icon={Sparkles} />
                                        <RadioItemWithIcon value='opaque' id='bg-opaque' label='Opaque' Icon={BrickWall} />
                                        <RadioItemWithIcon
                                            value='transparent'
                                            id='bg-transparent'
                                            label='Transparent'
                                            Icon={Eraser}
                                        />
                                    </RadioGroup>
                                </div>
                            )}

                            <div className='space-y-3'>
                                <Label className='block text-foreground'>Output Format</Label>
                                <RadioGroup
                                    value={outputFormat}
                                    onValueChange={(value) =>
                                        setOutputFormat(value as GenerationFormData['output_format'])
                                    }
                                    disabled={isLoading}
                                    className='flex flex-wrap gap-x-5 gap-y-3'>
                                    <RadioItemWithIcon value='png' id='format-png' label='PNG' Icon={FileImage} />
                                    <RadioItemWithIcon value='jpeg' id='format-jpeg' label='JPEG' Icon={FileImage} />
                                    <RadioItemWithIcon value='webp' id='format-webp' label='WebP' Icon={FileImage} />
                                </RadioGroup>
                            </div>

                            {showCompression && (
                                <div className='space-y-2 pt-2 transition-opacity duration-300'>
                                    <Label htmlFor='compression-slider' className='text-foreground'>
                                        Compression: {compression[0]}%
                                    </Label>
                                    <Slider
                                        id='compression-slider'
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={compression}
                                        onValueChange={setCompression}
                                        disabled={isLoading}
                                        className='mt-3 [&>button]:border-background [&>button]:bg-primary [&>button]:ring-offset-black [&>span:first-child]:h-1 [&>span:first-child>span]:bg-primary'
                                    />
                                </div>
                            )}

                        </div>
                    )}
                </CardContent>
                <CardFooter className='border-t border-border p-4'>
                    <Button
                        type='submit'
                        disabled={isLoading || !prompt}
                        className='flex w-full items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted/60 disabled:text-muted-foreground/70'>
                        {isLoading && <Loader2 className='h-4 w-4 animate-spin' />}
                        {isLoading ? 'Generating...' : 'Generate'}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}

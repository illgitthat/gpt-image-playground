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
    ShieldCheck,
    ShieldAlert,
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
    moderation: 'low' | 'auto';
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
    moderation: GenerationFormData['moderation'];
    setModeration: React.Dispatch<React.SetStateAction<GenerationFormData['moderation']>>;
    streamingAllowed: boolean;
    onEnhancePrompt: () => void;
    isEnhancingPrompt: boolean;
    enhanceError: string | null;
};

const RadioItemWithIcon = ({
    value,
    id,
    label,
    Icon
}: {
    value: string;
    id: string;
    label: string;
    Icon: React.ElementType;
}) => (
    <div className='flex items-center space-x-2'>
        <RadioGroupItem
            value={value}
            id={id}
            className='border-white/40 text-white data-[state=checked]:border-white data-[state=checked]:text-white'
        />
        <Label htmlFor={id} className='flex cursor-pointer items-center gap-2 text-base text-white/80'>
            <Icon className='h-5 w-5 text-white/60' />
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
    moderation,
    setModeration,
    streamingAllowed,
    onEnhancePrompt,
    isEnhancingPrompt,
    enhanceError
}: GenerationFormProps) {
    const showCompression = outputFormat === 'jpeg' || outputFormat === 'webp';
    const [isCopied, setIsCopied] = React.useState(false);
    const [isAdvancedOpen, setIsAdvancedOpen] = React.useState(false);

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
            background,
            moderation,
            model
        };
        if (showCompression) {
            formData.output_compression = compression[0];
        }
        onSubmit(formData);
    };

    return (
        <Card className='flex w-full flex-col rounded-lg border border-white/10 bg-black lg:h-full lg:overflow-hidden'>
            <CardHeader className='flex items-start justify-between border-b border-white/10 pb-4'>
                <div>
                    <div className='flex items-center'>
                        <CardTitle className='py-1 text-lg font-medium text-white'>Generate Image</CardTitle>
                        {isPasswordRequiredByBackend && (
                            <Button
                                variant='ghost'
                                size='icon'
                                onClick={onOpenPasswordDialog}
                                className='ml-2 text-white/60 hover:text-white'
                                aria-label='Configure Password'>
                                {clientPasswordHash ? <Lock className='h-4 w-4' /> : <LockOpen className='h-4 w-4' />}
                            </Button>
                        )}
                    </div>
                    <CardDescription className='mt-1 text-white/60'>
                        Create a new image from a text prompt.
                    </CardDescription>
                </div>
                <ModeToggle currentMode={currentMode} onModeChange={onModeChange} />
            </CardHeader>
            <form onSubmit={handleSubmit} className='flex flex-1 flex-col lg:h-full lg:overflow-hidden'>
                <CardContent className='flex-1 space-y-5 p-4 lg:overflow-y-auto'>
                    {/* Streaming Previews section hidden by request
                    <div className='space-y-2'>
                        <div className='flex items-center gap-2'>
                            <Label className='text-white'>Streaming Previews</Label>
                            <span className='text-xs text-white/60'>Shows in-progress frames while your image generates (adds a small extra cost).</span>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className='h-4 w-4 cursor-help text-white/40 hover:text-white/60' />
                                </TooltipTrigger>
                                <TooltipContent className='max-w-[250px]'>
                                    Each preview image adds ~$0.003 to the cost (100 additional output tokens).
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        {!streamingAllowed && (
                            <p className='text-xs text-white/50'>Available when generating a single image (n = 1).</p>
                        )}
                    </div>
                    */}

                    <div className='space-y-1.5'>
                        <div className='flex items-center justify-between gap-2'>
                            <Label htmlFor='prompt' className='text-white'>
                                Prompt
                            </Label>
                            <div className='flex items-center gap-2'>
                                {enhanceError && <span className='text-xs text-red-300'>{enhanceError}</span>}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type='button'
                                            variant='ghost'
                                            size='sm'
                                            onClick={handleCopyPrompt}
                                            disabled={!prompt.trim()}
                                            className='h-8 w-8 rounded-full border border-white/15 bg-white/5 p-0 text-white/80 hover:bg-white/15 hover:text-white'>
                                            {isCopied ? (
                                                <Check className='h-4 w-4 text-green-400' />
                                            ) : (
                                                <Copy className='h-4 w-4' />
                                            )}
                                            <span className='sr-only'>Copy prompt</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className='bg-black text-white'>
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
                                            className='h-8 gap-1 rounded-full border border-white/15 bg-white/5 px-3 text-xs text-white/80 hover:bg-white/15 hover:text-white'>
                                            {isEnhancingPrompt ? (
                                                <Loader2 className='h-4 w-4 animate-spin' />
                                            ) : (
                                                <Sparkles className='h-4 w-4' />
                                            )}
                                            <span className='hidden sm:inline'>Auto enhance</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className='bg-black text-white'>
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
                            className='min-h-[80px] rounded-md border border-white/20 bg-black text-white placeholder:text-white/40 focus:border-white/50 focus:ring-white/50'
                        />
                    </div>

                    <div className='space-y-2'>
                        <Label htmlFor='n-slider' className='text-white'>
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
                            className='mt-3 [&>button]:border-black [&>button]:bg-white [&>button]:ring-offset-black [&>span:first-child]:h-1 [&>span:first-child>span]:bg-white'
                        />
                    </div>

                    <div className='space-y-3'>
                        <Label className='block text-white'>Size</Label>
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
                            className='flex w-full items-center justify-between rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10'>
                            <div className='flex items-center gap-2'>
                                <Settings2 className='h-4 w-4' />
                                Advanced Settings
                                <span className='hidden rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-normal text-white/60 sm:inline-flex'>
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
                        <div className='animate-in fade-in slide-in-from-top-2 space-y-5 rounded-md border border-white/10 bg-black/20 p-4 duration-200'>
                            <div className='space-y-2'>
                                <div className='flex items-center justify-between gap-3'>
                                    <Label htmlFor='model-select' className='text-white'>
                                        Model
                                    </Label>
                                    <span className='text-xs text-white/50'>
                                        Used for generation and cost tracking.
                                    </span>
                                </div>
                                <Select
                                    value={model}
                                    onValueChange={(value) => setModel(value as GenerationFormData['model'])}
                                    disabled={isLoading}>
                                    <SelectTrigger
                                        id='model-select'
                                        className='w-full rounded-md border border-white/20 bg-black text-white focus:border-white/50 focus:ring-white/50'>
                                        <SelectValue placeholder='Select model' />
                                    </SelectTrigger>
                                    <SelectContent className='border-white/20 bg-black text-white'>
                                        {GPT_IMAGE_MODELS.map((modelName) => (
                                            <SelectItem key={modelName} value={modelName} className='focus:bg-white/10'>
                                                {modelName}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className='space-y-3'>
                                <Label className='block text-white'>Quality</Label>
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

                            <div className='space-y-3'>
                                <Label className='block text-white'>Background</Label>
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

                            <div className='space-y-3'>
                                <Label className='block text-white'>Output Format</Label>
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
                                    <Label htmlFor='compression-slider' className='text-white'>
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
                                        className='mt-3 [&>button]:border-black [&>button]:bg-white [&>button]:ring-offset-black [&>span:first-child]:h-1 [&>span:first-child>span]:bg-white'
                                    />
                                </div>
                            )}

                            <div className='space-y-3'>
                                <Label className='block text-white'>Moderation Level</Label>
                                <RadioGroup
                                    value={moderation}
                                    onValueChange={(value) => setModeration(value as GenerationFormData['moderation'])}
                                    disabled={isLoading}
                                    className='flex flex-wrap gap-x-5 gap-y-3'>
                                    <RadioItemWithIcon value='auto' id='mod-auto' label='Auto' Icon={ShieldCheck} />
                                    <RadioItemWithIcon value='low' id='mod-low' label='Low' Icon={ShieldAlert} />
                                </RadioGroup>
                            </div>
                        </div>
                    )}
                </CardContent>
                <CardFooter className='border-t border-white/10 p-4'>
                    <Button
                        type='submit'
                        disabled={isLoading || !prompt}
                        className='flex w-full items-center justify-center gap-2 rounded-md bg-white text-black hover:bg-white/90 disabled:bg-white/10 disabled:text-white/40'>
                        {isLoading && <Loader2 className='h-4 w-4 animate-spin' />}
                        {isLoading ? 'Generating...' : 'Generate'}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}

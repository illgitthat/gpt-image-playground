'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type ModeToggleProps = {
    currentMode: 'generate' | 'edit' | 'video';
    onModeChange: (mode: 'generate' | 'edit' | 'video') => void;
};

export function ModeToggle({ currentMode, onModeChange }: ModeToggleProps) {
    return (
        <Tabs value={currentMode} onValueChange={(value) => onModeChange(value as ModeToggleProps['currentMode'])} className='w-auto'>
            <TabsList className='grid h-auto grid-cols-2 gap-1 rounded-md border-none bg-transparent p-0'>
                <TabsTrigger
                    value='generate'
                    className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                        currentMode === 'generate'
                            ? 'border-foreground bg-primary text-primary-foreground'
                            : 'border-dashed border-input bg-transparent text-muted-foreground hover:border-foreground/50 hover:text-foreground/90'
                    } `}>
                    Generate
                </TabsTrigger>
                <TabsTrigger
                    value='edit'
                    className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                        currentMode === 'edit'
                            ? 'border-foreground bg-primary text-primary-foreground'
                            : 'border-dashed border-input bg-transparent text-muted-foreground hover:border-foreground/50 hover:text-foreground/90'
                    } `}>
                    Edit
                </TabsTrigger>
                {/* Video tab hidden - feature temporarily disabled
                <TabsTrigger
                    value='video'
                    className={`rounded-md border px-3 py-1 text-sm transition-colors ${currentMode === 'video'
                            ? 'border-foreground bg-primary text-primary-foreground'
                            : 'border-dashed border-input bg-transparent text-muted-foreground hover:border-foreground/50 hover:text-foreground/90'
                        } `}>
                    Video
                </TabsTrigger>
                */}
            </TabsList>
        </Tabs>
    );
}

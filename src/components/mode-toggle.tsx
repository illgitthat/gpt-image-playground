'use client';

import * as React from 'react';

type ModeToggleProps = {
    currentMode: 'generate' | 'video';
    onModeChange: (mode: 'generate' | 'video') => void;
};

export function ModeToggle({ currentMode, onModeChange }: ModeToggleProps) {
    // With edit mode merged into generate, just show "Generate" as a static title.
    // The toggle structure is preserved for when video mode is re-enabled.
    return (
        <div role='group' aria-label='Mode' className='flex items-baseline gap-3'>
            <span
                className='font-display text-3xl font-normal leading-none tracking-tight text-foreground'>
                Generate
            </span>
        </div>
    );
}

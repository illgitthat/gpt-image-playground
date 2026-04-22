'use client';

import * as React from 'react';

type ModeToggleProps = {
    currentMode: 'generate' | 'edit' | 'video';
    onModeChange: (mode: 'generate' | 'edit' | 'video') => void;
};

export function ModeToggle({ currentMode, onModeChange }: ModeToggleProps) {
    const modes: Array<{ value: 'generate' | 'edit'; label: string }> = [
        { value: 'generate', label: 'Generate' },
        { value: 'edit', label: 'Edit' }
    ];

    return (
        <div role='tablist' aria-label='Mode' className='flex items-baseline gap-3'>
            {modes.map(({ value, label }, i) => {
                const active = currentMode === value;
                return (
                    <React.Fragment key={value}>
                        {i > 0 && (
                            <span aria-hidden className='font-display text-3xl leading-none text-border'>
                                /
                            </span>
                        )}
                        <button
                            type='button'
                            role='tab'
                            aria-selected={active}
                            onClick={() => onModeChange(value)}
                            className={`group relative cursor-pointer font-display text-3xl font-normal leading-none tracking-tight transition-colors focus-visible:outline-none ${
                                active
                                    ? 'text-foreground'
                                    : 'text-muted-foreground/50 hover:text-foreground'
                            }`}>
                            {label}
                            <span
                                aria-hidden
                                className={`pointer-events-none absolute -bottom-1.5 left-0 h-[2px] bg-primary transition-all duration-300 ${
                                    active ? 'w-full' : 'w-0 group-hover:w-full'
                                }`}
                            />
                        </button>
                    </React.Fragment>
                );
            })}
        </div>
    );
}

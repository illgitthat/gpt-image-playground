'use client';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    const isDark = mounted ? theme !== 'light' : true;
    const Icon = isDark ? Sun : Moon;
    const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type='button'
                    variant='outline'
                    size='icon'
                    onClick={() => setTheme(isDark ? 'light' : 'dark')}
                    aria-label={label}
                    className='border-border bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground'>
                    <Icon className='h-4 w-4' />
                </Button>
            </TooltipTrigger>
            <TooltipContent side='bottom'>{label}</TooltipContent>
        </Tooltip>
    );
}

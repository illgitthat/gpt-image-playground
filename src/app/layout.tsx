import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import type { Metadata } from 'next';
import { Geist, JetBrains_Mono, Instrument_Serif } from 'next/font/google';

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin']
});

const jetbrainsMono = JetBrains_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin']
});

const instrumentSerif = Instrument_Serif({
    variable: '--font-display',
    subsets: ['latin'],
    weight: '400',
    style: ['normal', 'italic']
});

export const metadata: Metadata = {
    title: 'GPT Image Playground',
    description: "Generate and edit images using OpenAI's GPT Image models.",
    icons: {
        icon: '/favicon.svg'
    }
};

export default function RootLayout({
    children
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang='en' suppressHydrationWarning>
            <body
                className={`${geistSans.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} antialiased`}>
                <div className='pointer-events-none fixed inset-0 z-[-1] bg-grain opacity-[0.04] mix-blend-overlay' />
                <div className='pointer-events-none fixed inset-0 z-[-2] bg-radial-vignette' />
                <ThemeProvider attribute='class' defaultTheme='dark' enableSystem={false} disableTransitionOnChange>
                    {children}
                </ThemeProvider>
            </body>
        </html>
    );
}

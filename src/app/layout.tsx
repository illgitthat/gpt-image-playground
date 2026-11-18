import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import type { Metadata } from 'next';
import { Geist, JetBrains_Mono } from 'next/font/google';

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin']
});

const jetbrainsMono = JetBrains_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin']
});

export const metadata: Metadata = {
    title: 'MAI Image Playground',
    description: 'Generate and edit images with MAI Image 2.7.',
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
                className={`${geistSans.variable} ${jetbrainsMono.variable} antialiased`}>
                <div className='pointer-events-none fixed inset-0 z-[-1] bg-grain opacity-[0.04] mix-blend-overlay' />
                <div className='pointer-events-none fixed inset-0 z-[-2] bg-radial-vignette' />
                <ThemeProvider attribute='class' defaultTheme='dark' enableSystem={false} disableTransitionOnChange>
                    {children}
                </ThemeProvider>
            </body>
        </html>
    );
}

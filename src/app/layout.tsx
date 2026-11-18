import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import type { Metadata, Viewport } from 'next';
import { Geist, JetBrains_Mono } from 'next/font/google';

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin']
});

const jetbrainsMono = JetBrains_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin']
});

const description = 'Make images and short videos from a sentence, then keep changing them.';
// Set SITE_URL (e.g. https://images.example.com) so link previews can point at the preview image.
const siteUrl = process.env.SITE_URL?.trim();

export const metadata: Metadata = {
    title: 'MAI Image Playground',
    description,
    ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
    manifest: '/manifest.webmanifest',
    icons: {
        icon: '/favicon.svg',
        apple: '/apple-touch-icon.png'
    },
    appleWebApp: { capable: true, title: 'MAI Image' },
    openGraph: {
        title: 'MAI Image Playground',
        description,
        type: 'website',
        ...(siteUrl ? { images: [{ url: '/og.jpg', width: 1200, height: 630 }] } : {})
    },
    twitter: { card: siteUrl ? 'summary_large_image' : 'summary', title: 'MAI Image Playground', description }
};

// The app opens in its dark theme.
export const viewport: Viewport = { themeColor: '#0d0e0a' };

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

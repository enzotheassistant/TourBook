import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';
import { AppContextProvider } from '@/components/providers/app-context-provider';
import { PwaProvider } from '@/components/pwa-provider';
import { authLinkRedirectScript } from '@/lib/auth/link-routing';

// Geist for the whole app, loaded by Next.js itself (no flash while it loads).
const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans', display: 'swap' });

const appName = 'TourBook';
const appDescription = 'Touring crew dashboard for bands on the road.';

export const metadata: Metadata = {
  applicationName: appName,
  title: {
    default: appName,
    template: `%s · ${appName}`,
  },
  description: appDescription,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: appName,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: '/apple-icon',
    icon: [
      { url: '/icon', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#07090d',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={geist.variable}>
      <head>
        {/* Runs before the app: a password reset link always opens "Set a new
            password", even if the email sent it to another page. */}
        <script dangerouslySetInnerHTML={{ __html: authLinkRedirectScript() }} />
      </head>
      <body>
        <PwaProvider />
        <AppContextProvider>{children}</AppContextProvider>
      </body>
    </html>
  );
}

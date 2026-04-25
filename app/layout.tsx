import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AppContextProvider } from '@/components/providers/app-context-provider';
import { PwaProvider } from '@/components/pwa-provider';

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
    <html lang="en">
      <body>
        <PwaProvider />
        <AppContextProvider>{children}</AppContextProvider>
      </body>
    </html>
  );
}

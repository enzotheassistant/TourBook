import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AppContextProvider } from '@/components/providers/app-context-provider';

export const metadata: Metadata = {
  title: 'TourBook',
  description: 'Touring crew dashboard for bands on the road.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body><AppContextProvider>{children}</AppContextProvider></body>
    </html>
  );
}

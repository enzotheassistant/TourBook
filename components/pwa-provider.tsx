'use client';

import { useEffect } from 'react';

export function PwaProvider() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((error) => {
        if (isLocalhost) {
          console.warn('TourBook service worker registration failed.', error);
        }
      });
  }, []);

  return null;
}

'use client';

import { useMemo } from 'react';
import { useOnlineStatus } from '@/lib/connectivity';

function formatRelativeUpdate(savedAt: string) {
  const savedAtMs = new Date(savedAt).getTime();
  if (!Number.isFinite(savedAtMs)) return null;

  const diffMs = Date.now() - savedAtMs;
  if (diffMs < 0) return 'just now';

  const minutes = Math.round(diffMs / (1000 * 60));
  if (minutes <= 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function OfflineStatus({
  savedAt,
  source,
  emptyOfflineMessage,
}: {
  savedAt?: string | null;
  source?: 'live' | 'cache';
  emptyOfflineMessage?: string | null;
}) {
  const isOnline = useOnlineStatus();
  const relativeUpdate = useMemo(() => (savedAt ? formatRelativeUpdate(savedAt) : null), [savedAt]);

  if (!isOnline && emptyOfflineMessage) {
    return (
      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        {emptyOfflineMessage}
      </div>
    );
  }

  if (isOnline && source !== 'cache' && !savedAt) return null;

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${isOnline ? 'border-white/10 bg-white/[0.04] text-zinc-300' : 'border-amber-400/20 bg-amber-500/10 text-amber-100'}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium text-current">
          {!isOnline ? 'Offline mode' : source === 'cache' ? 'Showing saved data' : 'Ready for weak signal'}
        </span>
        {relativeUpdate ? <span className="text-xs opacity-80">Last updated {relativeUpdate}</span> : null}
      </div>
    </div>
  );
}

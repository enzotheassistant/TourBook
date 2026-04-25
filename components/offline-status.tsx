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

function formatAbsoluteUpdate(savedAt: string) {
  const date = new Date(savedAt);
  if (!Number.isFinite(date.getTime())) return null;

  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getStatusTone(isOnline: boolean, source?: 'live' | 'cache') {
  if (!isOnline) {
    return {
      wrap: 'border-amber-400/20 bg-linear-to-br from-amber-500/14 to-amber-500/7 text-amber-50',
      pill: 'border-amber-300/20 bg-amber-300/12 text-amber-100',
      dot: 'bg-amber-300',
      meta: 'text-amber-100/75',
    };
  }

  if (source === 'cache') {
    return {
      wrap: 'border-sky-400/20 bg-linear-to-br from-sky-500/10 to-white/[0.03] text-zinc-100',
      pill: 'border-sky-300/20 bg-sky-300/10 text-sky-100',
      dot: 'bg-sky-300',
      meta: 'text-zinc-400',
    };
  }

  return {
    wrap: 'border-white/10 bg-linear-to-br from-white/[0.06] to-white/[0.03] text-zinc-100',
    pill: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100',
    dot: 'bg-emerald-300',
    meta: 'text-zinc-400',
  };
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
  const absoluteUpdate = useMemo(() => (savedAt ? formatAbsoluteUpdate(savedAt) : null), [savedAt]);

  if (!isOnline && emptyOfflineMessage) {
    return (
      <div className="rounded-[24px] border border-amber-400/20 bg-linear-to-br from-amber-500/14 to-amber-500/7 px-4 py-4 text-sm text-amber-50 shadow-[0_18px_44px_rgba(245,158,11,0.08)]">
        <div className="flex items-start gap-3">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-300" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium">Offline right now</p>
            <p className="leading-6 text-amber-100/82">{emptyOfflineMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  if (isOnline && source !== 'cache' && !savedAt) return null;

  const tone = getStatusTone(isOnline, source);
  const headline = !isOnline ? 'Offline mode' : source === 'cache' ? 'Showing saved itinerary' : 'Synced for the road';
  const body = !isOnline
    ? 'TourBook will keep using what is already saved on this device until you reconnect.'
    : source === 'cache'
      ? 'This screen is using the latest saved copy from this device while the live data catches up.'
      : 'Your latest itinerary is saved on this device for weak-signal moments.';

  return (
    <div className={`rounded-[24px] border px-4 py-4 shadow-[0_18px_44px_rgba(0,0,0,0.16)] ${tone.wrap}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${tone.pill}`}>
              <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
              {headline}
            </span>
            {relativeUpdate ? <span className={`text-xs ${tone.meta}`}>Updated {relativeUpdate}</span> : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-current/86">{body}</p>
        </div>

        {absoluteUpdate ? (
          <div className="shrink-0 rounded-2xl border border-white/10 bg-black/15 px-3 py-2 text-left sm:text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Last saved</p>
            <p className="mt-1 text-sm font-medium text-zinc-100">{absoluteUpdate}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

'use client';

import { useOnlineStatus } from '@/lib/connectivity';

function getStatusTone(isOnline: boolean, source?: 'live' | 'cache') {
  if (!isOnline) {
    return {
      wrap: 'border-amber-400/20 bg-linear-to-br from-amber-500/14 to-amber-500/7 text-amber-50',
      pill: 'border-amber-300/20 bg-amber-300/12 text-amber-100',
      dot: 'bg-amber-300',
      meta: 'text-amber-100/75',
    };
  }

  return {
    wrap: 'border-sky-400/20 bg-linear-to-br from-sky-500/10 to-white/[0.03] text-zinc-100',
    pill: 'border-sky-300/20 bg-sky-300/10 text-sky-100',
    dot: 'bg-sky-300',
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

  if (isOnline && source !== 'cache') return null;

  const tone = getStatusTone(isOnline, source);
  const headline = !isOnline ? 'Offline' : 'Saved copy';

  return (
    <div className={`rounded-[24px] border px-4 py-3 shadow-[0_18px_44px_rgba(0,0,0,0.16)] ${tone.wrap}`}>
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${tone.pill}`}>
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
          {headline}
        </span>
        {!isOnline && savedAt ? <span className={`text-[11px] ${tone.meta}`}>Saved on this device</span> : null}
      </div>
    </div>
  );
}

/**
 * Placeholder boxes shown while a screen loads, so there's never a blank
 * screen. Same look as the Existing Dates tab's original placeholders: soft
 * pulsing boxes. No hooks or browser APIs, so these work in server components
 * (e.g. as a Suspense fallback) as well as client components.
 */

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse border border-white/10 bg-white/[0.03] ${className}`} />;
}

/** A soft bar standing in for a line of text. */
export function SkeletonLine({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-full bg-white/[0.06] ${className}`} />;
}

/** Stack of card placeholders, e.g. a list of dates. */
export function ListSkeleton({ rows = 3, rowClassName = 'h-24 rounded-[28px]', label = 'Loading' }: { rows?: number; rowClassName?: string; label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonBlock key={index} className={rowClassName} />
      ))}
    </div>
  );
}

/** Placeholder for the whole app frame (header + list) while sign-in is being checked. */
export function AppShellSkeleton({ mode = 'crew' }: { mode?: 'crew' | 'admin' }) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-zinc-950 text-zinc-50" role="status" aria-label="Loading">
      <div className={`mx-auto flex w-full max-w-5xl flex-col px-4 sm:px-6 ${mode === 'admin' ? 'pt-3' : 'pt-[max(calc(env(safe-area-inset-top)+0.35rem),1.25rem)] sm:pt-4'}`}>
        {mode === 'crew' ? (
          <>
            <div className="flex min-h-11 items-center justify-between gap-3 pb-3 sm:pb-4">
              <SkeletonLine className="h-7 w-44 sm:h-8" />
              <SkeletonBlock className="h-10 w-10 rounded-full" />
            </div>
            <div className="border-t border-white/10" />
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 pb-3">
              <div className="space-y-3">
                <SkeletonLine className="h-8 w-36" />
                <SkeletonLine className="h-4 w-24" />
              </div>
              <SkeletonBlock className="h-10 w-10 rounded-full" />
            </div>
            <div className="flex gap-2 py-2">
              <SkeletonBlock className="h-10 w-24 rounded-full" />
              <SkeletonBlock className="h-10 w-32 rounded-full" />
              <SkeletonBlock className="h-10 w-20 rounded-full" />
            </div>
          </>
        )}
      </div>
      <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6">
        <ListSkeleton />
      </div>
    </div>
  );
}

/** Placeholder for a day sheet: header, the Day Sheet / Guest List switch, and a few sections. */
export function DaySheetSkeleton() {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-zinc-950 text-zinc-50" role="status" aria-label="Loading day sheet">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pb-4 pt-[max(calc(env(safe-area-inset-top)+0.75rem),1rem)] sm:px-6 sm:pt-6">
        <div className="flex items-start gap-3">
          <SkeletonBlock className="h-11 w-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2 pt-1">
            <SkeletonLine className="h-6 w-40" />
            <SkeletonLine className="h-4 w-56 max-w-full" />
            <SkeletonLine className="h-3 w-20" />
          </div>
        </div>
        <SkeletonBlock className="h-[60px] rounded-[28px]" />
        <SkeletonBlock className="h-28 rounded-[28px]" />
        <SkeletonBlock className="h-44 rounded-[28px]" />
        <SkeletonBlock className="h-24 rounded-[28px]" />
      </div>
    </div>
  );
}

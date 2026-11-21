/** The one "…" (more actions) icon used on every menu button in the app. */
export function MoreIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <circle cx="4.5" cy="10" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="15.5" cy="10" r="1.6" />
    </svg>
  );
}

/**
 * The one arrow for sections that fold open and shut. Points right when
 * closed and smoothly turns to point down when open.
 */
export function ChevronIcon({ open = false, className = 'h-5 w-5' }: { open?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={`${className} shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? 'rotate-90' : 'rotate-0'}`}
    >
      <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

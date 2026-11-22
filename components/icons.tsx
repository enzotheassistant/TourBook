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

/** The one "+" icon (used before labels like "New date" and "Add line"). Follow it with a small gap. */
export function PlusIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={`${className} shrink-0`}>
      <path d="M10 4.5V15.5M4.5 10H15.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/** Open eye: "crew can see this". */
export function EyeIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`${className} shrink-0`}>
      <path d="M2.5 12C4.4 7.8 7.9 5.5 12 5.5C16.1 5.5 19.6 7.8 21.5 12C19.6 16.2 16.1 18.5 12 18.5C7.9 18.5 4.4 16.2 2.5 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** Crossed-out eye: "hidden from crew". */
export function EyeOffIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`${className} shrink-0`}>
      <path d="M9.9 5.8C10.6 5.6 11.3 5.5 12 5.5C16.1 5.5 19.6 7.8 21.5 12C20.9 13.3 20.2 14.4 19.3 15.4M14.1 14.2C13.6 14.7 12.8 15 12 15C10.3 15 9 13.7 9 12C9 11.2 9.3 10.4 9.8 9.9M6.6 7.1C4.9 8.3 3.5 9.9 2.5 12C4.4 16.2 7.9 18.5 12 18.5C13.8 18.5 15.5 18 17 17.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 3.5L20.5 20.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Dates tab. */
export function CalendarIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`${className} shrink-0`}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 9.5H20.5M8 3V6.5M16 3V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Team tab. */
export function UsersIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`${className} shrink-0`}>
      <circle cx="9" cy="8.5" r="3.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 19.5C3.6 16.4 6 14.5 9 14.5C12 14.5 14.4 16.4 15 19.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15.5 5.6C16.9 5.9 18 7.1 18 8.6C18 10.1 16.9 11.3 15.5 11.6M17.5 14.8C19.4 15.4 20.6 17.1 21 19.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Settings tab. */
export function SettingsIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`${className} shrink-0`}>
      <path d="M4 7H13M17 7H20M4 17H7M11 17H20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="15" cy="7" r="2.25" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9" cy="17" r="2.25" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

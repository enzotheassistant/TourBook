'use client';

import { ReactNode, RefObject, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type PickerOption = { value: string; label: string };

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4 shrink-0">
      <path d="M4.5 10.5L8 14L15.5 6.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Small "▾" shown next to a tappable heading. */
export function DropdownCaret({ open = false }: { open?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
      <path d="M5.5 8L10 12.5L14.5 8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const DESKTOP_QUERY = '(min-width: 640px)';

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return isDesktop;
}

/**
 * A list of choices with a checkmark on the current one. Phones get a bottom
 * sheet; desktop gets a dropdown anchored under the button that opened it.
 */
function PickerMenu({
  open,
  onClose,
  title,
  options,
  selected,
  onSelect,
  anchorRef,
  menuId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  options: PickerOption[];
  selected: string | null;
  onSelect: (value: string) => void;
  anchorRef: RefObject<HTMLElement | null>;
  menuId: string;
}) {
  const isDesktop = useIsDesktop();
  const [anchorRect, setAnchorRect] = useState<{ top: number; left: number } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function measure() {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 300;
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      setAnchorRect({ top: rect.bottom + 8, left });
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    document.addEventListener('keydown', handleKeyDown);

    // Phones: stop the page scrolling underneath the sheet.
    const previousOverflow = document.body.style.overflow;
    if (!isDesktop) document.body.style.overflow = 'hidden';

    // Move focus into the list so keyboard and screen-reader users land on the choices.
    const focusTimer = window.setTimeout(() => {
      const current = listRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? listRef.current?.querySelector<HTMLButtonElement>('button');
      current?.focus({ preventScroll: true });
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose, anchorRef, isDesktop]);

  if (!open) return null;

  const list = (
    <div ref={listRef} role="radiogroup" aria-label={title} className="flex flex-col gap-1">
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(option.value)}
            className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition focus:outline-none focus-visible:bg-white/[0.08] ${active ? 'text-zinc-50' : 'text-zinc-300 hover:bg-white/[0.05] hover:text-zinc-100'}`}
          >
            <span className="min-w-0 truncate">{option.label}</span>
            {active ? <span className="text-sky-300"><CheckIcon /></span> : null}
          </button>
        );
      })}
    </div>
  );

  const content = isDesktop ? (
    <div className="fixed inset-0 z-50" id={menuId}>
      <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        role="dialog"
        aria-label={title}
        className="absolute w-[300px] max-h-[60vh] overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-zinc-950 p-1.5 shadow-2xl shadow-black/60"
        style={anchorRect ? { top: anchorRect.top, left: anchorRect.left } : { visibility: 'hidden' }}
      >
        {list}
      </div>
    </div>
  ) : (
    <div className="fixed inset-0 z-50" id={menuId} role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 bg-black/60" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[82svh] flex-col rounded-t-3xl border border-white/10 bg-zinc-950 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/20" aria-hidden="true" />
        <p className="mb-2 px-3 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">{title}</p>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{list}</div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

/**
 * A heading that opens a PickerMenu when tapped, e.g. "Texas King ▾" or
 * "Upcoming dates ▾". `children` is the visible heading text.
 */
export function PickerHeading({
  children,
  title,
  options,
  selected,
  onSelect,
  className = '',
  trailing,
}: {
  children: ReactNode;
  /** Name of the list, used for the sheet header and screen readers ("Switch project"). */
  title: string;
  options: PickerOption[];
  selected: string | null;
  onSelect: (value: string) => void;
  className?: string;
  /** Extra content after the caret, e.g. a count badge. Not part of the button. */
  trailing?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="group -mx-1.5 inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-xl px-1.5 text-left transition hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
      >
        {/* Text styling goes on the span, not the button: globals.css sets
            `button { font: inherit }` outside Tailwind's layers, which would
            override text-size/weight classes placed on the button itself. */}
        <span className={`min-w-0 truncate ${className}`}>{children}</span>
        <DropdownCaret open={open} />
      </button>
      {trailing}
      <PickerMenu
        open={open}
        onClose={close}
        title={title}
        options={options}
        selected={selected}
        onSelect={(value) => {
          setOpen(false);
          onSelect(value);
        }}
        anchorRef={buttonRef}
        menuId={menuId}
      />
    </>
  );
}

'use client';

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-6 w-6">
      <path d="M12 16V4M12 4L7 9M12 4L17 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}


/**
 * Shared look for every "drop files here" box (Attachments, AI Import), so
 * they match: dashed border, upload icon, "Drag files here, or" and an
 * outlined button. Each caller keeps its own file input and drag handlers.
 */
export function uploadDropzoneClassName(dragActive: boolean) {
  return `flex flex-col items-center justify-center gap-2 rounded-[24px] border border-dashed px-4 py-8 text-center transition ${dragActive ? 'border-sky-400/60 bg-sky-500/[0.06]' : 'border-white/15 bg-black/20'}`;
}

export function UploadDropzoneContent({
  onChoose,
  buttonLabel = 'Choose files',
  busy = false,
  busyLabel = 'Uploading…',
  helperText,
}: {
  onChoose: () => void;
  buttonLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  /** Small grey line under the button (e.g. the size limit). Omit for none. */
  helperText?: string;
}) {
  return (
    <>
      <div className="text-zinc-400"><UploadIcon /></div>
      <p className="text-sm text-zinc-200">Drag files here, or</p>
      <button
        type="button"
        onClick={onChoose}
        disabled={busy}
        className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:border-white/25 hover:bg-white/[0.05] disabled:opacity-60"
      >
        {busy ? busyLabel : buttonLabel}
      </button>
      {helperText ? <p className="text-xs text-zinc-500">{helperText}</p> : null}
    </>
  );
}

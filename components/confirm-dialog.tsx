'use client';

export function ConfirmDialog({
  open,
  title = 'Confirm action',
  description,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 px-4 pb-6 pt-12 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="w-full max-w-md overflow-hidden rounded-[32px] border border-white/10 bg-[#171117] shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
        <div className="border-b border-white/5 px-6 py-5">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-50">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-300">{description}</p>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-5">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-5 text-sm font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.06]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-medium transition ${tone === 'danger' ? 'bg-red-500/90 text-white hover:bg-red-400' : 'bg-indigo-500 text-zinc-950 hover:bg-indigo-400'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

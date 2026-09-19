'use client';

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { deleteAttachment, getAttachmentDownloadHref, listAttachments, uploadAttachment } from '@/lib/data-client';
import { useAppContext } from '@/hooks/use-app-context';
import { canCreateDates, getWorkspaceRole } from '@/lib/roles';
import type { DateAttachment } from '@/lib/types/date-record';

export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'image/*',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
].join(',');

export function formatFileSize(bytes: number) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatUploadedAt(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

export function isImageAttachment(attachment: DateAttachment) {
  return attachment.content_type.startsWith('image/');
}

export function fileExtensionLabel(attachment: DateAttachment) {
  const parts = attachment.file_name.split('.');
  if (parts.length < 2) return 'FILE';
  return parts[parts.length - 1].slice(0, 4).toUpperCase();
}

export function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-6 w-6">
      <path d="M12 16V4M12 4L7 9M12 4L17 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-6 w-6 text-zinc-400">
      <path d="M6 3H13L18 8V19C18 20.1046 17.1046 21 16 21H6C4.89543 21 4 20.1046 4 19V5C4 3.89543 4.89543 3 6 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M13 3V8H18" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M4 7H20M9 7V5C9 4.44772 9.44772 4 10 4H14C14.5523 4 15 4.44772 15 5V7M18 7L17.3 19.0501C17.2508 19.8992 16.5477 20.5626 15.6971 20.5626H8.30294C7.45227 20.5626 6.74918 19.8992 6.7 19.0501L6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AttachmentsManager({ dateId, onCountChange }: { dateId: string; onCountChange?: (count: number) => void }) {
  const { activeWorkspaceId, isLoading, memberships } = useAppContext();
  const [attachments, setAttachments] = useState<DateAttachment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const workspaceRole = useMemo(() => getWorkspaceRole(memberships, activeWorkspaceId), [memberships, activeWorkspaceId]);
  const canManage = canCreateDates(workspaceRole);

  useEffect(() => {
    onCountChange?.(attachments.length);
  }, [attachments, onCountChange]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (isLoading || !activeWorkspaceId) return;
      try {
        const nextAttachments = await listAttachments(dateId, { workspaceId: activeWorkspaceId });
        if (!active) return;
        setAttachments(nextAttachments);
        setError('');
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load attachments.');
      } finally {
        if (active) setLoaded(true);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [dateId, activeWorkspaceId, isLoading]);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length || !canManage) return;
    setError('');

    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        setError(`"${file.name}" is too large. The limit is 25 MB.`);
        continue;
      }
      setUploading(true);
      try {
        const attachment = await uploadAttachment(dateId, file, { workspaceId: activeWorkspaceId });
        setAttachments((current) => [...current, attachment]);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Unable to upload "${file.name}".`);
      } finally {
        setUploading(false);
      }
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFiles(event.target.files);
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    void handleFiles(event.dataTransfer.files);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    const attachmentId = pendingDeleteId;
    setPendingDeleteId(null);
    try {
      await deleteAttachment(attachmentId, { workspaceId: activeWorkspaceId });
      setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove attachment.');
    }
  }

  const sortedAttachments = useMemo(
    () => [...attachments].sort((a, b) => a.file_name.localeCompare(b.file_name)),
    [attachments],
  );

  return (
    <div className="space-y-5">
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete attachment?"
        description="This file will be removed for everyone on this date."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />

      {canManage ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`flex flex-col items-center justify-center gap-2 rounded-[24px] border border-dashed px-4 py-8 text-center transition ${dragActive ? 'border-sky-400/60 bg-sky-500/[0.06]' : 'border-white/15 bg-black/20'}`}
        >
          <div className="text-zinc-400"><UploadIcon /></div>
          <p className="text-sm text-zinc-200">Drag files here, or</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex h-10 items-center justify-center rounded-full bg-sky-500 px-4 text-sm font-medium text-zinc-950 disabled:opacity-60"
          >
            {uploading ? 'Uploading…' : 'Choose files'}
          </button>
          <p className="text-xs text-zinc-500">PDFs, images, and docs up to 25 MB.</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_FILE_TYPES}
            onChange={handleInputChange}
            className="hidden"
          />
        </div>
      ) : null}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {!loaded ? (
        <p className="text-sm text-zinc-400">Loading attachments…</p>
      ) : sortedAttachments.length === 0 ? (
        <p className="text-sm text-zinc-400">No attachments yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {sortedAttachments.map((attachment) => (
            <div key={attachment.id} className="group relative flex flex-col overflow-hidden rounded-[20px] border border-white/10 bg-black/20">
              <a
                href={getAttachmentDownloadHref(attachment.id, { workspaceId: activeWorkspaceId })}
                target="_blank"
                rel="noreferrer"
                className="flex aspect-square items-center justify-center overflow-hidden bg-white/[0.03]"
              >
                {isImageAttachment(attachment) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getAttachmentDownloadHref(attachment.id, { workspaceId: activeWorkspaceId }, 'thumbnail')}
                    alt={attachment.file_name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <FileIcon />
                    <span className="text-[10px] font-semibold tracking-wide text-zinc-500">{fileExtensionLabel(attachment)}</span>
                  </div>
                )}
              </a>
              <div className="flex items-start justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-zinc-100" title={attachment.file_name}>{attachment.file_name}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">{formatFileSize(attachment.file_size)} · {formatUploadedAt(attachment.created_at)}</p>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(attachment.id)}
                    aria-label={`Delete ${attachment.file_name}`}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.06] hover:text-red-300"
                  >
                    <TrashIcon />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

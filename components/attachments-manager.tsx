'use client';

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AttachmentViewer } from '@/components/attachment-viewer';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { deleteAttachment, getAttachmentDownloadHref, listAttachments, renameAttachment, uploadAttachment } from '@/lib/data-client';
import { attachmentDisplayName, compareAttachmentsByName, stripFileExtension } from '@/lib/attachments/display-name';
import { useAppContext } from '@/hooks/use-app-context';
import { UploadDropzoneContent, uploadDropzoneClassName } from '@/components/upload-dropzone';
import { canCreateDates, getWorkspaceRole } from '@/lib/roles';
import type { DateAttachment } from '@/lib/types/date-record';
import { SkeletonBlock } from '@/components/skeleton';

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

/**
 * Only show a picture tile when a preview thumbnail exists. Images the browser
 * couldn't preview (e.g. a HEIC photo uploaded from Chrome) fall back to a
 * file tile instead of a broken image.
 */
export function hasPreviewThumbnail(attachment: DateAttachment) {
  return attachment.has_thumbnail;
}

export function fileExtensionLabel(attachment: DateAttachment) {
  const parts = attachment.file_name.split('.');
  if (parts.length < 2) return 'FILE';
  return parts[parts.length - 1].slice(0, 4).toUpperCase();
}

export function FileIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`${className} text-zinc-400`}>
      <path d="M6 3H13L18 8V19C18 20.1046 17.1046 21 16 21H6C4.89543 21 4 20.1046 4 19V5C4 3.89543 4.89543 3 6 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M13 3V8H18" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M12 20H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16.5 3.5C17.3284 2.67157 18.6716 2.67157 19.5 3.5C20.3284 4.32843 20.3284 5.67157 19.5 6.5L8 18L4 19L5 15L16.5 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Square placeholder for files without a picture preview: a file icon plus the type (PDF, DOCX…). */
export function FileTypeTile({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-white/[0.03]">
      <FileIcon className="h-9 w-9" />
      <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-400">{label}</span>
    </div>
  );
}

/**
 * The square preview part of an attachment tile. Shows the thumbnail (photos,
 * and PDFs uploaded since PDF previews were added) or a file-type tile. If a
 * thumbnail fails to load it falls back to the file-type tile, so there's never
 * a broken image box.
 */
export function AttachmentTilePreview({ attachment, workspaceId }: { attachment: DateAttachment; workspaceId: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!hasPreviewThumbnail(attachment) || failed) return <FileTypeTile label={fileExtensionLabel(attachment)} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={getAttachmentDownloadHref(attachment.id, { workspaceId }, 'thumbnail')}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`h-full w-full object-cover ${attachment.content_type === 'application/pdf' ? 'object-top bg-white' : ''}`}
    />
  );
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M4 7H20M9 7V5C9 4.44772 9.44772 4 10 4H14C14.5523 4 15 4.44772 15 5V7M18 7L17.3 19.0501C17.2508 19.8992 16.5477 20.5626 15.6971 20.5626H8.30294C7.45227 20.5626 6.74918 19.8992 6.7 19.0501L6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ManagedAttachmentTile({
  attachment,
  workspaceId,
  canManage,
  onOpen,
  onDelete,
  onRenamed,
}: {
  attachment: DateAttachment;
  workspaceId: string | null;
  canManage: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onRenamed: (attachment: DateAttachment) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState('');
  const name = attachmentDisplayName(attachment);

  function startEditing() {
    setDraftName(attachment.display_name ?? '');
    setRenameError('');
    setEditing(true);
  }

  async function saveName() {
    if (saving) return;
    const next = draftName.trim();
    if (next === (attachment.display_name ?? '')) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setRenameError('');
    try {
      const updated = await renameAttachment(attachment.id, next, { workspaceId });
      onRenamed(updated);
      setEditing(false);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Unable to rename.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-[20px] border border-white/10 bg-black/20">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${name}`}
        className="flex aspect-square items-center justify-center overflow-hidden bg-white/[0.03]"
      >
        <AttachmentTilePreview attachment={attachment} workspaceId={workspaceId} />
      </button>
      {editing ? (
        <form
          className="space-y-2 px-3 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            void saveName();
          }}
        >
          <label className="sr-only" htmlFor={`attachment-name-${attachment.id}`}>Display name</label>
          <input
            id={`attachment-name-${attachment.id}`}
            autoFocus
            value={draftName}
            maxLength={120}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditing(false);
            }}
            placeholder={stripFileExtension(attachment.file_name)}
            className="h-10 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-accent/50"
          />
          <p className="text-[11px] text-zinc-500">Leave empty to use the file name.</p>
          {renameError ? <p className="text-[11px] text-red-300">{renameError}</p> : null}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="inline-flex h-9 flex-1 items-center justify-center rounded-full bg-accent px-3 text-xs font-medium text-zinc-950 disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="inline-flex h-9 flex-1 items-center justify-center rounded-full border border-white/10 px-3 text-xs font-medium text-zinc-200">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-1 py-2 pl-3 pr-1">
          <div className="min-w-0 py-1">
            <p className="truncate text-xs font-medium text-zinc-100" title={name}>{name}</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">{formatFileSize(attachment.file_size)} · {formatUploadedAt(attachment.created_at)}</p>
          </div>
          {canManage ? (
            <div className="flex shrink-0">
              <button
                type="button"
                onClick={startEditing}
                aria-label={`Rename ${name}`}
                className="inline-flex h-11 w-9 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
              >
                <PencilIcon />
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label={`Delete ${name}`}
                className="inline-flex h-11 w-9 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.06] hover:text-red-300"
              >
                <TrashIcon />
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
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
  const [openAttachment, setOpenAttachment] = useState<DateAttachment | null>(null);
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
    () => [...attachments].sort(compareAttachmentsByName),
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
          className={uploadDropzoneClassName(dragActive)}
        >
          <UploadDropzoneContent
            onChoose={() => fileInputRef.current?.click()}
            busy={uploading}
            helperText="PDFs, images, and docs up to 25 MB."
          />
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

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      {openAttachment ? (
        <AttachmentViewer
          key={openAttachment.id}
          attachment={openAttachment}
          workspaceId={activeWorkspaceId}
          canDownload={canManage}
          onClose={() => setOpenAttachment(null)}
        />
      ) : null}

      {!loaded ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="status" aria-label="Loading attachments">
          <SkeletonBlock className="aspect-square rounded-[20px]" />
          <SkeletonBlock className="aspect-square rounded-[20px]" />
        </div>
      ) : sortedAttachments.length === 0 ? (
        <p className="text-sm text-zinc-400">No attachments yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {sortedAttachments.map((attachment) => (
            <ManagedAttachmentTile
              key={attachment.id}
              attachment={attachment}
              workspaceId={activeWorkspaceId}
              canManage={canManage}
              onOpen={() => setOpenAttachment(attachment)}
              onDelete={() => setPendingDeleteId(attachment.id)}
              onRenamed={(updated) => setAttachments((current) => current.map((item) => (item.id === updated.id ? updated : item)))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

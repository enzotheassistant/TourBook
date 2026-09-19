'use client';

import { useEffect, useState } from 'react';
import { FileIcon, fileExtensionLabel, formatFileSize, formatUploadedAt, isImageAttachment } from '@/components/attachments-manager';
import { SectionCard } from '@/components/section-card';
import { getAttachmentDownloadHref, listAttachments } from '@/lib/data-client';
import { useAppContext } from '@/hooks/use-app-context';
import type { DateAttachment } from '@/lib/types/date-record';

/**
 * Read-only attachments display for the day sheet. Uploading/deleting lives
 * in the admin create/edit date form (see AttachmentsManager there) — this
 * component only ever fetches and displays, for both crew and admin viewers.
 * Renders nothing when the date has no attachments.
 */
export function AttachmentsSection({ dateId }: { dateId: string }) {
  const { activeWorkspaceId, isLoading } = useAppContext();
  const [attachments, setAttachments] = useState<DateAttachment[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      if (isLoading || !activeWorkspaceId) return;
      try {
        const nextAttachments = await listAttachments(dateId, { workspaceId: activeWorkspaceId });
        if (!active) return;
        setAttachments(nextAttachments);
      } catch {
        // Attachments are supplementary to the day sheet — fail silently rather
        // than blocking or cluttering a page that otherwise loaded fine.
      } finally {
        if (active) setLoaded(true);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [dateId, activeWorkspaceId, isLoading]);

  if (!loaded || attachments.length === 0) return null;

  const sortedAttachments = [...attachments].sort((a, b) => a.file_name.localeCompare(b.file_name));

  return (
    <SectionCard title="Attachments">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {sortedAttachments.map((attachment) => (
          <a
            key={attachment.id}
            href={getAttachmentDownloadHref(attachment.id, { workspaceId: activeWorkspaceId })}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col overflow-hidden rounded-[20px] border border-white/10 bg-black/20"
          >
            <div className="flex aspect-square items-center justify-center overflow-hidden bg-white/[0.03]">
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
            </div>
            <div className="px-3 py-2">
              <p className="truncate text-xs font-medium text-zinc-100" title={attachment.file_name}>{attachment.file_name}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">{formatFileSize(attachment.file_size)} · {formatUploadedAt(attachment.created_at)}</p>
            </div>
          </a>
        ))}
      </div>
    </SectionCard>
  );
}

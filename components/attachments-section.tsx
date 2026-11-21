'use client';

import { useEffect, useMemo, useState } from 'react';
import { AttachmentViewer } from '@/components/attachment-viewer';
import { FileIcon, fileExtensionLabel, hasPreviewThumbnail } from '@/components/attachments-manager';
import { SectionCard } from '@/components/section-card';
import { getAttachmentDownloadHref, listAttachments } from '@/lib/data-client';
import { canCreateDates, getWorkspaceRole } from '@/lib/roles';
import { useAppContext } from '@/hooks/use-app-context';
import type { DateAttachment } from '@/lib/types/date-record';

/**
 * Read-only attachments display for the day sheet. Uploading/deleting lives
 * in the admin create/edit date form (see AttachmentsManager there) — this
 * component only ever fetches and displays, for both crew and admin viewers.
 * Renders nothing when the date has no attachments.
 */
export function AttachmentsSection({ dateId, adminMode = false }: { dateId: string; adminMode?: boolean }) {
  const { activeWorkspaceId, isLoading, memberships } = useAppContext();
  const [attachments, setAttachments] = useState<DateAttachment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openAttachment, setOpenAttachment] = useState<DateAttachment | null>(null);
  // Download is an admin tool: only shown on the admin day sheet, and only to
  // admins/editors. Crew View never shows it, even to an admin previewing it.
  const canDownload = useMemo(
    () => adminMode && canCreateDates(getWorkspaceRole(memberships, activeWorkspaceId)),
    [adminMode, memberships, activeWorkspaceId],
  );

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
          <button
            type="button"
            key={attachment.id}
            onClick={() => setOpenAttachment(attachment)}
            className="flex flex-col overflow-hidden rounded-[20px] border border-white/10 bg-black/20 text-left"
          >
            <div className="flex aspect-square items-center justify-center overflow-hidden bg-white/[0.03]">
              {hasPreviewThumbnail(attachment) ? (
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
            </div>
          </button>
        ))}
      </div>
      {openAttachment ? (
        <AttachmentViewer
          key={openAttachment.id}
          attachment={openAttachment}
          workspaceId={activeWorkspaceId}
          canDownload={canDownload}
          onClose={() => setOpenAttachment(null)}
        />
      ) : null}
    </SectionCard>
  );
}

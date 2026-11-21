import type { DateAttachment } from '@/lib/types/date-record';

/** "Menu.pdf" → "Menu". Names without an extension (or only one, like ".env") are kept as is. */
export function stripFileExtension(fileName: string) {
  const stripped = fileName.replace(/\.(?=[^./\\\s]*[a-z])[^./\\\s]{1,8}$/i, '');
  return stripped.trim() || fileName;
}

/** What crew and admins see for a file: the custom name if one was given, otherwise the file name without its extension. */
export function attachmentDisplayName(attachment: Pick<DateAttachment, 'display_name' | 'file_name'>) {
  return attachment.display_name?.trim() || stripFileExtension(attachment.file_name);
}

export function compareAttachmentsByName(a: Pick<DateAttachment, 'display_name' | 'file_name'>, b: Pick<DateAttachment, 'display_name' | 'file_name'>) {
  return attachmentDisplayName(a).localeCompare(attachmentDisplayName(b), undefined, { numeric: true, sensitivity: 'base' });
}

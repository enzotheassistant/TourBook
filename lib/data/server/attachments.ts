import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { ApiError, isMissingRelationError, requireScopedDataClient, requireWorkspaceAccess } from '@/lib/data/server/shared';
import { GUEST_LIST_WRITE_ROLES } from '@/lib/data/server/authorization';
import { getDateScoped } from '@/lib/data/server/dates';
import type { DateAttachment } from '@/lib/types/date-record';

export const ATTACHMENTS_BUCKET = 'date-attachments';
export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB, matches the bucket's file_size_limit

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);

type AttachmentRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  date_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  file_name: string;
  display_name: string | null;
  content_type: string;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
};

const ATTACHMENT_ROW_COLUMNS = 'id, workspace_id, project_id, date_id, storage_path, thumbnail_path, file_name, display_name, content_type, file_size, uploaded_by, created_at';

function normalizeAttachment(row: AttachmentRow): DateAttachment {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    project_id: String(row.project_id),
    date_id: String(row.date_id),
    file_name: String(row.file_name ?? ''),
    display_name: row.display_name ? String(row.display_name) : null,
    content_type: String(row.content_type ?? 'application/octet-stream'),
    file_size: Number(row.file_size ?? 0),
    uploaded_by: row.uploaded_by ? String(row.uploaded_by) : null,
    created_at: String(row.created_at ?? ''),
    has_thumbnail: Boolean(row.thumbnail_path),
  };
}

function sanitizeFileName(rawName: string) {
  const trimmed = rawName.trim().slice(-180) || 'file';
  const cleaned = trimmed.replace(/[/\\]/g, '_').replace(/[^a-zA-Z0-9._ -]/g, '_');
  return cleaned || 'file';
}

export const MAX_DISPLAY_NAME_LENGTH = 120; // matches the date_attachments_display_name_length check

/** Optional custom name: trimmed, capped, and empty means "no custom name". */
function normalizeDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_DISPLAY_NAME_LENGTH).trim();
  return cleaned || null;
}

async function requireAttachmentWriteAccess(supabase: SupabaseClient, userId: string, workspaceId: string) {
  await requireWorkspaceAccess(supabase, userId, workspaceId, [...GUEST_LIST_WRITE_ROLES]);
}

export async function listAttachmentsScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  workspaceId: string,
  dateId: string,
): Promise<DateAttachment[]> {
  const supabase = requireScopedDataClient(supabaseInput);
  await getDateScoped(supabase, userId, workspaceId, dateId);

  const { data, error } = await supabase
    .from('date_attachments')
    .select(ATTACHMENT_ROW_COLUMNS)
    .eq('workspace_id', workspaceId)
    .eq('date_id', dateId)
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new ApiError(500, error.message);
  }

  return (data ?? []).map(normalizeAttachment);
}

type AttachmentUploadInput = {
  fileName: unknown;
  contentType: unknown;
  fileSize: unknown;
};

function validateAttachmentInput(input: AttachmentUploadInput) {
  const contentType = typeof input.contentType === 'string' && input.contentType ? input.contentType : 'application/octet-stream';
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new ApiError(415, 'That file type is not supported. Upload a PDF, image, or document.');
  }
  const fileSize = Number(input.fileSize);
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw new ApiError(400, 'The uploaded file is empty.');
  }
  if (fileSize > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new ApiError(413, 'That file is too large. The limit is 25 MB.');
  }
  const fileName = sanitizeFileName(typeof input.fileName === 'string' ? input.fileName : 'file');
  return { contentType, fileSize, fileName };
}

// Paths are always rebuilt on the server from the attachment id + sanitized
// name, never taken from the browser, so a client can't point a record at a
// file outside its own workspace/date folder.
function buildStoragePaths(workspaceId: string, dateId: string, attachmentId: string, fileName: string) {
  const folder = `${workspaceId}/${dateId}`;
  return {
    folder,
    objectName: `${attachmentId}-${fileName}`,
    storagePath: `${folder}/${attachmentId}-${fileName}`,
    thumbnailFolder: `${folder}/thumbnails`,
    thumbnailName: `${attachmentId}.jpg`,
    thumbnailPath: `${folder}/thumbnails/${attachmentId}.jpg`,
  };
}

async function findStoredObject(supabase: SupabaseClient, folder: string, objectName: string) {
  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).list(folder, { search: objectName, limit: 10 });
  if (error) return null;
  return (data ?? []).find((entry) => entry.name === objectName) ?? null;
}

/**
 * Step 1 of an upload: check permissions and the file's details, then hand
 * back one-time signed upload slots so the browser can send the file (and its
 * thumbnail) straight to Storage — bypassing Vercel's ~4.5 MB request limit.
 */
export async function createAttachmentUploadTicketScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  workspaceId: string,
  dateId: string,
  input: AttachmentUploadInput & { withThumbnail?: unknown },
) {
  const supabase = requireScopedDataClient(supabaseInput);
  await requireAttachmentWriteAccess(supabase, userId, workspaceId);
  await getDateScoped(supabase, userId, workspaceId, dateId);

  const { fileName } = validateAttachmentInput(input);
  const attachmentId = randomUUID();
  const paths = buildStoragePaths(workspaceId, dateId, attachmentId, fileName);
  const bucket = supabase.storage.from(ATTACHMENTS_BUCKET);

  const { data: upload, error: uploadError } = await bucket.createSignedUploadUrl(paths.storagePath);
  if (uploadError || !upload?.token) {
    throw new ApiError(500, uploadError?.message || 'Unable to prepare the upload.');
  }

  let thumbnailToken: string | null = null;
  if (input.withThumbnail === true) {
    const { data: thumbnailUpload } = await bucket.createSignedUploadUrl(paths.thumbnailPath);
    thumbnailToken = thumbnailUpload?.token ?? null; // Non-fatal: the file just won't get a thumbnail.
  }

  return {
    bucket: ATTACHMENTS_BUCKET,
    attachmentId,
    path: paths.storagePath,
    token: upload.token,
    thumbnailPath: thumbnailToken ? paths.thumbnailPath : null,
    thumbnailToken,
  };
}

/**
 * Step 3 of an upload (after the browser has sent the file to Storage):
 * confirm the file really landed, then record it. Size and type are taken
 * from what Storage actually received where available.
 */
export async function finalizeAttachmentUploadScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  workspaceId: string,
  dateId: string,
  input: AttachmentUploadInput & { attachmentId: unknown; thumbnailUploaded?: unknown; displayName?: unknown },
): Promise<DateAttachment> {
  const supabase = requireScopedDataClient(supabaseInput);
  await requireAttachmentWriteAccess(supabase, userId, workspaceId);
  const dateRecord = await getDateScoped(supabase, userId, workspaceId, dateId);

  const attachmentId = typeof input.attachmentId === 'string' ? input.attachmentId : '';
  if (!UUID_PATTERN.test(attachmentId)) {
    throw new ApiError(400, 'Invalid upload reference.');
  }

  const validated = validateAttachmentInput(input);
  const paths = buildStoragePaths(workspaceId, dateId, attachmentId, validated.fileName);

  const stored = await findStoredObject(supabase, paths.folder, paths.objectName);
  if (!stored) {
    throw new ApiError(400, 'The upload did not finish. Please try again.');
  }

  const metadata = (stored.metadata ?? {}) as { size?: number; mimetype?: string };
  const storedSize = Number(metadata.size);
  const fileSize = Number.isFinite(storedSize) && storedSize > 0 ? storedSize : validated.fileSize;
  const contentType = metadata.mimetype && ALLOWED_CONTENT_TYPES.has(metadata.mimetype) ? metadata.mimetype : validated.contentType;

  let thumbnailPath: string | null = null;
  if (input.thumbnailUploaded === true && (await findStoredObject(supabase, paths.thumbnailFolder, paths.thumbnailName))) {
    thumbnailPath = paths.thumbnailPath;
  }

  const { data, error } = await supabase
    .from('date_attachments')
    .insert({
      workspace_id: workspaceId,
      project_id: dateRecord.project_id,
      date_id: dateId,
      storage_path: paths.storagePath,
      thumbnail_path: thumbnailPath,
      file_name: validated.fileName,
      display_name: normalizeDisplayName(input.displayName),
      content_type: contentType,
      file_size: fileSize,
      uploaded_by: userId,
    })
    .select(ATTACHMENT_ROW_COLUMNS)
    .single();

  if (error || !data) {
    // Clean up the uploaded files so nothing is left orphaned in Storage.
    const orphaned = [paths.storagePath, ...(thumbnailPath ? [thumbnailPath] : [])];
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove(orphaned);
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Attachments schema is not ready yet.');
    }
    throw new ApiError(500, error?.message ?? 'Unable to save the attachment.');
  }

  return normalizeAttachment(data);
}

async function getAttachmentRowScoped(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string,
  attachmentId: string,
): Promise<AttachmentRow> {
  const { data, error } = await supabase
    .from('date_attachments')
    .select(ATTACHMENT_ROW_COLUMNS)
    .eq('id', attachmentId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Attachments schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }

  if (!data) {
    throw new ApiError(404, 'Attachment not found.');
  }

  await getDateScoped(supabase, userId, workspaceId, String(data.date_id));
  return data as AttachmentRow;
}

/** Sets (or clears, when empty) an attachment's custom display name. */
export async function renameAttachmentScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  workspaceId: string,
  attachmentId: string,
  displayName: unknown,
): Promise<DateAttachment> {
  const supabase = requireScopedDataClient(supabaseInput);
  await requireAttachmentWriteAccess(supabase, userId, workspaceId);
  await getAttachmentRowScoped(supabase, userId, workspaceId, attachmentId);

  const { data, error } = await supabase
    .from('date_attachments')
    .update({ display_name: normalizeDisplayName(displayName) })
    .eq('id', attachmentId)
    .eq('workspace_id', workspaceId)
    .select(ATTACHMENT_ROW_COLUMNS)
    .single();

  if (error || !data) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Attachments schema is not ready yet.');
    }
    throw new ApiError(500, error?.message ?? 'Unable to rename the attachment.');
  }

  return normalizeAttachment(data);
}

export async function deleteAttachmentScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  workspaceId: string,
  attachmentId: string,
) {
  const supabase = requireScopedDataClient(supabaseInput);
  await requireAttachmentWriteAccess(supabase, userId, workspaceId);
  const row = await getAttachmentRowScoped(supabase, userId, workspaceId, attachmentId);

  // Remove the files before the record: Storage only lets you delete a file
  // you're allowed to read, and read access is tied to this record existing.
  const toRemove = [row.storage_path, ...(row.thumbnail_path ? [row.thumbnail_path] : [])];
  const { error: storageError } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove(toRemove);
  if (storageError) {
    throw new ApiError(500, storageError.message || 'Unable to remove the file.');
  }

  const { error } = await supabase.from('date_attachments').delete().eq('id', attachmentId).eq('workspace_id', workspaceId);
  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Attachments schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }
}

export async function getAttachmentDownloadUrlScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  workspaceId: string,
  attachmentId: string,
  variant: 'original' | 'thumbnail' = 'original',
  disposition: 'download' | 'inline' = 'download',
): Promise<{ url: string; fileName: string; contentType: string }> {
  const supabase = requireScopedDataClient(supabaseInput);
  const row = await getAttachmentRowScoped(supabase, userId, workspaceId, attachmentId);

  const useThumbnail = variant === 'thumbnail' && Boolean(row.thumbnail_path);
  const path = useThumbnail ? (row.thumbnail_path as string) : row.storage_path;

  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    // 'inline' leaves off the download label so phones show the file instead
    // of asking "view or download?" — used by the in-app viewer.
    .createSignedUrl(path, 300, useThumbnail || disposition === 'inline' ? undefined : { download: row.file_name });

  if (error || !data?.signedUrl) {
    throw new ApiError(500, error?.message ?? 'Unable to generate a download link.');
  }

  return { url: data.signedUrl, fileName: row.file_name, contentType: row.content_type };
}

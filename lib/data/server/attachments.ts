import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { ApiError, isMissingRelationError, requireScopedDataClient, requireWorkspaceAccess } from '@/lib/data/server/shared';
import { GUEST_LIST_WRITE_ROLES } from '@/lib/data/server/authorization';
import { getDateScoped } from '@/lib/data/server/dates';
import type { DateAttachment } from '@/lib/types/date-record';

export const ATTACHMENTS_BUCKET = 'date-attachments';
export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB, matches the bucket's file_size_limit

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
  file_name: string;
  content_type: string;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
};

function normalizeAttachment(row: AttachmentRow): DateAttachment {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    project_id: String(row.project_id),
    date_id: String(row.date_id),
    file_name: String(row.file_name ?? ''),
    content_type: String(row.content_type ?? 'application/octet-stream'),
    file_size: Number(row.file_size ?? 0),
    uploaded_by: row.uploaded_by ? String(row.uploaded_by) : null,
    created_at: String(row.created_at ?? ''),
  };
}

function sanitizeFileName(rawName: string) {
  const trimmed = rawName.trim().slice(-180) || 'file';
  const cleaned = trimmed.replace(/[/\\]/g, '_').replace(/[^a-zA-Z0-9._ -]/g, '_');
  return cleaned || 'file';
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
    .select('id, workspace_id, project_id, date_id, storage_path, file_name, content_type, file_size, uploaded_by, created_at')
    .eq('workspace_id', workspaceId)
    .eq('date_id', dateId)
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new ApiError(500, error.message);
  }

  return (data ?? []).map(normalizeAttachment);
}

export async function uploadAttachmentScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  workspaceId: string,
  dateId: string,
  file: { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> },
): Promise<DateAttachment> {
  const supabase = requireScopedDataClient(supabaseInput);
  await requireAttachmentWriteAccess(supabase, userId, workspaceId);
  const dateRecord = await getDateScoped(supabase, userId, workspaceId, dateId);

  const contentType = file.type || 'application/octet-stream';
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new ApiError(415, 'That file type is not supported. Upload a PDF, image, or document.');
  }
  if (file.size <= 0) {
    throw new ApiError(400, 'The uploaded file is empty.');
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new ApiError(413, 'That file is too large. The limit is 25 MB.');
  }

  const fileName = sanitizeFileName(file.name || 'file');
  const storagePath = `${workspaceId}/${dateId}/${randomUUID()}-${fileName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: false });

  if (uploadError) {
    throw new ApiError(500, uploadError.message || 'Unable to upload the file.');
  }

  const { data, error } = await supabase
    .from('date_attachments')
    .insert({
      workspace_id: workspaceId,
      project_id: dateRecord.project_id,
      date_id: dateId,
      storage_path: storagePath,
      file_name: fileName,
      content_type: contentType,
      file_size: file.size,
      uploaded_by: userId,
    })
    .select('id, workspace_id, project_id, date_id, storage_path, file_name, content_type, file_size, uploaded_by, created_at')
    .single();

  if (error || !data) {
    // Clean up the orphaned storage object if the row insert failed.
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([storagePath]);
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
    .select('id, workspace_id, project_id, date_id, storage_path, file_name, content_type, file_size, uploaded_by, created_at')
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

export async function deleteAttachmentScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  workspaceId: string,
  attachmentId: string,
) {
  const supabase = requireScopedDataClient(supabaseInput);
  await requireAttachmentWriteAccess(supabase, userId, workspaceId);
  const row = await getAttachmentRowScoped(supabase, userId, workspaceId, attachmentId);

  const { error } = await supabase.from('date_attachments').delete().eq('id', attachmentId).eq('workspace_id', workspaceId);
  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Attachments schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }

  await supabase.storage.from(ATTACHMENTS_BUCKET).remove([row.storage_path]);
}

export async function getAttachmentDownloadUrlScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  workspaceId: string,
  attachmentId: string,
): Promise<{ url: string; fileName: string }> {
  const supabase = requireScopedDataClient(supabaseInput);
  const row = await getAttachmentRowScoped(supabase, userId, workspaceId, attachmentId);

  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(row.storage_path, 300, { download: row.file_name });

  if (error || !data?.signedUrl) {
    throw new ApiError(500, error?.message ?? 'Unable to generate a download link.');
  }

  return { url: data.signedUrl, fileName: row.file_name };
}

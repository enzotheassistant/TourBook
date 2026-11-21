/**
 * Browser-side preparation for an attachment upload.
 *
 * Files go straight from the browser to Supabase Storage (see uploadAttachment
 * in lib/data-client.ts), so anything image-related happens here instead of on
 * the server:
 *
 * - HEIC/HEIF photos (iPhone's default format) are converted to JPEG when the
 *   browser can decode them, because most non-Apple browsers can't display
 *   HEIC at all. If the browser can't decode one, the original is uploaded
 *   untouched and simply gets no thumbnail (it shows as a file tile instead of
 *   a broken image).
 * - Every decodable image gets a small JPEG thumbnail for the grid, so crew
 *   never download a full-size photo just to see a preview tile.
 * - PDFs get a thumbnail of their first page, drawn with PDF.js (the same
 *   renderer the in-app viewer uses). If PDF.js can't load or the PDF can't
 *   be drawn, the PDF simply has no thumbnail and shows as a file tile.
 *
 * Nothing here ever throws: a decode or canvas failure just means "no
 * conversion / no thumbnail", never a failed upload.
 */

import { openPdfDocument, type PdfDocument } from '@/lib/attachments/pdfjs-loader';

const THUMBNAIL_MAX_DIMENSION = 480; // px, longest side
const THUMBNAIL_QUALITY = 0.75;
// Converted HEIC photos are capped so the canvas stays under iOS Safari's
// ~16.7M pixel canvas limit (a 48MP iPhone photo would otherwise come out blank).
const CONVERTED_MAX_DIMENSION = 4000;
const CONVERTED_QUALITY = 0.9;

// A PDF preview is a nice-to-have: never let a slow connection or a huge PDF
// hold up the actual upload for longer than this.
const PDF_THUMBNAIL_TIMEOUT_MS = 15000;

const HEIC_TYPES = new Set(['image/heic', 'image/heif']);

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
};

export const THUMBNAIL_CONTENT_TYPE = 'image/jpeg';

export type PreparedAttachmentUpload = {
  file: Blob;
  fileName: string;
  contentType: string;
  thumbnail: Blob | null;
};

/**
 * Some browsers (notably Chrome on Windows for HEIC) report an empty MIME type,
 * which the server would reject — fall back to the file extension.
 */
export function resolveContentType(file: File) {
  if (file.type) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

async function decodeImage(file: Blob): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    try {
      return await createImageBitmap(file);
    } catch {
      return null;
    }
  }
}

async function renderToJpeg(bitmap: ImageBitmap, maxDimension: number, quality: number): Promise<Blob | null> {
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;

    // JPEG has no transparency — paint a white background so transparent
    // PNG/GIF areas don't come out black in the thumbnail.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob && blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality)).then((blob) => (blob && blob.size > 0 ? blob : null));
}

async function renderPdfFirstPage(file: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  let pdf: PdfDocument | null = null;
  try {
    pdf = await openPdfDocument(url);
    const page = await pdf.getPage(1);
    try {
      const baseViewport = page.getViewport({ scale: 1 });
      const longest = Math.max(baseViewport.width, baseViewport.height) || 1;
      const viewport = page.getViewport({ scale: THUMBNAIL_MAX_DIMENSION / longest });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: context, viewport }).promise;
      return await canvasToJpeg(canvas, THUMBNAIL_QUALITY);
    } finally {
      page.cleanup();
    }
  } finally {
    if (pdf) void pdf.destroy().catch(() => undefined);
    URL.revokeObjectURL(url);
  }
}

async function createPdfThumbnail(file: Blob): Promise<Blob | null> {
  try {
    return await Promise.race([
      renderPdfFirstPage(file),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), PDF_THUMBNAIL_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

function withJpegExtension(fileName: string) {
  const base = fileName.replace(/\.[^./\\]+$/, '') || 'photo';
  return `${base}.jpg`;
}

export async function prepareAttachmentUpload(file: File): Promise<PreparedAttachmentUpload> {
  const contentType = resolveContentType(file);
  const fileName = file.name || 'file';
  const untouched: PreparedAttachmentUpload = { file, fileName, contentType, thumbnail: null };

  if (contentType === 'application/pdf') {
    return { ...untouched, thumbnail: await createPdfThumbnail(file) };
  }

  if (!contentType.startsWith('image/')) return untouched;

  const bitmap = await decodeImage(file);
  if (!bitmap) return untouched;

  try {
    let prepared = untouched;

    if (HEIC_TYPES.has(contentType)) {
      const jpeg = await renderToJpeg(bitmap, CONVERTED_MAX_DIMENSION, CONVERTED_QUALITY);
      if (jpeg) {
        prepared = { file: jpeg, fileName: withJpegExtension(fileName), contentType: 'image/jpeg', thumbnail: null };
      }
    }

    const thumbnail = await renderToJpeg(bitmap, THUMBNAIL_MAX_DIMENSION, THUMBNAIL_QUALITY);
    return { ...prepared, thumbnail };
  } finally {
    bitmap.close();
  }
}

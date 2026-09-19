'use client';

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ACCEPTED_FILE_TYPES, FileIcon, MAX_ATTACHMENT_SIZE_BYTES, TrashIcon, UploadIcon, formatFileSize } from '@/components/attachments-manager';

function fileExtensionLabelForName(name: string) {
  const parts = name.split('.');
  if (parts.length < 2) return 'FILE';
  return parts[parts.length - 1].slice(0, 4).toUpperCase();
}

function isImageFile(file: File) {
  return file.type.startsWith('image/');
}

function FilePreviewImage({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={file.name} className="h-full w-full object-cover" />;
}

/**
 * Lets an admin stage files for a tour day that hasn't been saved yet (so it
 * has no id to attach files to). Files are held in memory only — the caller
 * is responsible for actually uploading them (via uploadAttachment) once the
 * date is saved, then clearing this list.
 */
export function PendingAttachmentsPicker({ files, onFilesChange }: { files: File[]; onFilesChange: (files: File[]) => void }) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function addFiles(fileList: FileList | null) {
    if (!fileList || !fileList.length) return;
    setError('');
    const accepted: File[] = [];
    for (const file of Array.from(fileList)) {
      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        setError(`"${file.name}" is too large. The limit is 25 MB.`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length) onFilesChange([...files, ...accepted]);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    addFiles(event.target.files);
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    addFiles(event.dataTransfer.files);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
  }

  function removeFile(index: number) {
    onFilesChange(files.filter((_, fileIndex) => fileIndex !== index));
  }

  return (
    <div className="space-y-4">
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
          className="inline-flex h-10 items-center justify-center rounded-full bg-sky-500 px-4 text-sm font-medium text-zinc-950"
        >
          Choose files
        </button>
        <p className="text-xs text-zinc-500">PDFs, images, and docs up to 25 MB. Uploaded when you save this tour day.</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          onChange={handleInputChange}
          className="hidden"
        />
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {files.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {files.map((file, index) => (
            <div key={`${file.name}-${file.size}-${index}`} className="group relative flex flex-col overflow-hidden rounded-[20px] border border-white/10 bg-black/20">
              <div className="flex aspect-square items-center justify-center overflow-hidden bg-white/[0.03]">
                {isImageFile(file) ? (
                  <FilePreviewImage file={file} />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <FileIcon />
                    <span className="text-[10px] font-semibold tracking-wide text-zinc-500">{fileExtensionLabelForName(file.name)}</span>
                  </div>
                )}
              </div>
              <div className="flex items-start justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-zinc-100" title={file.name}>{file.name}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">{formatFileSize(file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  aria-label={`Remove ${file.name}`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.06] hover:text-red-300"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

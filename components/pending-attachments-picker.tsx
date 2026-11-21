'use client';

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ACCEPTED_FILE_TYPES, FileTypeTile, MAX_ATTACHMENT_SIZE_BYTES, TrashIcon, formatFileSize } from '@/components/attachments-manager';
import { stripFileExtension } from '@/lib/attachments/display-name';
import { UploadDropzoneContent, uploadDropzoneClassName } from '@/components/upload-dropzone';

/**
 * Optional custom names typed for files that haven't been uploaded yet, keyed
 * by the File itself so the list can be reordered/trimmed freely. Read by the
 * admin form when it uploads the files after saving the date.
 */
const pendingDisplayNames = new WeakMap<File, string>();

export function getPendingDisplayName(file: File) {
  return pendingDisplayNames.get(file)?.trim() || null;
}

function fileExtensionLabelForName(name: string) {
  const parts = name.split('.');
  if (parts.length < 2) return 'FILE';
  return parts[parts.length - 1].slice(0, 4).toUpperCase();
}

function isImageFile(file: File) {
  // HEIC/HEIF can't be shown in an <img> on most non-Apple browsers, so show a
  // file tile for those rather than a broken preview.
  return file.type.startsWith('image/') && file.type !== 'image/heic' && file.type !== 'image/heif';
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
  // Mirrors pendingDisplayNames so typing re-renders the inputs.
  const [, setNamesVersion] = useState(0);

  function setDisplayName(file: File, value: string) {
    pendingDisplayNames.set(file, value);
    setNamesVersion((version) => version + 1);
  }
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
        className={uploadDropzoneClassName(dragActive)}
      >
        <UploadDropzoneContent
          onChoose={() => fileInputRef.current?.click()}
          helperText="PDFs, images, and docs up to 25 MB. Uploaded when you save this tour day."
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

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {files.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {files.map((file, index) => (
            <div key={`${file.name}-${file.size}-${index}`} className="group relative flex flex-col overflow-hidden rounded-[20px] border border-white/10 bg-black/20">
              <div className="flex aspect-square items-center justify-center overflow-hidden bg-white/[0.03]">
                {isImageFile(file) ? (
                  <FilePreviewImage file={file} />
                ) : (
                  <FileTypeTile label={fileExtensionLabelForName(file.name)} />
                )}
              </div>
              <div className="flex items-start justify-between gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <label className="sr-only" htmlFor={`pending-name-${index}`}>{`Display name for ${file.name} (optional)`}</label>
                  <input
                    id={`pending-name-${index}`}
                    value={pendingDisplayNames.get(file) ?? ''}
                    maxLength={120}
                    onChange={(event) => setDisplayName(file, event.target.value)}
                    placeholder={stripFileExtension(file.name)}
                    className="h-9 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-sky-400/50"
                  />
                  <p className="mt-1 truncate text-[11px] text-zinc-500" title={file.name}>{formatFileSize(file.size)} · name optional</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  aria-label={`Remove ${file.name}`}
                  className="-mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.06] hover:text-red-300"
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

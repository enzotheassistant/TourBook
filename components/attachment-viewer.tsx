'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { openPdfDocument, type PdfDocument } from '@/lib/attachments/pdfjs-loader';
import { getAttachmentDownloadHref, getAttachmentViewUrl } from '@/lib/data-client';
import type { DateAttachment } from '@/lib/types/date-record';

/**
 * Full-screen, in-app viewer for an attachment. Tap a file on the day sheet,
 * it opens on top of the page; tap the X and you're back where you were — no
 * new browser tab, no "view or download?" prompt.
 *
 * - Photos: shown directly.
 * - PDFs: each page is drawn with PDF.js (phones can't reliably show a PDF
 *   inside a page by themselves).
 * - Text/CSV: shown as plain text.
 * - Word/Excel/PowerPoint and anything else a browser can't display: a short
 *   explanation with a button to open the file (the only case that leaves the app).
 *
 * Admins/editors also get a Download button in the header; crew don't.
 *
 * Render with key={attachment.id} so each file starts with fresh state.
 */

const MAX_PDF_PAGES = 50;
const MAX_TEXT_CHARS = 200_000;

type ViewerKind = 'image' | 'pdf' | 'text' | 'other';

function viewerKind(contentType: string): ViewerKind {
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType === 'text/plain' || contentType === 'text/csv') return 'text';
  return 'other';
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5">
      <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M12 4V16M12 16L7 11M12 16L17 11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 18V19C4 19.5523 4.44772 20 5 20H19C19.5523 20 20 19.5523 20 19V18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function ZoomIcon({ zoomed }: { zoomed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-4 w-4">
      <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.75" />
      <path d="M20 20L15.5 15.5M8.5 11H13.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      {zoomed ? null : <path d="M11 8.5V13.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />}
    </svg>
  );
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center text-sm text-zinc-300">{children}</div>;
}

function OpenFileButton({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-11 items-center justify-center rounded-full bg-sky-500 px-5 text-sm font-medium text-zinc-950"
    >
      Open file
    </a>
  );
}

function PdfPages({ url, zoomed }: { url: string; zoomed: boolean }) {
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; totalPages: number }>({ status: 'loading', totalPages: 0 });

  useEffect(() => {
    let cancelled = false;
    let pdf: PdfDocument | null = null;
    const objectUrls: string[] = [];
    const container = pagesRef.current;

    async function renderPages() {
      if (!container) return;
      container.replaceChildren();
      try {
        pdf = await openPdfDocument(url);
        const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
        // Render a bit sharper than the screen so text stays readable when zoomed.
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const targetWidth = Math.min(container.clientWidth || window.innerWidth, 1000) * pixelRatio * 1.5;

        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: targetWidth / baseViewport.width });

          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas unavailable');
          await page.render({ canvasContext: context, viewport }).promise;
          page.cleanup();

          // Turn each page into an image and free the canvas right away, so a
          // long PDF doesn't run a phone out of graphics memory.
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
          canvas.width = 0;
          canvas.height = 0;
          if (cancelled) return;
          if (!blob) throw new Error('Page render failed');

          const objectUrl = URL.createObjectURL(blob);
          objectUrls.push(objectUrl);
          const image = document.createElement('img');
          image.src = objectUrl;
          image.alt = `Page ${pageNumber}`;
          image.className = 'block w-full rounded-lg bg-white shadow-lg';
          container.appendChild(image);

          if (pageNumber === 1) setState({ status: 'ready', totalPages: pdf.numPages });
        }
      } catch {
        if (!cancelled) setState((current) => ({ ...current, status: 'error' }));
      }
    }

    void renderPages();

    return () => {
      cancelled = true;
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
      void pdf?.destroy();
    };
  }, [url]);

  return (
    <div className="px-3 py-4">
      {state.status === 'loading' ? <CenteredMessage>Loading PDF…</CenteredMessage> : null}
      {state.status === 'error' ? (
        <CenteredMessage>
          <p>This PDF couldn&apos;t be shown here.</p>
          <OpenFileButton url={url} />
        </CenteredMessage>
      ) : null}
      <div ref={pagesRef} className="mx-auto flex flex-col gap-3" style={{ width: zoomed ? '200%' : '100%', maxWidth: zoomed ? 'none' : '1000px' }} />
      {state.status === 'ready' && state.totalPages > MAX_PDF_PAGES ? (
        <CenteredMessage>
          <p>Showing the first {MAX_PDF_PAGES} of {state.totalPages} pages.</p>
          <OpenFileButton url={url} />
        </CenteredMessage>
      ) : null}
    </div>
  );
}

function ImageView({ url, alt, zoomed }: { url: string; alt: string; zoomed: boolean }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <CenteredMessage>
        <p>This photo can&apos;t be shown on this device.</p>
        <OpenFileButton url={url} />
      </CenteredMessage>
    );
  }

  return (
    <div className={zoomed ? 'p-2' : 'flex min-h-full items-center justify-center p-2'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        onError={() => setFailed(true)}
        className={zoomed ? 'block max-w-none' : 'block max-h-[calc(100dvh-5.5rem)] w-auto max-w-full object-contain'}
        style={zoomed ? { width: '200%' } : undefined}
      />
    </div>
  );
}

function TextView({ url }: { url: string }) {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; text: string }>({ status: 'loading', text: '' });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error('Request failed');
        const text = await response.text();
        if (!cancelled) setState({ status: 'ready', text: text.slice(0, MAX_TEXT_CHARS) });
      } catch {
        if (!cancelled) setState({ status: 'error', text: '' });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (state.status === 'loading') return <CenteredMessage>Loading…</CenteredMessage>;
  if (state.status === 'error') {
    return (
      <CenteredMessage>
        <p>This file couldn&apos;t be shown here.</p>
        <OpenFileButton url={url} />
      </CenteredMessage>
    );
  }
  return <pre className="whitespace-pre-wrap break-words px-4 py-4 font-mono text-xs leading-5 text-zinc-100">{state.text}</pre>;
}

export function AttachmentViewer({
  attachment,
  workspaceId,
  canDownload,
  onClose,
}: {
  attachment: DateAttachment;
  workspaceId: string | null;
  canDownload: boolean;
  onClose: () => void;
}) {
  const kind = viewerKind(attachment.content_type);
  const [view, setView] = useState<{ status: 'loading' | 'ready' | 'error'; url: string }>({ status: 'loading', url: '' });
  const [zoomed, setZoomed] = useState(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await getAttachmentViewUrl(attachment.id, { workspaceId });
        if (!cancelled) setView({ status: 'ready', url: result.url });
      } catch {
        if (!cancelled) setView({ status: 'error', url: '' });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [attachment.id, workspaceId]);

  // Keep the day sheet from scrolling underneath, and let Escape close it on desktop.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const canZoom = view.status === 'ready' && (kind === 'image' || kind === 'pdf');

  let content: ReactNode;
  if (view.status === 'loading') {
    content = <CenteredMessage>Loading…</CenteredMessage>;
  } else if (view.status === 'error') {
    content = <CenteredMessage><p>This file couldn&apos;t be loaded. Check your connection and try again.</p></CenteredMessage>;
  } else if (kind === 'image') {
    content = <ImageView url={view.url} alt={attachment.file_name} zoomed={zoomed} />;
  } else if (kind === 'pdf') {
    content = <PdfPages url={view.url} zoomed={zoomed} />;
  } else if (kind === 'text') {
    content = <TextView url={view.url} />;
  } else {
    content = (
      <CenteredMessage>
        <p>This type of file can&apos;t be previewed inside TourBook.</p>
        <p className="text-xs text-zinc-500">Tip for admins: save documents as PDF before uploading so crew can view them here.</p>
        <OpenFileButton url={view.url} />
      </CenteredMessage>
    );
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={attachment.file_name} className="fixed inset-0 z-[120] flex flex-col bg-[#0b080b]">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#120d12] px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <p className="min-w-0 flex-1 truncate pl-1 text-sm font-medium text-zinc-100">{attachment.file_name}</p>
        {canZoom ? (
          <button
            type="button"
            onClick={() => setZoomed((current) => !current)}
            aria-label={zoomed ? 'Fit to screen' : 'Zoom in'}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-300 transition hover:bg-white/[0.08]"
          >
            <ZoomIcon zoomed={zoomed} />
          </button>
        ) : null}
        {canDownload ? (
          <a
            href={getAttachmentDownloadHref(attachment.id, { workspaceId })}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08]"
          >
            <DownloadIcon />
            Download
          </a>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-zinc-100 transition hover:bg-white/[0.14]"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">{content}</div>
    </div>,
    document.body,
  );
}

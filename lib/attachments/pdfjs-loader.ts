/**
 * Loads Mozilla's PDF.js (the PDF renderer built into Firefox) on demand, only
 * when someone opens a PDF attachment. Phones can't reliably show a PDF inside
 * a page on their own (Android Chrome can't at all), so the in-app viewer
 * draws each page itself with PDF.js.
 *
 * Loaded from cdnjs rather than bundled so it costs nothing for anyone who
 * never opens a PDF. Pinned to an exact version.
 */

const PDFJS_VERSION = '3.11.174';
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

export type PdfViewport = { width: number; height: number };

export type PdfPage = {
  getViewport: (options: { scale: number }) => PdfViewport;
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => { promise: Promise<void> };
  cleanup: () => void;
};

export type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};

type PdfLoadingTask = { promise: Promise<PdfDocument>; destroy: () => Promise<void> };

export type PdfJsLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (source: { url: string; isEvalSupported?: boolean }) => PdfLoadingTask;
};

let loader: Promise<PdfJsLib> | null = null;

export function loadPdfJs(): Promise<PdfJsLib> {
  if (loader) return loader;

  loader = new Promise<PdfJsLib>((resolve, reject) => {
    const existing = (window as unknown as { pdfjsLib?: PdfJsLib }).pdfjsLib;
    if (existing) {
      resolve(existing);
      return;
    }

    const script = document.createElement('script');
    script.src = `${PDFJS_BASE}/pdf.min.js`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      const lib = (window as unknown as { pdfjsLib?: PdfJsLib }).pdfjsLib;
      if (!lib) {
        reject(new Error('PDF viewer failed to start.'));
        return;
      }
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`;
      resolve(lib);
    };
    script.onerror = () => reject(new Error('PDF viewer could not be loaded.'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loader = null; // allow a retry next time (e.g. after a dropped connection)
    throw error;
  });

  return loader;
}

export async function openPdfDocument(url: string): Promise<PdfDocument> {
  const pdfjs = await loadPdfJs();
  // isEvalSupported: false closes off the font-handling issue fixed in later
  // PDF.js releases (CVE-2024-4367), so a malicious PDF can't run code.
  return pdfjs.getDocument({ url, isEvalSupported: false }).promise;
}

import type { PDFDocumentProxy } from "pdfjs-dist";

const documents = new WeakMap<ArrayBuffer, Promise<PDFDocumentProxy>>();

export function getCachedPdfDocument(data: ArrayBuffer) {
  const cached = documents.get(data);
  if (cached) return cached;

  const loading = import("pdfjs-dist")
    .then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
    })
    .catch((error) => {
      documents.delete(data);
      throw error;
    });

  documents.set(data, loading);
  return loading;
}

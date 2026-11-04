import { extractText, getDocumentProxy } from "unpdf";
import type { PdfTextExtractor } from "../application/ports";

/** Extrae el texto seleccionable de un PDF (no hace OCR: un PDF escaneado no tiene texto). */
export class UnpdfExtractor implements PdfTextExtractor {
  constructor(private readonly maxPages = 80) {}

  async extract(data: Uint8Array): Promise<{ text: string; pages: number }> {
    const pdf = await getDocumentProxy(data);
    const { text, totalPages } = await extractText(pdf, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [text]).slice(0, this.maxPages);
    return { text: pages.join("\n\n"), pages: totalPages };
  }
}

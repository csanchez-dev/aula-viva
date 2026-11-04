import mammoth from "mammoth";
import type { DocxTextExtractor } from "../application/ports";

/** Extrae el texto de un documento de Word (.docx). No admite el formato antiguo .doc. */
export class MammothDocxExtractor implements DocxTextExtractor {
  async extract(data: Uint8Array): Promise<{ text: string }> {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
    return { text: value };
  }
}

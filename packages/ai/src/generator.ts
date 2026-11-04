import { ensureReadable, type GeneratedCards, GeneratedCardsSchema, type Theme, ThemeSchema } from "@aula-viva/shared";
import { extractJson } from "./json";
import { type LlmClient, LlmBadOutputError, type ModelTier, type Task } from "./llm";
import { cardsPrompt, themePrompt } from "./prompts";

export interface NotesInput {
  title: string;
  subject: string;
  /** Fragmentos de los apuntes con su posición (1, 2, 3…). */
  chunks: { position: number; text: string }[];
}

/** Tarjeta lista para guardar: `source` es la posición global del fragmento. */
export type DraftCard =
  | { kind: "flashcard"; front: string; back: string; source: number }
  | { kind: "question"; front: string; back: string; options: string[]; answerIndex: number; source: number };

/** Fragmentos por llamada al modelo: lotes pequeños = tarjetas más fieles y respuestas que no se cortan. */
export const CHUNKS_PER_CALL = 12;

/**
 * Genera tarjetas a partir de los apuntes y temas visuales.
 * Pide JSON al modelo, lo valida con los esquemas compartidos y, si falla,
 * reintenta una vez explicándole qué estaba mal.
 */
export class ContentGenerator {
  constructor(
    private readonly llm: LlmClient,
    private readonly maxAttempts = 2,
  ) {}

  async generateCards(input: NotesInput): Promise<DraftCard[]> {
    const cards: DraftCard[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < input.chunks.length; i += CHUNKS_PER_CALL) {
      const batch = input.chunks.slice(i, i + CHUNKS_PER_CALL);
      const valid = new Set(batch.map((c) => c.position));
      const prompt = cardsPrompt({
        title: input.title,
        subject: input.subject,
        fragments: batch,
        flashcards: Math.min(24, batch.length * 2 + 2),
        questions: Math.min(8, Math.ceil(batch.length / 2) + 1),
      });
      const generated = await this.run<GeneratedCards>("cards", "smart", 8000, prompt, (v) => GeneratedCardsSchema.safeParse(v));

      // Se descartan las tarjetas que citan un fragmento que no existe y las repetidas.
      const keep = (front: string, source: number) => {
        const key = front.toLowerCase().replace(/\s+/g, " ");
        if (!valid.has(source) || seen.has(key)) return false;
        seen.add(key);
        return true;
      };
      for (const f of generated.flashcards) {
        if (keep(f.front, f.source)) cards.push({ kind: "flashcard", front: f.front, back: f.back, source: f.source });
      }
      for (const q of generated.questions) {
        if (keep(q.q, q.source)) {
          cards.push({ kind: "question", front: q.q, back: q.why, options: q.options, answerIndex: q.answer, source: q.source });
        }
      }
    }
    if (cards.length === 0) throw new LlmBadOutputError("El modelo no devolvió tarjetas válidas", "");
    return cards;
  }

  async generateTheme(style: string): Promise<Theme> {
    const theme = await this.run("theme", "fast", 600, themePrompt(style), (value) => ThemeSchema.safeParse(value));
    return ensureReadable(theme);
  }

  private async run<T>(
    task: Task,
    tier: ModelTier,
    maxTokens: number,
    prompt: string,
    validate: (value: unknown) => { success: true; data: T } | { success: false; error: { message: string } },
  ): Promise<T> {
    let currentPrompt = prompt;
    let lastRaw = "";
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      lastRaw = await this.llm.complete({ task, tier, maxTokens, prompt: currentPrompt });
      const json = extractJson(lastRaw);
      const result = json === undefined ? null : validate(json);
      if (result?.success) return result.data;
      const problem = result ? result.error.message : "no era JSON válido";
      currentPrompt = `${prompt}\n\nTu respuesta anterior no se pudo usar (${problem.slice(0, 500)}). Vuelve a responder siguiendo exactamente el formato.`;
    }
    throw new LlmBadOutputError(`El modelo no devolvió un ${task} válido`, lastRaw);
  }
}

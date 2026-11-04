import type { CompletionRequest, LlmClient } from "./llm";

/**
 * Simulador de modelo: responde sin llamar a ninguna API, gratis y sin conexión.
 * Para las tarjetas crea ejercicios de "completar el hueco" a partir de los propios apuntes,
 * así el ciclo completo (generar, repasar, progreso) se puede probar con contenido real.
 */
export class MockLlmClient implements LlmClient {
  constructor(private readonly delayMs = 400) {}

  async complete(request: CompletionRequest): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return JSON.stringify(request.task === "theme" ? THEME : cardsFromPrompt(request.prompt));
  }
}

const THEME = {
  bg: "#0b1020", surface: "#141b33", text: "#e8f1ff", muted: "#9fb3d9",
  accent: "#38e1ff", accent2: "#ff5fd2", font: "orbitron", pattern: "stars", radius: 14,
  tagline: "Rumbo a tu próximo examen",
};

function cardsFromPrompt(prompt: string) {
  const fragments = [...prompt.matchAll(/^\[F(\d+)\] (.+)$/gm)].map((m) => ({ source: Number(m[1]), text: m[2] ?? "" }));
  const flashcards: { front: string; back: string; source: number }[] = [];
  const questions: { q: string; options: string[]; answer: number; why: string; source: number }[] = [];
  for (const { source, text } of fragments) {
    const sentences = (text.match(/[^.!?]{25,}[.!?]/g) ?? [text]).map((x) => x.trim()).slice(0, 3);
    sentences.forEach((sentence, n) => {
      // La palabra más larga de la frase es el hueco a completar.
      const words = sentence.match(/[\p{L}\d-]{5,}/gu) ?? [];
      const answer = [...words].sort((a, b) => b.length - a.length)[0];
      if (!answer) return;
      flashcards.push({ front: `Completa: ${sentence.replace(answer, "_____")}`, back: `${answer}. ${sentence}`, source });
      if (n > 0) return; // una pregunta tipo test por fragmento
      const distractors = words.filter((w) => w !== answer).slice(0, 3);
      while (distractors.length < 3) distractors.push(["ninguna", "todas", "depende"][distractors.length] ?? "otra");
      const options = [answer, ...distractors];
      const answerIndex = source % options.length;
      [options[0], options[answerIndex]] = [options[answerIndex]!, options[0]!];
      questions.push({ q: `¿Qué palabra falta? ${sentence.replace(answer, "_____")}`, options, answer: answerIndex, why: `En tus apuntes: «${sentence}»`, source });
    });
  }
  return { flashcards, questions };
}

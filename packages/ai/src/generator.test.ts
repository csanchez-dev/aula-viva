import { describe, expect, it } from "vitest";
import { ContentGenerator } from "./generator";
import { extractJson } from "./json";
import { type CompletionRequest, type LlmClient, LlmBadOutputError } from "./llm";
import { MockLlmClient } from "./mock-client";

class ScriptedLlm implements LlmClient {
  readonly prompts: string[] = [];
  constructor(private readonly replies: string[]) {}
  async complete(req: CompletionRequest) {
    this.prompts.push(req.prompt);
    return this.replies.shift() ?? "";
  }
}

const chunks = [
  { position: 1, text: "La tamsulosina es un antagonista alfa-1 que relaja el músculo liso prostático y mejora el flujo urinario." },
  { position: 2, text: "La finasterida inhibe la 5-alfa reductasa tipo 2 y reduce el volumen prostático tras seis meses de tratamiento." },
];

describe("extractJson", () => {
  it("lee JSON dentro de un bloque de código", () => {
    expect(extractJson('Aquí tienes:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
});

describe("ContentGenerator.generateCards", () => {
  it("con el simulador crea tarjetas que citan fragmentos reales", async () => {
    const cards = await new ContentGenerator(new MockLlmClient(0)).generateCards({ title: "HPB", subject: "Farmacología", chunks });
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.source === 1 || c.source === 2)).toBe(true);
  });

  it("descarta tarjetas que citan un fragmento inexistente o repetidas", async () => {
    const llm = new ScriptedLlm([
      JSON.stringify({
        flashcards: [
          { front: "¿Qué hace la tamsulosina?", back: "Relaja el músculo liso", source: 1 },
          { front: "¿Qué hace la tamsulosina?", back: "Repetida", source: 1 },
          { front: "Inventada", back: "x", source: 9 },
        ],
        questions: [{ q: "¿Qué enzima inhibe la finasterida?", options: ["5-alfa reductasa", "COX-2", "ECA", "MAO"], answer: 0, why: "Por su mecanismo.", source: 2 }],
      }),
    ]);
    const cards = await new ContentGenerator(llm).generateCards({ title: "HPB", subject: "Farmacología", chunks });
    expect(cards.map((c) => c.front)).toEqual(["¿Qué hace la tamsulosina?", "¿Qué enzima inhibe la finasterida?"]);
    expect(llm.prompts[0]).toContain("[F2] La finasterida");
  });

  it("procesa apuntes largos en varios lotes", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ position: i + 1, text: `Fragmento número ${i + 1} sobre fisiología renal y equilibrio ácido-base.` }));
    const llm = new MockLlmClient(0);
    const calls: number[] = [];
    const spy: LlmClient = { complete: (r) => (calls.push(1), llm.complete(r)) };
    const cards = await new ContentGenerator(spy).generateCards({ title: "Renal", subject: "Fisiología", chunks: many });
    expect(calls.length).toBe(3);
    expect(Math.max(...cards.map((c) => c.source))).toBe(30);
  });

  it("falla con un error claro si el modelo nunca devuelve el formato", async () => {
    const gen = new ContentGenerator(new ScriptedLlm(["lo siento", "tampoco"]));
    await expect(gen.generateCards({ title: "X", subject: "Y", chunks })).rejects.toBeInstanceOf(LlmBadOutputError);
  });
});

describe("ContentGenerator.generateTheme", () => {
  it("devuelve temas siempre legibles", async () => {
    const llm = new ScriptedLlm([
      '{"bg":"#000000","surface":"#000000","text":"#050505","muted":"#060606","accent":"#ff0000","accent2":"#00ff00","font":"pixel","pattern":"grid","radius":4}',
    ]);
    expect((await new ContentGenerator(llm).generateTheme("oscuro")).text).toBe("#ffffff");
  });
});

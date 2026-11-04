import { describe, expect, it } from "vitest";
import { formatInterval, GeneratedCardsSchema, splitIntoChunks } from "./study";

describe("splitIntoChunks", () => {
  it("agrupa párrafos cortos y respeta el tamaño máximo", () => {
    const notes = Array.from({ length: 12 }, (_, i) => `Párrafo ${i}. ${"Contenido de farmacología. ".repeat(6)}`).join("\n\n");
    const chunks = splitIntoChunks(notes);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 900 + 200)).toBe(true);
    expect(chunks.join(" ")).toContain("Párrafo 11");
  });

  it("corta un párrafo gigante por frases", () => {
    const notes = "La tamsulosina es un alfabloqueante. ".repeat(80);
    const chunks = splitIntoChunks(notes);
    expect(chunks.length).toBeGreaterThan(2);
  });

  it("no deja un último fragmento diminuto", () => {
    const chunks = splitIntoChunks(`${"a ".repeat(400)}\n\nfin.`);
    expect(chunks.at(-1)!.length).toBeGreaterThan(150);
  });
});

describe("GeneratedCardsSchema", () => {
  it("rechaza una respuesta correcta fuera de las opciones", () => {
    const r = GeneratedCardsSchema.safeParse({
      flashcards: [],
      questions: [{ q: "¿Cuál?", options: ["a", "b", "c"], answer: 4, why: "x", source: 1 }],
    });
    expect(r.success).toBe(false);
  });
});

describe("formatInterval", () => {
  it("elige la unidad adecuada", () => {
    expect(formatInterval(60_000)).toBe("1 min");
    expect(formatInterval(3 * 3_600_000)).toBe("3 h");
    expect(formatInterval(5 * 86_400_000)).toBe("5 d");
    expect(formatInterval(90 * 86_400_000)).toBe("3 mes");
  });
});

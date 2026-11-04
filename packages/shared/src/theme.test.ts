import { describe, expect, it } from "vitest";
import { contrastRatio, ensureReadable, ThemeSchema } from "./theme";

describe("contrastRatio", () => {
  it("da 21 entre blanco y negro", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
  });
  it("da 1 entre colores iguales", () => {
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });
});

describe("ThemeSchema", () => {
  it("corrige valores fuera de rango y opciones desconocidas", () => {
    const theme = ThemeSchema.parse({
      bg: "#000000", surface: "#111111", text: "#ffffff", muted: "#aaaaaa",
      accent: "#00ffcc", accent2: "#ff00aa", font: "comic-sans", pattern: "lava", radius: 99,
    });
    expect(theme.font).toBe("grotesque");
    expect(theme.pattern).toBe("none");
    expect(theme.radius).toBe(28);
  });
  it("rechaza colores que no son hexadecimales", () => {
    expect(() => ThemeSchema.parse({ bg: "red" })).toThrow();
  });
});

describe("ensureReadable", () => {
  it("cambia el texto ilegible por blanco o negro", () => {
    const fixed = ensureReadable(
      ThemeSchema.parse({
        bg: "#101010", surface: "#101010", text: "#121212", muted: "#131313",
        accent: "#ff0000", accent2: "#00ff00", font: "mono", pattern: "dots", radius: 8,
      }),
    );
    expect(fixed.text).toBe("#ffffff");
    expect(contrastRatio(fixed.surface, fixed.text)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(fixed.surface, fixed.muted)).toBeGreaterThanOrEqual(3);
  });
});

import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/infrastructure/config";

const base = { DATABASE_URL: "postgres://x", JWT_SECRET: "a".repeat(40) };

describe("loadConfig", () => {
  it("usa el valor por defecto cuando una variable está vacía", () => {
    expect(loadConfig({ ...base, JWT_EXPIRES_IN: "" }).JWT_EXPIRES_IN).toBe("7d");
  });
  it("tolera espacios y finales de línea de Windows", () => {
    expect(loadConfig({ ...base, JWT_EXPIRES_IN: " 12h\r" }).JWT_EXPIRES_IN).toBe("12h");
  });
  it("rechaza al arrancar una duración inválida con un mensaje claro", () => {
    expect(() => loadConfig({ ...base, JWT_EXPIRES_IN: "7 dias" })).toThrow(/JWT_EXPIRES_IN/);
  });
});

/**
 * Puerto (interfaz) hacia cualquier modelo de lenguaje.
 * El resto del sistema solo conoce esta interfaz, así se puede cambiar de proveedor
 * (Anthropic, OpenAI, un modelo local o un simulador) sin tocar la lógica de negocio.
 * Principio de inversión de dependencias (la "D" de SOLID).
 */
export type ModelTier = "smart" | "fast";

/** Qué se está generando. El simulador lo usa para elegir una respuesta de ejemplo. */
export type Task = "cards" | "theme";

export interface CompletionRequest {
  task: Task;
  prompt: string;
  tier: ModelTier;
  maxTokens: number;
}

export interface LlmClient {
  /** Devuelve el texto de la respuesta del modelo. */
  complete(request: CompletionRequest): Promise<string>;
}

/** Fallo del proveedor (red, saturación, clave inválida...). */
export class LlmUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LlmUnavailableError";
  }
}

/** El modelo respondió, pero no con el formato esperado ni tras reintentar. */
export class LlmBadOutputError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = "LlmBadOutputError";
  }
}

import Anthropic from "@anthropic-ai/sdk";
import { type CompletionRequest, type LlmClient, LlmUnavailableError } from "./llm";

export interface AnthropicClientOptions {
  apiKey: string;
  models: Record<CompletionRequest["tier"], string>;
}

/** Adaptador real hacia la API de Anthropic (Claude). */
export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;

  constructor(private readonly options: AnthropicClientOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey, maxRetries: 2, timeout: 120_000 });
  }

  async complete(request: CompletionRequest): Promise<string> {
    try {
      const message = await this.client.messages.create({
        model: this.options.models[request.tier],
        max_tokens: request.maxTokens,
        messages: [{ role: "user", content: request.prompt }],
      });
      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (!text.trim()) throw new LlmUnavailableError("El modelo devolvió una respuesta vacía");
      return text;
    } catch (error) {
      if (error instanceof LlmUnavailableError) throw error;
      throw new LlmUnavailableError("No se pudo contactar con Anthropic", { cause: error });
    }
  }
}

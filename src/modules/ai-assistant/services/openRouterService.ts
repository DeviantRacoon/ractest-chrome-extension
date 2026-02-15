import { storageService } from "../../../commons/lib/storage";

export interface AIResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenRouterService {
  private static readonly API_URL =
    "https://openrouter.ai/api/v1/chat/completions";
  private static readonly DEFAULT_MODEL = "anthropic/claude-3.5-sonnet";
  private static readonly REQUEST_TIMEOUT_MS = 20000;

  /**
   * Send a prompt to OpenRouter
   */
  public async generateCompletion(
    systemPrompt: string,
    userPrompt: string,
    model?: string,
  ): Promise<AIResponse> {
    const settings = await storageService.getSettings();
    const apiKey = settings?.openRouterApiKey;
    const maxTokens = settings?.aiMaxTokens || 4096; // Default to 4096 to be safer

    if (!apiKey) {
      throw new Error("API Key de OpenRouter no configurada. Ve a Ajustes.");
    }

    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = new AbortController();
      timeout = setTimeout(
        () => controller.abort(),
        OpenRouterService.REQUEST_TIMEOUT_MS,
      );

      const response = await fetch(OpenRouterService.API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://ractest.extension", // OpenRouter requirement
          "X-Title": "RacTest Extension",
        },
        body: JSON.stringify({
          model: model || settings?.aiModel || OpenRouterService.DEFAULT_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" }, // Crucial for reliable steps
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      timeout = null;

      if (!response.ok) {
        const errorData = await response.json();
        const specificMessage = errorData.error?.message || response.statusText;
        throw new Error(`OpenRouter Error: ${specificMessage}`);
      }

      const data = await response.json();
      return {
        content: data.choices[0].message.content,
        usage: data.usage,
      };
    } catch (error: any) {
      console.error("AI Generation Failed:", error);

      // Pass through the specific OpenRouter error message if available
      if (error.message.includes("OpenRouter Error")) {
        throw error;
      }

      // Fallback for other network/system errors
      if (error.name === "AbortError") {
        throw new Error("Timeout en la respuesta de IA. Intenta de nuevo.");
      } else if (error.message.includes("401")) {
        throw new Error(
          "API Key inválida (401). Verifica tu clave en Ajustes.",
        );
      } else if (error.message.includes("402")) {
        // This might be redundant if the OpenRouter Error above caught it,
        // but keeping it as a fallback if the message format changes.
        throw new Error(
          "Créditos insuficientes (402). Revisa tu cuenta en OpenRouter.",
        );
      } else if (error.message.includes("429")) {
        throw new Error(
          "Límite de velocidad excedido (429). Intenta más tarde.",
        );
      }

      throw error;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}

export const openRouterService = new OpenRouterService();

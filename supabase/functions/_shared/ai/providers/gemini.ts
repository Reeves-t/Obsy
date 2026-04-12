import type { AiProviderFailure, AiProviderRequest, AiProviderResult, AiProviderSuccess } from "../types.ts";

const DEFAULT_GEMINI_MODEL = Deno.env.get("AI_GEMINI_MODEL") ?? "gemini-2.5-flash";

export async function callGemini(request: AiProviderRequest): Promise<AiProviderResult> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return failure({
      model: DEFAULT_GEMINI_MODEL,
      stage: "config",
      message: "Missing GEMINI_API_KEY",
    });
  }

  const start = Date.now();

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: buildPrompt(request.prompt, request.responseFormat) }],
            },
          ],
          generationConfig: {
            temperature: request.responseFormat === "json" ? 0.3 : (request.temperature ?? 0.7),
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );

    const latencyMs = Date.now() - start;
    const rawText = await response.text();

    let data: any = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (error: any) {
      return failure({
        model: DEFAULT_GEMINI_MODEL,
        stage: "parse",
        message: `Gemini returned non-JSON response: ${error?.message ?? "Unknown parse error"}`,
        latencyMs,
        httpStatus: response.status,
        rawResponse: rawText,
      });
    }

    if (!response.ok) {
      return failure({
        model: DEFAULT_GEMINI_MODEL,
        stage: "model",
        message: extractGeminiError(data) || `Gemini request failed with status ${response.status}`,
        latencyMs,
        httpStatus: response.status,
        rawResponse: data,
      });
    }

    const text = extractGeminiText(data);
    if (!text.trim()) {
      return failure({
        model: DEFAULT_GEMINI_MODEL,
        stage: "validate",
        message: "Gemini returned empty text content",
        latencyMs,
        httpStatus: response.status,
        rawResponse: data,
      });
    }

    const success: AiProviderSuccess = {
      ok: true,
      provider: "gemini",
      model: DEFAULT_GEMINI_MODEL,
      text,
      rawResponse: data,
      latencyMs,
      httpStatus: response.status,
    };

    return success;
  } catch (error: any) {
    return failure({
      model: DEFAULT_GEMINI_MODEL,
      stage: "fetch",
      message: error?.message ?? "Gemini fetch failed",
      latencyMs: Date.now() - start,
    });
  }
}

function buildPrompt(prompt: string, responseFormat?: AiProviderRequest["responseFormat"]): string {
  if (responseFormat === "json") {
    return `${prompt}\n\nReturn only valid JSON. Do not add markdown fences, commentary, or any text outside the JSON object.`;
  }

  return prompt;
}

function extractGeminiText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts?.filter((part: any) => !part?.thought) ?? [];
  return parts
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractGeminiError(data: any): string | null {
  if (typeof data?.error?.message === "string" && data.error.message.trim()) {
    return data.error.message;
  }

  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message;
  }

  return null;
}

function failure(input: {
  model: string;
  stage: AiProviderFailure["stage"];
  message: string;
  latencyMs?: number;
  httpStatus?: number;
  rawResponse?: unknown;
}): AiProviderFailure {
  return {
    ok: false,
    provider: "gemini",
    model: input.model,
    stage: input.stage,
    message: input.message,
    latencyMs: input.latencyMs ?? 0,
    httpStatus: input.httpStatus,
    rawResponse: input.rawResponse,
  };
}

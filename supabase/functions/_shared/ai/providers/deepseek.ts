import type { AiProviderFailure, AiProviderRequest, AiProviderResult, AiProviderSuccess } from "../types.ts";

const DEFAULT_DEEPSEEK_MODEL = Deno.env.get("AI_DEEPSEEK_MODEL") ?? "deepseek-chat";

// DeepSeek exposes an OpenAI-compatible Chat Completions API.
export async function callDeepSeek(request: AiProviderRequest): Promise<AiProviderResult> {
  const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (!apiKey) {
    return failure({
      model: DEFAULT_DEEPSEEK_MODEL,
      stage: "config",
      message: "Missing DEEPSEEK_API_KEY",
    });
  }

  const start = Date.now();

  const messages: { role: "system" | "user"; content: string }[] = [];
  if (request.systemPrompt) {
    messages.push({ role: "system", content: request.systemPrompt });
  }
  messages.push({ role: "user", content: buildPrompt(request.prompt, request.responseFormat) });

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_DEEPSEEK_MODEL,
        max_tokens: request.maxTokens ?? 1400,
        temperature: request.responseFormat === "json" ? 0.3 : (request.temperature ?? 0.7),
        ...(request.responseFormat === "json" ? { response_format: { type: "json_object" } } : {}),
        messages,
      }),
    });

    const latencyMs = Date.now() - start;
    const rawText = await response.text();

    let data: any = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (error: any) {
      return failure({
        model: DEFAULT_DEEPSEEK_MODEL,
        stage: "parse",
        message: `DeepSeek returned non-JSON response: ${error?.message ?? "Unknown parse error"}`,
        latencyMs,
        httpStatus: response.status,
        rawResponse: rawText,
      });
    }

    if (!response.ok) {
      return failure({
        model: DEFAULT_DEEPSEEK_MODEL,
        stage: "model",
        message: extractDeepSeekError(data) || `DeepSeek request failed with status ${response.status}`,
        latencyMs,
        httpStatus: response.status,
        rawResponse: data,
      });
    }

    const text = extractDeepSeekText(data);
    if (!text.trim()) {
      return failure({
        model: DEFAULT_DEEPSEEK_MODEL,
        stage: "validate",
        message: "DeepSeek returned empty text content",
        latencyMs,
        httpStatus: response.status,
        rawResponse: data,
      });
    }

    const success: AiProviderSuccess = {
      ok: true,
      provider: "deepseek",
      model: DEFAULT_DEEPSEEK_MODEL,
      text,
      rawResponse: data,
      latencyMs,
      httpStatus: response.status,
    };

    return success;
  } catch (error: any) {
    return failure({
      model: DEFAULT_DEEPSEEK_MODEL,
      stage: "fetch",
      message: error?.message ?? "DeepSeek fetch failed",
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

function extractDeepSeekText(data: any): string {
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

function extractDeepSeekError(data: any): string | null {
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
    provider: "deepseek",
    model: input.model,
    stage: input.stage,
    message: input.message,
    latencyMs: input.latencyMs ?? 0,
    httpStatus: input.httpStatus,
    rawResponse: input.rawResponse,
  };
}

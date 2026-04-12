import type { AiProviderFailure, AiProviderRequest, AiProviderResult, AiProviderSuccess } from "../types.ts";

const DEFAULT_CLAUDE_MODEL =
  Deno.env.get("AI_CLAUDE_MODEL") ??
  Deno.env.get("ANTHROPIC_MODEL") ??
  "claude-haiku-4-5-20251001";

export async function callClaude(request: AiProviderRequest): Promise<AiProviderResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return failure({
      model: DEFAULT_CLAUDE_MODEL,
      stage: "config",
      message: "Missing ANTHROPIC_API_KEY",
    });
  }

  const start = Date.now();

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: DEFAULT_CLAUDE_MODEL,
        max_tokens: request.maxTokens ?? 1400,
        temperature: request.responseFormat === "json" ? 0.3 : (request.temperature ?? 0.7),
        system: request.systemPrompt,
        messages: [
          {
            role: "user",
            content: buildPrompt(request.prompt, request.responseFormat),
          },
        ],
      }),
    });

    const latencyMs = Date.now() - start;
    const rawText = await response.text();

    let data: any = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (error: any) {
      return failure({
        model: DEFAULT_CLAUDE_MODEL,
        stage: "parse",
        message: `Claude returned non-JSON response: ${error?.message ?? "Unknown parse error"}`,
        latencyMs,
        httpStatus: response.status,
        rawResponse: rawText,
      });
    }

    if (!response.ok) {
      return failure({
        model: DEFAULT_CLAUDE_MODEL,
        stage: "model",
        message: extractClaudeError(data) || `Claude request failed with status ${response.status}`,
        latencyMs,
        httpStatus: response.status,
        rawResponse: data,
      });
    }

    const text = extractClaudeText(data);
    if (!text.trim()) {
      return failure({
        model: DEFAULT_CLAUDE_MODEL,
        stage: "validate",
        message: "Claude returned empty text content",
        latencyMs,
        httpStatus: response.status,
        rawResponse: data,
      });
    }

    const success: AiProviderSuccess = {
      ok: true,
      provider: "claude",
      model: DEFAULT_CLAUDE_MODEL,
      text,
      rawResponse: data,
      latencyMs,
      httpStatus: response.status,
    };

    return success;
  } catch (error: any) {
    return failure({
      model: DEFAULT_CLAUDE_MODEL,
      stage: "fetch",
      message: error?.message ?? "Claude fetch failed",
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

function extractClaudeText(data: any): string {
  if (!Array.isArray(data?.content)) {
    return "";
  }

  return data.content
    .filter((block: any) => block?.type === "text" && typeof block?.text === "string")
    .map((block: any) => block.text)
    .join("\n")
    .trim();
}

function extractClaudeError(data: any): string | null {
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
    provider: "claude",
    model: input.model,
    stage: input.stage,
    message: input.message,
    latencyMs: input.latencyMs ?? 0,
    httpStatus: input.httpStatus,
    rawResponse: input.rawResponse,
  };
}

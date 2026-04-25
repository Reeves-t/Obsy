import { logAiProviderRun } from "./logging.ts";
import { callClaude } from "./providers/claude.ts";
import { callGemini } from "./providers/gemini.ts";
import type {
  AiAttemptSummary,
  AiErrorStage,
  AiProviderName,
  AiProviderRequest,
  AiProviderResult,
  AiRouteResult,
  AiTaskRequest,
} from "./types.ts";

const DEFAULT_PROVIDER_ORDER: AiProviderName[] = ["claude", "gemini"];

const PROVIDERS: Record<AiProviderName, (request: AiProviderRequest) => Promise<AiProviderResult>> = {
  claude: callClaude,
  gemini: callGemini,
};

export async function runAiTextTask(request: AiTaskRequest): Promise<AiRouteResult> {
  const providerOrder = request.providerOrder?.length
    ? normalizeProviderOrder(request.providerOrder)
    : DEFAULT_PROVIDER_ORDER;

  const attempts: AiAttemptSummary[] = [];
  let lastFailure: { stage: AiErrorStage; message: string; status: number } | null = null;

  for (const provider of providerOrder) {
    const attemptIndex = attempts.length + 1;
    const result = await PROVIDERS[provider]({
      requestId: request.requestId,
      feature: request.feature,
      task: request.task,
      userId: request.userId,
      prompt: request.prompt,
      inputMode: request.inputMode,
      responseFormat: request.responseFormat,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      systemPrompt: request.systemPrompt,
    });

    if (!result.ok) {
      attempts.push({
        provider: result.provider,
        model: result.model,
        ok: false,
        stage: result.stage,
        message: result.message,
        latencyMs: result.latencyMs,
        httpStatus: result.httpStatus,
      });

      await logAiProviderRun({
        request_id: request.requestId,
        user_id: request.userId ?? null,
        feature: request.feature,
        task: request.task,
        provider: result.provider,
        model: result.model,
        attempt_index: attemptIndex,
        is_fallback: attemptIndex > 1,
        fallback_from: attemptIndex > 1 ? providerOrder[0] : null,
        status: "error",
        error_stage: result.stage,
        error_message: truncate(result.message, 1000),
        http_status: result.httpStatus ?? null,
        latency_ms: result.latencyMs,
        input_mode: request.inputMode ?? "text",
        prompt_version: request.promptVersion ?? null,
        request_payload: buildRequestPayload(request),
        response_payload: buildFailureResponsePayload(result),
      });

      lastFailure = {
        stage: result.stage,
        message: result.message,
        status: statusFromStage(result.stage),
      };
      continue;
    }

    const postProcessed = request.postProcess ? request.postProcess(result.text) : { ok: true as const, text: result.text };
    if (!postProcessed.ok) {
      attempts.push({
        provider: result.provider,
        model: result.model,
        ok: false,
        stage: postProcessed.stage,
        message: postProcessed.message,
        latencyMs: result.latencyMs,
        httpStatus: result.httpStatus,
      });

      await logAiProviderRun({
        request_id: request.requestId,
        user_id: request.userId ?? null,
        feature: request.feature,
        task: request.task,
        provider: result.provider,
        model: result.model,
        attempt_index: attemptIndex,
        is_fallback: attemptIndex > 1,
        fallback_from: attemptIndex > 1 ? providerOrder[0] : null,
        status: "error",
        error_stage: postProcessed.stage,
        error_message: truncate(postProcessed.message, 1000),
        http_status: result.httpStatus ?? null,
        latency_ms: result.latencyMs,
        input_mode: request.inputMode ?? "text",
        prompt_version: request.promptVersion ?? null,
        request_payload: buildRequestPayload(request),
        response_payload: {
          text_preview: truncate(result.text, 400),
          text_length: result.text.length,
          raw_preview: summarizeForLog(result.rawResponse),
        },
      });

      lastFailure = {
        stage: postProcessed.stage,
        message: postProcessed.message,
        status: postProcessed.status ?? statusFromStage(postProcessed.stage),
      };
      continue;
    }

    attempts.push({
      provider: result.provider,
      model: result.model,
      ok: true,
      latencyMs: result.latencyMs,
      httpStatus: result.httpStatus,
    });

    await logAiProviderRun({
      request_id: request.requestId,
      user_id: request.userId ?? null,
      feature: request.feature,
      task: request.task,
      provider: result.provider,
      model: result.model,
      attempt_index: attemptIndex,
      is_fallback: attemptIndex > 1,
      fallback_from: attemptIndex > 1 ? providerOrder[0] : null,
      status: "success",
      error_stage: null,
      error_message: null,
      http_status: result.httpStatus,
      latency_ms: result.latencyMs,
      input_mode: request.inputMode ?? "text",
      prompt_version: request.promptVersion ?? null,
      request_payload: buildRequestPayload(request),
      response_payload: {
        text_preview: truncate(postProcessed.text, 400),
        text_length: postProcessed.text.length,
        raw_preview: summarizeForLog(result.rawResponse),
      },
    });

    return {
      ok: true,
      text: postProcessed.text,
      providerUsed: result.provider,
      modelUsed: result.model,
      fallbackUsed: attemptIndex > 1,
      attempts,
    };
  }

  return {
    ok: false,
    stage: lastFailure?.stage ?? "unknown",
    message: lastFailure?.message ?? "All AI providers failed",
    status: lastFailure?.status ?? 502,
    attempts,
  };
}

function buildRequestPayload(request: AiTaskRequest): Record<string, unknown> {
  return {
    prompt_length: request.prompt.length,
    prompt_preview: truncate(request.prompt, 400),
    response_format: request.responseFormat ?? "text",
    temperature: request.temperature ?? null,
    max_tokens: request.maxTokens ?? null,
    ...request.requestPayload,
  };
}

function buildFailureResponsePayload(result: Extract<AiProviderResult, { ok: false }>): Record<string, unknown> {
  return {
    error_message: truncate(result.message, 1000),
    raw_preview: summarizeForLog(result.rawResponse),
  };
}

function summarizeForLog(value: unknown): unknown {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    return truncate(value, 600);
  }

  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= 600) {
      return value;
    }

    return { preview: truncate(serialized, 600) };
  } catch {
    return { preview: "[unserializable]" };
  }
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function normalizeProviderOrder(providerOrder: AiProviderName[]): AiProviderName[] {
  return [...new Set(providerOrder)];
}

function statusFromStage(stage: AiErrorStage): number {
  switch (stage) {
    case "config":
      return 500;
    case "fetch":
    case "model":
    case "parse":
    case "validate":
      return 502;
    default:
      return 502;
  }
}

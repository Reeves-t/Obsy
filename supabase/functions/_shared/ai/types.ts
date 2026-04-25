export type AiProviderName = "claude" | "gemini";
export type AiInputMode = "text" | "vision" | "multimodal";
export type AiResponseFormat = "text" | "json";
export type AiErrorStage = "config" | "fetch" | "model" | "parse" | "validate" | "unknown";

export interface AiProviderRequest {
  requestId: string;
  feature: string;
  task: string;
  userId?: string | null;
  prompt: string;
  inputMode?: AiInputMode;
  responseFormat?: AiResponseFormat;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface AiProviderSuccess {
  ok: true;
  provider: AiProviderName;
  model: string;
  text: string;
  rawResponse: unknown;
  latencyMs: number;
  httpStatus: number;
}

export interface AiProviderFailure {
  ok: false;
  provider: AiProviderName;
  model: string;
  stage: AiErrorStage;
  message: string;
  rawResponse?: unknown;
  latencyMs: number;
  httpStatus?: number;
}

export type AiProviderResult = AiProviderSuccess | AiProviderFailure;

export type AiPostProcessResult =
  | { ok: true; text: string }
  | { ok: false; stage: AiErrorStage; message: string; status?: number };

export interface AiTaskRequest {
  requestId: string;
  feature: string;
  task: string;
  userId?: string | null;
  prompt: string;
  inputMode?: AiInputMode;
  responseFormat?: AiResponseFormat;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  providerOrder?: AiProviderName[];
  promptVersion?: string;
  requestPayload?: Record<string, unknown>;
  postProcess?: (text: string) => AiPostProcessResult;
}

export interface AiAttemptSummary {
  provider: AiProviderName;
  model: string;
  ok: boolean;
  stage?: AiErrorStage;
  message?: string;
  latencyMs: number;
  httpStatus?: number;
}

export interface AiRouteSuccess {
  ok: true;
  text: string;
  providerUsed: AiProviderName;
  modelUsed: string;
  fallbackUsed: boolean;
  attempts: AiAttemptSummary[];
}

export interface AiRouteFailure {
  ok: false;
  stage: AiErrorStage;
  message: string;
  status: number;
  attempts: AiAttemptSummary[];
}

export type AiRouteResult = AiRouteSuccess | AiRouteFailure;

export interface AiProviderRunLog {
  request_id: string;
  user_id?: string | null;
  feature: string;
  task: string;
  provider: AiProviderName;
  model: string;
  attempt_index: number;
  is_fallback: boolean;
  fallback_from?: AiProviderName | null;
  status: "success" | "error";
  error_stage?: AiErrorStage | null;
  error_message?: string | null;
  http_status?: number | null;
  latency_ms?: number | null;
  input_mode: AiInputMode;
  prompt_version?: string | null;
  request_payload?: Record<string, unknown> | null;
  response_payload?: Record<string, unknown> | null;
}

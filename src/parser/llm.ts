/**
 * Provider-agnostic LLM parser interface.
 *
 * pipeline.ts calls parseWithLlm(rawText, config); we dispatch to the
 * matching adapter (claudeAdapter or openaiAdapter). Adapters return a
 * fully-formed ParsedSignal; this module just routes + normalizes errors.
 */

import type { ParsedSignal } from "./schema";
import type { LlmProvider } from "../storage/secureSettings";
import { fetchClaudeParse } from "./claudeAdapter";
import { fetchOpenAiParse } from "./openaiAdapter";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
}

// ─── Error class hierarchy ─────────────────────────────────────
export class LlmError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "LlmError";
  }
}
export class LlmAuthError extends LlmError {
  constructor(message: string) {
    super(message, 401);
    this.name = "LlmAuthError";
  }
}
export class LlmRateLimitError extends LlmError {
  constructor(message: string) {
    super(message, 429);
    this.name = "LlmRateLimitError";
  }
}
export class LlmSchemaError extends LlmError {
  constructor(message: string) {
    super(message);
    this.name = "LlmSchemaError";
  }
}

/** Dispatch to the right adapter based on provider. Adapters throw LlmError subclasses on failure. */
export async function parseWithLlm(
  rawText: string,
  config: LlmConfig,
  signal?: AbortSignal,
): Promise<ParsedSignal> {
  if (config.provider === "claude") {
    return fetchClaudeParse(rawText, config.apiKey, signal);
  }
  return fetchOpenAiParse(rawText, config.apiKey, signal);
}

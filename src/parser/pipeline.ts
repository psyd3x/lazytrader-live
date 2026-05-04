/**
 * Parser pipeline orchestrator. Single entry point for CaptureScreen.
 *
 * Per spec §5: regex first (5-field gate, all-or-nothing); on miss, dispatch
 * to LLM via parseWithLlm. Errors surface as a structured discriminated union
 * the UI can map to friendly messages.
 */

import { parseWithRegex } from "./regex";
import {
  parseWithLlm,
  LlmAuthError,
  LlmRateLimitError,
  LlmSchemaError,
} from "./llm";
import { getLlmConfig } from "../storage/secureSettings";
import { ParsedSignalSchema, type ParsedSignal } from "./schema";

export enum ParseError {
  NoLlmConfig = "no_llm_config",
  AuthInvalid = "auth_invalid",
  RateLimited = "rate_limited",
  Malformed = "malformed",
  Network = "network",
}

export type ParsePipelineResult =
  | { ok: true; parsed: ParsedSignal }
  | { ok: false; error: ParseError; detail?: string };

/**
 * Try regex first; on miss + LLM configured, dispatch to LLM. Otherwise
 * return a structured error.
 */
export async function parsePipeline(
  rawText: string,
  signal?: AbortSignal,
): Promise<ParsePipelineResult> {
  const r = parseWithRegex(rawText);
  if (r.complete) {
    // Construct ParsedSignal from regex result
    const candidate = {
      pair: r.fields.pair!,
      direction: r.fields.direction!,
      entry: r.fields.entry!,
      stopLoss: r.fields.stopLoss!,
      takeProfits: r.fields.takeProfits!,
      leverage: r.fields.leverage ?? null,
      source: "regex" as const,
      rawText,
      multipleTrades: false,
      notes: r.fields.notes ?? null,
      entryRange: r.fields.entryRange ?? null,
    };
    const parsed = ParsedSignalSchema.safeParse(candidate);
    if (!parsed.success) {
      return { ok: false, error: ParseError.Malformed, detail: parsed.error.message.slice(0, 200) };
    }
    return { ok: true, parsed: parsed.data };
  }

  const config = await getLlmConfig();
  if (!config) {
    return { ok: false, error: ParseError.NoLlmConfig };
  }

  try {
    const llm = await parseWithLlm(rawText, config, signal);
    return { ok: true, parsed: llm };
  } catch (e) {
    if (e instanceof LlmAuthError) return { ok: false, error: ParseError.AuthInvalid };
    if (e instanceof LlmRateLimitError) return { ok: false, error: ParseError.RateLimited };
    if (e instanceof LlmSchemaError) return { ok: false, error: ParseError.Malformed, detail: (e as Error).message };
    return { ok: false, error: ParseError.Network, detail: (e as Error).message };
  }
}

import type { ParsedSignal } from "./schema";

export async function fetchOpenAiParse(
  _rawText: string,
  _apiKey: string,
  _signal?: AbortSignal,
): Promise<ParsedSignal> {
  throw new Error("openaiAdapter not implemented yet (T7)");
}

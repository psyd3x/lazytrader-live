import type { ParsedSignal } from "./schema";

export async function fetchClaudeParse(
  _rawText: string,
  _apiKey: string,
  _signal?: AbortSignal,
): Promise<ParsedSignal> {
  throw new Error("claudeAdapter not implemented yet (T6)");
}

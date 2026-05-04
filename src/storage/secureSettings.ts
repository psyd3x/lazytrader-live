/**
 * Secure key-value store backed by expo-secure-store (Android Keystore /
 * iOS Keychain). The ONLY module in the app that imports SecureStore.
 *
 * - Returns null on miss (never throws for "not found")
 * - Throws on platform-level failures (caller decides how to surface)
 * - Never logs values; debug paths must use redact() helper
 *
 * M3 stores: birdeye API key.
 * M4 adds: LLM provider + Claude API key + OpenAI API key.
 * M5 will extend with: wallet auth token / session jwt.
 */

import * as SecureStore from "expo-secure-store";

const KEYS = {
  birdeyeApiKey: "birdeye_api_key",
  llmProvider: "llm_provider",
  claudeApiKey: "claude_api_key",
  openaiApiKey: "openai_api_key",
} as const;

export type LlmProvider = "claude" | "gpt-4o-mini";

// ─── Birdeye (M3, unchanged) ────────────────────────────────
export async function getBirdeyeApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.birdeyeApiKey);
}
export async function setBirdeyeApiKey(value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    await clearBirdeyeApiKey();
    return;
  }
  await SecureStore.setItemAsync(KEYS.birdeyeApiKey, trimmed);
}
export async function clearBirdeyeApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.birdeyeApiKey);
}

// ─── LLM (M4) ──────────────────────────────────────────────
export async function getLlmProvider(): Promise<LlmProvider | null> {
  const raw = await SecureStore.getItemAsync(KEYS.llmProvider);
  if (raw === "claude" || raw === "gpt-4o-mini") return raw;
  return null;
}
export async function setLlmProvider(provider: LlmProvider): Promise<void> {
  await SecureStore.setItemAsync(KEYS.llmProvider, provider);
}

export async function getClaudeApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.claudeApiKey);
}
export async function setClaudeApiKey(value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    await clearClaudeApiKey();
    return;
  }
  await SecureStore.setItemAsync(KEYS.claudeApiKey, trimmed);
}
export async function clearClaudeApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.claudeApiKey);
}

export async function getOpenAiApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.openaiApiKey);
}
export async function setOpenAiApiKey(value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    await clearOpenAiApiKey();
    return;
  }
  await SecureStore.setItemAsync(KEYS.openaiApiKey, trimmed);
}
export async function clearOpenAiApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.openaiApiKey);
}

/**
 * Resolves the active provider's full config or null if not configured.
 * Returns null if either provider is unset OR the corresponding key is empty.
 */
export async function getLlmConfig(): Promise<{ provider: LlmProvider; apiKey: string } | null> {
  const provider = await getLlmProvider();
  if (!provider) return null;
  const apiKey = provider === "claude" ? await getClaudeApiKey() : await getOpenAiApiKey();
  if (!apiKey) return null;
  return { provider, apiKey };
}

/** Redact a secret value for logging. Returns "•••••" + last 4 chars. */
export function redact(value: string | null | undefined): string {
  if (!value) return "(empty)";
  if (value.length <= 4) return "•••••";
  return "•••••" + value.slice(-4);
}

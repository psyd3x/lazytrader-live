/**
 * Secure key-value store backed by expo-secure-store (Android Keystore /
 * iOS Keychain). The ONLY module in the app that imports SecureStore.
 *
 * - Returns null on miss (never throws for "not found")
 * - Throws on platform-level failures (caller decides how to surface)
 * - Never logs values; debug paths must use redact() helper
 *
 * M3 stores: birdeye API key.
 * M5 will extend with: wallet auth token / session jwt.
 */

import * as SecureStore from "expo-secure-store";

const KEYS = {
  birdeyeApiKey: "birdeye_api_key",
} as const;

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

/** Redact a secret value for logging. Returns "•••••" + last 4 chars. */
export function redact(value: string | null | undefined): string {
  if (!value) return "(empty)";
  if (value.length <= 4) return "•••••";
  return "•••••" + value.slice(-4);
}

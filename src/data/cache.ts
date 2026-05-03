/**
 * Two-layer OHLCV cache:
 *   L1 — in-memory Map for the lifetime of the process (instant, JS-side)
 *   L2 — AsyncStorage for persistence across app restarts
 *
 * Both layers honor a per-TF TTL. Engine consumers never see expired data.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Candle } from "../smc";

export type TfKey = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";

const TTL_MS: Readonly<Record<TfKey, number>> = {
  "1m": 30_000,
  "5m": 30_000,
  "15m": 60_000,
  "1H": 5 * 60_000,
  "4H": 15 * 60_000,
  "1D": 60 * 60_000,
  "1W": 60 * 60_000,
};

export function ttlForTf(tf: TfKey): number {
  return TTL_MS[tf];
}

interface Entry {
  data: Candle[];
  expiresAt: number;
}

const PREFIX = "lt:cache:v1:";

function makeKey(symbol: string, tf: TfKey): string {
  return `${PREFIX}${symbol}:${tf}`;
}

export class CandleCache {
  private l1 = new Map<string, Entry>();

  async get(symbol: string, tf: TfKey): Promise<Candle[] | null> {
    const key = makeKey(symbol, tf);
    const now = Date.now();

    // L1
    const hit = this.l1.get(key);
    if (hit && hit.expiresAt > now) return hit.data;
    if (hit) this.l1.delete(key);

    // L2
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Entry;
      if (parsed.expiresAt > now) {
        this.l1.set(key, parsed); // promote to L1
        return parsed.data;
      }
      // Stale — clean up
      await AsyncStorage.removeItem(key);
      return null;
    } catch {
      // Corrupt entry — drop it
      await AsyncStorage.removeItem(key);
      return null;
    }
  }

  async set(symbol: string, tf: TfKey, data: Candle[]): Promise<void> {
    const key = makeKey(symbol, tf);
    const entry: Entry = { data, expiresAt: Date.now() + ttlForTf(tf) };
    this.l1.set(key, entry);
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  }
}

/** Module-level singleton — share one cache across all feed.ts callers. */
export const candleCache = new CandleCache();

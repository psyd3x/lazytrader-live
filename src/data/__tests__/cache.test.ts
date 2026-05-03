import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory shim for AsyncStorage. Reset before each test.
const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    setItem: vi.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve();
    }),
    removeItem: vi.fn((k: string) => {
      store.delete(k);
      return Promise.resolve();
    }),
    getAllKeys: vi.fn(() => Promise.resolve([...store.keys()])),
  },
}));

import { CandleCache, ttlForTf } from "../cache";
import type { Candle } from "../../smc";

const sampleCandles: Candle[] = [
  { timestamp: 1_000_000, open: 100, high: 110, low: 95, close: 105, volume: 0 },
];

describe("ttlForTf", () => {
  it("returns 30s for 1m and 5m", () => {
    expect(ttlForTf("1m")).toBe(30_000);
    expect(ttlForTf("5m")).toBe(30_000);
  });
  it("returns 60s for 15m", () => {
    expect(ttlForTf("15m")).toBe(60_000);
  });
  it("returns 5min for 1H", () => {
    expect(ttlForTf("1H")).toBe(5 * 60_000);
  });
  it("returns 15min for 4H", () => {
    expect(ttlForTf("4H")).toBe(15 * 60_000);
  });
  it("returns 1h for 1D and 1W", () => {
    expect(ttlForTf("1D")).toBe(60 * 60_000);
    expect(ttlForTf("1W")).toBe(60 * 60_000);
  });
});

describe("CandleCache", () => {
  beforeEach(() => {
    store.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-03T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null on miss", async () => {
    const c = new CandleCache();
    expect(await c.get("Crypto.BTC/USD", "1H")).toBeNull();
  });

  it("returns hit from L1 within TTL", async () => {
    const c = new CandleCache();
    await c.set("Crypto.BTC/USD", "1H", sampleCandles);
    const hit = await c.get("Crypto.BTC/USD", "1H");
    expect(hit).toEqual(sampleCandles);
  });

  it("returns null after TTL expires", async () => {
    const c = new CandleCache();
    await c.set("Crypto.BTC/USD", "1H", sampleCandles);
    vi.advanceTimersByTime(6 * 60_000); // 6min > 5min TTL for 1H
    expect(await c.get("Crypto.BTC/USD", "1H")).toBeNull();
  });

  it("falls back to L2 when L1 missed but L2 fresh (new instance)", async () => {
    const c1 = new CandleCache();
    await c1.set("Crypto.BTC/USD", "1H", sampleCandles);
    // Simulate process restart — new instance, L1 empty, L2 persisted
    const c2 = new CandleCache();
    expect(await c2.get("Crypto.BTC/USD", "1H")).toEqual(sampleCandles);
  });

  it("ignores L2 entry past TTL", async () => {
    const c1 = new CandleCache();
    await c1.set("Crypto.BTC/USD", "1H", sampleCandles);
    vi.advanceTimersByTime(6 * 60_000);
    const c2 = new CandleCache();
    expect(await c2.get("Crypto.BTC/USD", "1H")).toBeNull();
  });

  it("keys by symbol AND tf — no cross-TF leak", async () => {
    const c = new CandleCache();
    await c.set("Crypto.BTC/USD", "1H", sampleCandles);
    expect(await c.get("Crypto.BTC/USD", "4H")).toBeNull();
  });
});

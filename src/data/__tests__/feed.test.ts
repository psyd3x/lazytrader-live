import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    setItem: vi.fn((k: string, v: string) => { store.set(k, v); return Promise.resolve(); }),
    removeItem: vi.fn((k: string) => { store.delete(k); return Promise.resolve(); }),
    getAllKeys: vi.fn(() => Promise.resolve([...store.keys()])),
  },
}));

vi.mock("../pyth", () => ({
  fetchPythCandles: vi.fn(),
  PythError: class PythError extends Error {},
}));
vi.mock("../birdeye", () => ({
  fetchBirdeyeCandles: vi.fn(),
  BirdeyeError: class BirdeyeError extends Error {},
  BirdeyeAuthError: class BirdeyeAuthError extends Error {},
  BirdeyeRateLimitError: class BirdeyeRateLimitError extends Error {},
}));
vi.mock("../../storage/secureSettings", () => ({
  getBirdeyeApiKey: vi.fn(),
}));

// Mock the cache module so each test gets a fresh CandleCache instance,
// avoiding L1 in-memory bleed between tests when store.clear() only
// resets the AsyncStorage shim (L2).
import { CandleCache } from "../cache";
vi.mock("../cache", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../cache")>();
  return { ...mod, candleCache: new mod.CandleCache() };
});

import { fetchPythCandles } from "../pyth";
import { fetchBirdeyeCandles } from "../birdeye";
import { getBirdeyeApiKey } from "../../storage/secureSettings";
import { fetchCandlesForEngine, NoCandlesError } from "../feed";
import type { ResolvedPair } from "../pairs";

const solPair: ResolvedPair = {
  base: "SOL", quote: "USD",
  pyth: { pythSymbol: "Crypto.SOL/USD", pythFeedId: "0xabc" },
  birdeyeTokenAddress: "So11111111111111111111111111111111111111112",
};

const btcPair: ResolvedPair = {
  base: "BTC", quote: "USD",
  pyth: { pythSymbol: "Crypto.BTC/USD", pythFeedId: "0xbtc" },
};

const sample = [{ timestamp: 1000, open: 1, high: 1, low: 1, close: 1, volume: 0 }];

describe("fetchCandlesForEngine", () => {
  beforeEach(async () => {
    store.clear();
    // Also clear the L1 in-memory map of the mocked singleton.
    // Cast through unknown to bypass private-member TS restriction.
    const { candleCache } = await import("../cache");
    (candleCache as unknown as { l1: Map<unknown, unknown> }).l1.clear();
    vi.mocked(fetchPythCandles).mockReset();
    vi.mocked(fetchBirdeyeCandles).mockReset();
    vi.mocked(getBirdeyeApiKey).mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns Pyth data on happy path for all enabled TFs", async () => {
    vi.mocked(fetchPythCandles).mockResolvedValue(sample);
    const out = await fetchCandlesForEngine({ pair: solPair });
    expect(Object.keys(out).sort()).toEqual(["15m", "1D", "1H", "1W", "4H"].sort());
    for (const tf of Object.keys(out)) expect(out[tf]).toEqual(sample);
  });

  it("falls back to Birdeye on Pyth failure when key present", async () => {
    vi.mocked(fetchPythCandles).mockRejectedValue(new Error("Pyth down"));
    vi.mocked(getBirdeyeApiKey).mockResolvedValue("user-key");
    vi.mocked(fetchBirdeyeCandles).mockResolvedValue(sample);
    const out = await fetchCandlesForEngine({ pair: solPair, tfs: ["1H"] });
    expect(out["1H"]).toEqual(sample);
    expect(fetchBirdeyeCandles).toHaveBeenCalled();
  });

  it("throws NoCandlesError when Pyth fails and no Birdeye key", async () => {
    vi.mocked(fetchPythCandles).mockRejectedValue(new Error("Pyth down"));
    vi.mocked(getBirdeyeApiKey).mockResolvedValue(null);
    await expect(fetchCandlesForEngine({ pair: solPair, tfs: ["1H"] }))
      .rejects.toBeInstanceOf(NoCandlesError);
  });

  it("throws NoCandlesError when both sources fail", async () => {
    vi.mocked(fetchPythCandles).mockRejectedValue(new Error("Pyth down"));
    vi.mocked(getBirdeyeApiKey).mockResolvedValue("user-key");
    vi.mocked(fetchBirdeyeCandles).mockRejectedValue(new Error("Birdeye down"));
    await expect(fetchCandlesForEngine({ pair: solPair, tfs: ["1H"] }))
      .rejects.toBeInstanceOf(NoCandlesError);
  });

  it("skips Birdeye when pair has no token address (BTC)", async () => {
    vi.mocked(fetchPythCandles).mockRejectedValue(new Error("Pyth down"));
    vi.mocked(getBirdeyeApiKey).mockResolvedValue("user-key");
    await expect(fetchCandlesForEngine({ pair: btcPair, tfs: ["1H"] }))
      .rejects.toBeInstanceOf(NoCandlesError);
    expect(fetchBirdeyeCandles).not.toHaveBeenCalled();
  });

  it("uses cache on second call within TTL (single Pyth call)", async () => {
    vi.mocked(fetchPythCandles).mockResolvedValue(sample);
    await fetchCandlesForEngine({ pair: solPair, tfs: ["1H"] });
    await fetchCandlesForEngine({ pair: solPair, tfs: ["1H"] });
    expect(fetchPythCandles).toHaveBeenCalledTimes(1);
  });

  it("fetches all TFs in parallel (Promise.all)", async () => {
    let inFlight = 0;
    let maxConcurrent = 0;
    vi.mocked(fetchPythCandles).mockImplementation(async () => {
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return sample;
    });
    await fetchCandlesForEngine({ pair: solPair });
    expect(maxConcurrent).toBeGreaterThan(1);
  });
});

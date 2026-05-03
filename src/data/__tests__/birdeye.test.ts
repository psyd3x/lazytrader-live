import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BirdeyeAuthError,
  BirdeyeError,
  BirdeyeRateLimitError,
  fetchBirdeyeCandles,
  tfToBirdeyeType,
} from "../birdeye";
import type { ResolvedPair } from "../pairs";

const solPair: ResolvedPair = {
  base: "SOL",
  quote: "USD",
  pyth: { pythSymbol: "Crypto.SOL/USD", pythFeedId: "0xabc" },
  birdeyeTokenAddress: "So11111111111111111111111111111111111111112",
};

describe("tfToBirdeyeType", () => {
  it.each([
    ["1m", "1m"],
    ["5m", "5m"],
    ["15m", "15m"],
    ["1H", "1H"],
    ["4H", "4H"],
    ["1D", "1D"],
    ["1W", "1W"],
  ])("maps %s → %s", (tf, expected) => {
    expect(tfToBirdeyeType(tf as never)).toBe(expected);
  });
});

describe("fetchBirdeyeCandles", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("converts response items to Candle[] with ms timestamps", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        data: {
          items: [
            { unixTime: 1000, o: 100, h: 110, l: 95, c: 105, v: 12345 },
            { unixTime: 2000, o: 105, h: 115, l: 100, c: 110, v: 23456 },
          ],
        },
      }),
    });
    const out = await fetchBirdeyeCandles({
      pair: solPair, tf: "1H", fromUnix: 100, toUnix: 2000, apiKey: "k",
    });
    expect(out).toEqual([
      { timestamp: 1_000_000, open: 100, high: 110, low: 95, close: 105, volume: 12345 },
      { timestamp: 2_000_000, open: 105, high: 115, low: 100, close: 110, volume: 23456 },
    ]);
  });

  it("sends x-api-key + x-chain headers", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: { items: [] } }),
    });
    vi.stubGlobal("fetch", mock);
    await fetchBirdeyeCandles({
      pair: solPair, tf: "1H", fromUnix: 0, toUnix: 1000, apiKey: "secret-key",
    });
    const init = mock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("secret-key");
    expect(headers["x-chain"]).toBe("solana");
  });

  it("throws BirdeyeAuthError on 401", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 401, text: () => Promise.resolve("invalid key"),
    });
    await expect(
      fetchBirdeyeCandles({ pair: solPair, tf: "1H", fromUnix: 0, toUnix: 1, apiKey: "bad" }),
    ).rejects.toBeInstanceOf(BirdeyeAuthError);
  });

  it("throws BirdeyeRateLimitError on 429", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 429, text: () => Promise.resolve("rate limited"),
    });
    await expect(
      fetchBirdeyeCandles({ pair: solPair, tf: "1H", fromUnix: 0, toUnix: 1, apiKey: "k" }),
    ).rejects.toBeInstanceOf(BirdeyeRateLimitError);
  });

  it("throws BirdeyeError on other HTTP failure", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 503, text: () => Promise.resolve("upstream"),
    });
    await expect(
      fetchBirdeyeCandles({ pair: solPair, tf: "1H", fromUnix: 0, toUnix: 1, apiKey: "k" }),
    ).rejects.toBeInstanceOf(BirdeyeError);
  });

  it("throws BirdeyeError when pair has no birdeyeTokenAddress", async () => {
    const btcPair: ResolvedPair = {
      base: "BTC", quote: "USD",
      pyth: { pythSymbol: "Crypto.BTC/USD", pythFeedId: "0x1" },
    };
    await expect(
      fetchBirdeyeCandles({ pair: btcPair, tf: "1H", fromUnix: 0, toUnix: 1, apiKey: "k" }),
    ).rejects.toThrow(/no Birdeye/);
  });
});

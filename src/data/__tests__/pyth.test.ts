import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPythCandles, tfToPythResolution } from "../pyth";
import type { ResolvedPair } from "../pairs";

const btcPair: ResolvedPair = {
  base: "BTC",
  quote: "USD",
  pyth: { pythSymbol: "Crypto.BTC/USD", pythFeedId: "0xdeadbeef" },
};

describe("tfToPythResolution", () => {
  it.each([
    ["1m", "1"],
    ["5m", "5"],
    ["15m", "15"],
    ["1H", "60"],
    ["4H", "240"],
    ["1D", "1D"],
    ["1W", "1W"],
  ])("maps %s → %s", (tf, expected) => {
    expect(tfToPythResolution(tf as never)).toBe(expected);
  });
});

describe("fetchPythCandles", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns empty array on status='no_data'", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ s: "no_data" }),
    });
    const out = await fetchPythCandles({ pair: btcPair, tf: "1H", fromUnix: 100, toUnix: 200 });
    expect(out).toEqual([]);
  });

  it("converts response arrays to Candle[] with ms timestamps", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        s: "ok",
        t: [1000, 2000],
        o: [100, 105],
        h: [110, 115],
        l: [95, 100],
        c: [105, 110],
        v: [0, 0],
      }),
    });
    const out = await fetchPythCandles({ pair: btcPair, tf: "1H", fromUnix: 100, toUnix: 2000 });
    expect(out).toEqual([
      { timestamp: 1_000_000, open: 100, high: 110, low: 95, close: 105, volume: 0 },
      { timestamp: 2_000_000, open: 105, high: 115, low: 100, close: 110, volume: 0 },
    ]);
  });

  it("hits the correct URL with resolution + bounds", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ s: "no_data" }),
    });
    vi.stubGlobal("fetch", mock);
    await fetchPythCandles({ pair: btcPair, tf: "4H", fromUnix: 100, toUnix: 200 });
    const url = mock.mock.calls[0][0] as string;
    expect(url).toContain("symbol=Crypto.BTC%2FUSD");
    expect(url).toContain("resolution=240");
    expect(url).toContain("from=100");
    expect(url).toContain("to=200");
  });

  it("throws PythError on HTTP failure", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: () => Promise.resolve("upstream down"),
    });
    await expect(
      fetchPythCandles({ pair: btcPair, tf: "1H", fromUnix: 100, toUnix: 200 }),
    ).rejects.toThrow(/Pyth/);
  });

  it("throws when pair has no Pyth feed", async () => {
    const noPyth: ResolvedPair = { base: "ZZZZ", quote: "USD", pyth: null };
    await expect(
      fetchPythCandles({ pair: noPyth, tf: "1H", fromUnix: 100, toUnix: 200 }),
    ).rejects.toThrow(/no Pyth feed/);
  });
});

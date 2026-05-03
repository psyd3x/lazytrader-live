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

describe("fetchPythCandles pagination", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("makes a single request for 1H even over 1-year span", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ s: "no_data" }),
    });
    vi.stubGlobal("fetch", mock);
    const from = 0;
    const to = 2 * 365 * 24 * 3600; // 2 years
    await fetchPythCandles({ pair: btcPair, tf: "1H", fromUnix: from, toUnix: to });
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("paginates 1W in 1-year chunks when span > 1 year", async () => {
    const mock = vi.fn();
    // span = ~2.5 years → 3 chunks
    mock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({
      s: "ok", t: [100], o: [1], h: [1], l: [1], c: [1], v: [0],
    }) });
    mock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({
      s: "ok", t: [200], o: [2], h: [2], l: [2], c: [2], v: [0],
    }) });
    mock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({
      s: "ok", t: [300], o: [3], h: [3], l: [3], c: [3], v: [0],
    }) });
    vi.stubGlobal("fetch", mock);

    const from = 0;
    const to = Math.floor(2.5 * 365 * 24 * 3600);
    const out = await fetchPythCandles({ pair: btcPair, tf: "1W", fromUnix: from, toUnix: to });
    expect(mock).toHaveBeenCalledTimes(3);
    expect(out.map((c) => c.close)).toEqual([1, 2, 3]);
  });

  it("does not paginate 1W when span <= 1 year", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ s: "no_data" }),
    });
    vi.stubGlobal("fetch", mock);
    await fetchPythCandles({
      pair: btcPair, tf: "1W", fromUnix: 0, toUnix: 365 * 24 * 3600 - 1,
    });
    expect(mock).toHaveBeenCalledTimes(1);
  });
});

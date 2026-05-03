import { describe, expect, it, vi } from "vitest";

// All mocks must come BEFORE the actual imports
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
vi.mock("../cache", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../cache")>();
  return { ...mod, candleCache: new mod.CandleCache() };
});

// NOW import the modules we're testing
import { latestClose } from "../feed";
import type { Candle } from "../../smc";

const c = (close: number): Candle => ({
  timestamp: 1000, open: close, high: close, low: close, close, volume: 0,
});

describe("latestClose", () => {
  it("prefers 1m last candle", () => {
    expect(latestClose({ "1m": [c(101)], "1H": [c(200)] })).toBe(101);
  });
  it("falls back to 5m when no 1m", () => {
    expect(latestClose({ "5m": [c(102)], "1H": [c(200)] })).toBe(102);
  });
  it("falls back to 15m when no 1m or 5m", () => {
    expect(latestClose({ "15m": [c(103)], "1H": [c(200)] })).toBe(103);
  });
  it("falls back to any TF when no preferred TF available", () => {
    expect(latestClose({ "4H": [c(104)] })).toBe(104);
  });
  it("returns last candle, not first", () => {
    expect(latestClose({ "1H": [c(100), c(110), c(120)] })).toBe(120);
  });
  it("returns null on empty bundle", () => {
    expect(latestClose({})).toBeNull();
  });
  it("skips empty TF arrays", () => {
    expect(latestClose({ "1m": [], "1H": [c(200)] })).toBe(200);
  });
});

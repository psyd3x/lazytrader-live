import { describe, expect, it } from "vitest";
import { normalizePairInput, resolveToPythFeed } from "../pairs";

describe("normalizePairInput", () => {
  it("treats bare ticker as USD-quoted", () => {
    expect(normalizePairInput("BTC")).toEqual({ base: "BTC", quote: "USD" });
  });
  it("strips $ prefix", () => {
    expect(normalizePairInput("$BTC")).toEqual({ base: "BTC", quote: "USD" });
  });
  it("uppercases lowercase input", () => {
    expect(normalizePairInput("btc")).toEqual({ base: "BTC", quote: "USD" });
  });
  it("parses concatenated USDT pair", () => {
    expect(normalizePairInput("BTCUSDT")).toEqual({ base: "BTC", quote: "USDT" });
  });
  it("parses slash-separated pair", () => {
    expect(normalizePairInput("BTC/USDT")).toEqual({ base: "BTC", quote: "USDT" });
  });
  it("parses dash-separated pair", () => {
    expect(normalizePairInput("BTC-USDT")).toEqual({ base: "BTC", quote: "USDT" });
  });
  it("parses underscore-separated pair", () => {
    expect(normalizePairInput("BTC_USDT")).toEqual({ base: "BTC", quote: "USDT" });
  });
  it("parses USDC quote", () => {
    expect(normalizePairInput("SOLUSDC")).toEqual({ base: "SOL", quote: "USDC" });
  });
  it("treats PERP suffix as USD quote", () => {
    expect(normalizePairInput("BTC-PERP")).toEqual({ base: "BTC", quote: "USD" });
  });
  it("treats USD suffix correctly", () => {
    expect(normalizePairInput("BTCUSD")).toEqual({ base: "BTC", quote: "USD" });
  });
  it("handles 4-char base (e.g. BONK)", () => {
    expect(normalizePairInput("BONKUSDT")).toEqual({ base: "BONK", quote: "USDT" });
  });
  it("trims whitespace", () => {
    expect(normalizePairInput("  btc  ")).toEqual({ base: "BTC", quote: "USD" });
  });
  it("returns null for empty string", () => {
    expect(normalizePairInput("")).toBeNull();
  });
  it("returns null for whitespace only", () => {
    expect(normalizePairInput("   ")).toBeNull();
  });
  it("returns null for unparseable garbage", () => {
    expect(normalizePairInput("!!!@#$")).toBeNull();
  });
  it("returns null for too-short base (1 char)", () => {
    expect(normalizePairInput("X")).toBeNull();
  });
  it("returns null for too-long base (>6 chars)", () => {
    expect(normalizePairInput("TOOLONGBASE")).toBeNull();
  });
});

describe("resolveToPythFeed", () => {
  it("resolves BTC to Crypto.BTC/USD", () => {
    const r = resolveToPythFeed("BTC");
    expect(r).not.toBeNull();
    expect(r!.base).toBe("BTC");
    expect(r!.pyth).not.toBeNull();
    expect(r!.pyth!.pythSymbol).toBe("Crypto.BTC/USD");
    expect(r!.pyth!.pythFeedId).toMatch(/^[0-9a-fx]+$/i);
  });
  it("resolves $BTC same as BTC", () => {
    const a = resolveToPythFeed("$BTC");
    const b = resolveToPythFeed("BTC");
    expect(a?.pyth?.pythSymbol).toBe(b?.pyth?.pythSymbol);
  });
  it("collapses USDT/USDC quote to USD-quoted Pyth feed", () => {
    const r = resolveToPythFeed("BTCUSDT");
    expect(r?.pyth?.pythSymbol).toBe("Crypto.BTC/USD");
  });
  it("attaches birdeyeTokenAddress for SOL", () => {
    const r = resolveToPythFeed("SOL");
    expect(r?.birdeyeTokenAddress).toBe("So11111111111111111111111111111111111111112");
  });
  it("leaves birdeyeTokenAddress undefined for BTC (no SPL mint)", () => {
    const r = resolveToPythFeed("BTC");
    expect(r?.birdeyeTokenAddress).toBeUndefined();
  });
  it("returns null when normalizer fails", () => {
    expect(resolveToPythFeed("!!!")).toBeNull();
  });
  it("returns ResolvedPair with pyth=null when base not in catalog", () => {
    const r = resolveToPythFeed("ZZZNOTAREALCOINPLZ");
    // Normalizer rejects >6 chars, so this is null
    expect(r).toBeNull();
  });
  it("returns ResolvedPair with pyth=null for valid-shape but unknown base", () => {
    // 4-char base passes normalizer but unlikely to be on Pyth
    const r = resolveToPythFeed("ZZZZ");
    expect(r).not.toBeNull();
    expect(r!.pyth).toBeNull();
  });
});

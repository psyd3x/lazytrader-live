import { describe, expect, it } from "vitest";
import { normalizePairInput } from "../pairs";

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

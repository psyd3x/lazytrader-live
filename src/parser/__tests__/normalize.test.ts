import { describe, expect, it } from "vitest";
import {
  closerToEntry,
  expandPair,
  inferDirection,
  midpoint,
  parseDollarsAmount,
} from "../normalize";

describe("parseDollarsAmount", () => {
  it("parses bare integer", () => {
    expect(parseDollarsAmount("1234")).toBe(1234);
  });
  it("strips $ prefix", () => {
    expect(parseDollarsAmount("$1234")).toBe(1234);
  });
  it("strips comma thousands separators", () => {
    expect(parseDollarsAmount("$71,600")).toBe(71600);
  });
  it("parses decimal with $", () => {
    expect(parseDollarsAmount("$0.0001")).toBe(0.0001);
  });
  it("trims whitespace", () => {
    expect(parseDollarsAmount("  $42.5  ")).toBe(42.5);
  });
  it("returns null on garbage", () => {
    expect(parseDollarsAmount("not a number")).toBeNull();
  });
  it("returns null on empty", () => {
    expect(parseDollarsAmount("")).toBeNull();
  });
});

describe("inferDirection", () => {
  it("returns long when SL below entry", () => {
    expect(inferDirection({ entry: 100, stopLoss: 99 })).toBe("long");
  });
  it("returns short when SL above entry", () => {
    expect(inferDirection({ entry: 100, stopLoss: 101 })).toBe("short");
  });
  it("throws when SL equals entry", () => {
    expect(() => inferDirection({ entry: 100, stopLoss: 100 })).toThrow();
  });
});

describe("expandPair", () => {
  it("appends USDT when no quote given", () => {
    expect(expandPair("BTC")).toBe("BTCUSDT");
  });
  it("uppercases the base", () => {
    expect(expandPair("btc")).toBe("BTCUSDT");
  });
  it("uses provided quote", () => {
    expect(expandPair("BTC", "USD")).toBe("BTCUSD");
  });
  it("trims whitespace", () => {
    expect(expandPair("  BTC  ")).toBe("BTCUSDT");
  });
});

describe("midpoint", () => {
  it("computes (a+b)/2", () => {
    expect(midpoint(10, 20)).toBe(15);
  });
  it("works for floats", () => {
    expect(midpoint(0.9966, 0.9941)).toBeCloseTo(0.99535, 5);
  });
  it("works regardless of order", () => {
    expect(midpoint(20, 10)).toBe(15);
  });
});

describe("closerToEntry", () => {
  // Long side
  it("long SL: picks higher of {low, high} (closer to entry from below)", () => {
    expect(closerToEntry(95, 99, 100, "long", "sl")).toBe(99);
  });
  it("long TP: picks lower of {low, high} (closer to entry from above)", () => {
    expect(closerToEntry(110, 115, 100, "long", "tp")).toBe(110);
  });
  // Short side
  it("short SL: picks lower of {low, high} (closer to entry from above)", () => {
    expect(closerToEntry(101, 105, 100, "short", "sl")).toBe(101);
  });
  it("short TP: picks higher of {low, high} (closer to entry from below)", () => {
    expect(closerToEntry(90, 95, 100, "short", "tp")).toBe(95);
  });
  it("works regardless of input order", () => {
    expect(closerToEntry(99, 95, 100, "long", "sl")).toBe(99);
    expect(closerToEntry(115, 110, 100, "long", "tp")).toBe(110);
  });
});

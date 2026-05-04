import { describe, expect, it } from "vitest";
import { ParsedSignalSchema } from "../schema";

const validBase = {
  pair: "BTCUSDT",
  direction: "long" as const,
  entry: 70000,
  stopLoss: 69000,
  takeProfits: [71000, 72000, 73000],
  leverage: 10,
  source: "regex" as const,
  rawText: "raw signal text here",
  multipleTrades: false,
  notes: null,
  entryRange: null,
};

describe("ParsedSignalSchema", () => {
  it("accepts a well-formed long signal", () => {
    expect(() => ParsedSignalSchema.parse(validBase)).not.toThrow();
  });
  it("accepts source = claude", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, source: "claude" })).not.toThrow();
  });
  it("accepts source = gpt-4o-mini", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, source: "gpt-4o-mini" })).not.toThrow();
  });
  it("accepts leverage = null", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, leverage: null })).not.toThrow();
  });
  it("accepts notes string", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, notes: "MARKET entry; SL-BE at TP1" })).not.toThrow();
  });
  it("accepts entryRange tuple", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, entryRange: [69900, 70100] })).not.toThrow();
  });
  it("accepts multipleTrades = true", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, multipleTrades: true })).not.toThrow();
  });
  it("rejects negative entry", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, entry: -1 })).toThrow();
  });
  it("rejects negative stopLoss", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, stopLoss: 0 })).toThrow();
  });
  it("rejects empty takeProfits", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, takeProfits: [] })).toThrow();
  });
  it("rejects more than 10 takeProfits", () => {
    expect(() =>
      ParsedSignalSchema.parse({ ...validBase, takeProfits: Array(11).fill(71000) }),
    ).toThrow();
  });
  it("rejects invalid direction", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, direction: "buy" })).toThrow();
  });
  it("rejects invalid source", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, source: "regex-v2" })).toThrow();
  });
  it("rejects pair too short", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, pair: "B" })).toThrow();
  });
  it("rejects missing required field", () => {
    const { stopLoss: _omit, ...partial } = validBase;
    expect(() => ParsedSignalSchema.parse(partial)).toThrow();
  });
});

// src/smc/__tests__/uiSizing.test.ts
//
// Tests for computeSizingPreview — the read-only sizing block rendered in
// ParsedSignalCard during M4. Trader-intuitive convention:
//   margin       = riskAmount (= accountBalance × maxRiskPct)
//   idealLev     = 1 / slDistancePct
//   cappedLev    = min(idealLev, maxLeverage)
//   notional     = margin × cappedLev
//   actualRisk   = notional × slDistancePct
//   capBinds     = idealLev > maxLeverage
//
// Cap-binds threshold is slDistancePct < 1/maxLeverage (= 4% at maxLev=25).
// When cap binds, actualRisk is below the intended budget — we surface a
// warning so the user knows their risk is under-utilized at the leverage cap.

import { describe, expect, test } from "vitest";

import type { ParsedSignal } from "../../parser/schema";
import { computeSizingPreview } from "../uiSizing";

const RISK_RULES = { accountBalance: 1000, maxRiskPct: 1.0, maxLeverage: 25 };

function signal(overrides: Partial<ParsedSignal>): ParsedSignal {
  return {
    pair: "TESTUSDT",
    direction: "long",
    entry: 100,
    stopLoss: 90,
    takeProfits: [110],
    leverage: null,
    source: "regex",
    rawText: "stub",
    multipleTrades: false,
    notes: null,
    entryRange: null,
    ...overrides,
  };
}

describe("computeSizingPreview", () => {
  test("returns null when parsed is null", () => {
    expect(computeSizingPreview(null, RISK_RULES)).toBeNull();
  });

  test("returns null when SL equals entry", () => {
    const result = computeSizingPreview(signal({ entry: 100, stopLoss: 100 }), RISK_RULES);
    expect(result).toBeNull();
  });

  test("DOGE Sheldon — uncapped, full risk budget reached", () => {
    // entry=0.103, SL=0.095 → slDist = 0.008/0.103 = 7.7670%
    // idealLev = 1/0.07767 = 12.875× → uncapped (≤25)
    // margin = $10, notional = $128.75, actualRisk = $10
    const result = computeSizingPreview(
      signal({ entry: 0.103, stopLoss: 0.095 }),
      RISK_RULES,
    );
    expect(result).not.toBeNull();
    expect(result!.margin).toBeCloseTo(10, 2);
    expect(result!.leverage).toBe(13); // Math.round(12.875)
    expect(result!.risk).toBeCloseTo(10, 2);
    expect(result!.riskPct).toBeCloseTo(1.0, 2);
    expect(result!.capBinds).toBe(false);
    expect(result!.intendedRiskPct).toBe(1.0);
    expect(result!.maxLeverage).toBe(25);
  });

  test("AAVE Kapoor — cap binds at 3% SL distance", () => {
    // entry=98.7, SL=95.73 → slDist = 2.97/98.7 = 3.0091%
    // idealLev = 1/0.030091 = 33.233× → CAPPED at 25
    // margin = $10, notional = $250, actualRisk = $250×0.030091 = $7.523
    const result = computeSizingPreview(
      signal({ entry: 98.7, stopLoss: 95.73 }),
      RISK_RULES,
    );
    expect(result).not.toBeNull();
    expect(result!.margin).toBeCloseTo(10, 2);
    expect(result!.leverage).toBe(25);
    expect(result!.risk).toBeCloseTo(7.52, 2);
    expect(result!.riskPct).toBeCloseTo(0.752, 2);
    expect(result!.capBinds).toBe(true);
  });

  test("very tight SL — heavy cap-binds with under-risked actual", () => {
    // entry=100, SL=99.3 → slDist = 0.7%
    // idealLev = 1/0.007 = 142.86× → CAPPED at 25
    // margin = $10, notional = $250, actualRisk = $250×0.007 = $1.75
    const result = computeSizingPreview(
      signal({ entry: 100, stopLoss: 99.3 }),
      RISK_RULES,
    );
    expect(result).not.toBeNull();
    expect(result!.leverage).toBe(25);
    expect(result!.risk).toBeCloseTo(1.75, 2);
    expect(result!.riskPct).toBeCloseTo(0.175, 3);
    expect(result!.capBinds).toBe(true);
  });

  test("exactly at cap — does NOT bind (strict >)", () => {
    // slDist = 4% exactly → idealLev = 25 → equals cap → not capBinds
    const result = computeSizingPreview(
      signal({ entry: 100, stopLoss: 96 }),
      RISK_RULES,
    );
    expect(result).not.toBeNull();
    expect(result!.leverage).toBe(25);
    expect(result!.risk).toBeCloseTo(10, 2);
    expect(result!.capBinds).toBe(false);
  });

  test("SHORT direction — SL above entry, math still works", () => {
    // ETH SHORT: entry=2347.5, SL=2410 → slDist = |2347.5-2410|/2347.5 = 62.5/2347.5 = 2.6624%
    // idealLev = 1/0.026624 = 37.56× → CAPPED at 25
    const result = computeSizingPreview(
      signal({ entry: 2347.5, stopLoss: 2410, direction: "short" }),
      RISK_RULES,
    );
    expect(result).not.toBeNull();
    expect(result!.leverage).toBe(25);
    expect(result!.capBinds).toBe(true);
    expect(result!.riskPct).toBeLessThan(1.0);
  });

  test("custom risk rules respected (M8 prep)", () => {
    // accountBalance=$5000, maxRiskPct=0.5%, maxLev=10×
    // riskAmount = $25, slDist=5% → idealLev = 20 → CAPPED at 10
    // margin = $25, notional = $250, actualRisk = $250×0.05 = $12.5, riskPct=0.25
    const result = computeSizingPreview(signal({ entry: 100, stopLoss: 95 }), {
      accountBalance: 5000,
      maxRiskPct: 0.5,
      maxLeverage: 10,
    });
    expect(result).not.toBeNull();
    expect(result!.margin).toBeCloseTo(25, 2);
    expect(result!.leverage).toBe(10);
    expect(result!.risk).toBeCloseTo(12.5, 2);
    expect(result!.riskPct).toBeCloseTo(0.25, 2);
    expect(result!.capBinds).toBe(true);
    expect(result!.intendedRiskPct).toBe(0.5);
    expect(result!.maxLeverage).toBe(10);
  });
});

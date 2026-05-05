// src/smc/uiSizing.ts
//
// Pure UI sizing math — derives the read-only sizing preview shown in
// ParsedSignalCard during M4. Lives under smc/ (not screens/) so vitest's
// pure-TS config picks it up without dragging React Native into the test
// runtime, and because risk/sizing math is conceptually engine territory.
//
// Convention (trader-intuitive, matches §10 / Q10 of the M4 design spec):
//   margin       = accountBalance × maxRiskPct/100      // intended risk budget
//   slDistancePct= |entry - stopLoss| / entry
//   idealLev     = 1 / slDistancePct                    // leverage that makes
//                                                         margin-loss-at-SL == margin
//   cappedLev    = min(idealLev, maxLeverage)
//   notional     = margin × cappedLev
//   actualRisk   = notional × slDistancePct
//   capBinds     = idealLev > maxLeverage
//
// When the cap binds (slDistancePct < 1/maxLev — at maxLev=25 that's <4%),
// actualRisk falls below the user's intended budget, surfaced as a warning.

import type { ParsedSignal } from "../parser/schema";

export interface SizingPreview {
  margin: number;
  leverage: number;
  risk: number;
  riskPct: number;
  capBinds: boolean;
  intendedRiskPct: number;
  maxLeverage: number;
}

export interface RiskRulesInput {
  accountBalance: number;
  maxRiskPct: number;
  maxLeverage: number;
}

export function computeSizingPreview(
  parsed: Pick<ParsedSignal, "entry" | "stopLoss"> | null,
  rules: RiskRulesInput,
): SizingPreview | null {
  if (!parsed) return null;
  const { entry, stopLoss } = parsed;
  const slDistancePct = Math.abs(entry - stopLoss) / entry;
  if (!Number.isFinite(slDistancePct) || slDistancePct === 0) return null;

  const { accountBalance, maxRiskPct, maxLeverage } = rules;
  const margin = accountBalance * (maxRiskPct / 100);
  const idealLeverage = 1 / slDistancePct;
  const cappedLeverage = Math.min(idealLeverage, maxLeverage);
  const notional = margin * cappedLeverage;
  const actualRisk = notional * slDistancePct;
  const capBinds = idealLeverage > maxLeverage;

  return {
    margin,
    leverage: Math.round(cappedLeverage),
    risk: actualRisk,
    riskPct: (actualRisk / accountBalance) * 100,
    capBinds,
    intendedRiskPct: maxRiskPct,
    maxLeverage,
  };
}

/**
 * Signal Quality Scorer — SMC/ICT Trade Signal Verification
 *
 * Source: psyd3x/lazytrader@feat/opendeedee-integration src/smc_engine/scorer.py
 *
 * Takes a trading signal + multi-timeframe confluence data and produces a
 * quality rating from A+ (highest conviction) to D (lowest). Uses a weighted
 * probabilistic approach — each factor scores 0..1, weighted by its share of
 * 100, summed to a 0..100 composite that maps to A+/A/B/C/D.
 */

import {
  ENTRY_DISTANCE_AT_ENTRY_PCT,
  ENTRY_DISTANCE_MISSED_PCT,
  getSignalRating,
} from "./config";
import { ConfluenceEngine, type ConfluenceMatrix } from "./confluence";
import { analyzeTimeframe } from "./analyzer";
import type {
  BiasConfig,
  BiasResult,
  Candle,
  EntryStatus,
  SignalInput,
  SignalRating,
  TimeframeAnalysis,
} from "./models";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Per-factor weights summing to 100. Each factor scores 0..1 and is then
 * multiplied by its weight. Final composite = sum of weighted scores.
 */
export const DEFAULT_SCORING_WEIGHTS: Readonly<Record<string, number>> = {
  timeframe_alignment: 25.0,
  entry_quality: 15.0,
  structure: 15.0,
  risk_reward_quality: 15.0,
  htf_trend: 15.0,
  swing_position: 7.5,
  zone_confluence: 7.5,
};

/** Default TP split for weighted R:R: 50% TP1, 30% TP2, 20% TP3. */
export const DEFAULT_TP_WEIGHTS: readonly number[] = [0.5, 0.3, 0.2];

const HTF_KEYS: readonly string[] = ["4H", "1D", "1W"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isLong = (direction: string): boolean =>
  ["long", "bull", "bullish"].includes(direction.toLowerCase());

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface FactorScore {
  /** 0..1 confidence score. */
  score: number;
  /** Human-readable description of how this factor evaluated. */
  detail: string;
}

export interface ScoreReport {
  rating: SignalRating;
  /** Composite 0..100, rounded to 1 decimal. */
  score: number;
  scoreMultiplier: number;
  /** Weighted R:R to take-profit set, rounded to 2 decimals. */
  riskReward: number;
  /** Distance current → entry as a percentage of entry, rounded to 3 decimals. */
  entryDistancePct: number;
  entryStatus: EntryStatus;
  factors: Record<string, FactorScore>;
  /** Natural-language one-sentence explanation. */
  justification: string;
}

export interface PositionSizeResult {
  positionSize: number;
  riskAmount: number;
  riskPct: number;
  slDistancePct: number;
}

export interface SignalScorerOptions {
  scoringWeights?: Record<string, number>;
  tpWeights?: number[];
  htfTimeframes?: string[];
  entryAtPct?: number;
  entryMissedPct?: number;
}

// ---------------------------------------------------------------------------
// SignalScorer
// ---------------------------------------------------------------------------

/** Scores trading signals using SMC/ICT confluence analysis. */
export class SignalScorer {
  readonly weights: Record<string, number>;
  readonly tpWeights: number[];
  readonly htfKeys: string[];
  readonly entryAtPct: number;
  readonly entryMissedPct: number;

  constructor(opts: SignalScorerOptions = {}) {
    this.weights = { ...(opts.scoringWeights ?? DEFAULT_SCORING_WEIGHTS) };
    this.tpWeights = [...(opts.tpWeights ?? DEFAULT_TP_WEIGHTS)];
    this.htfKeys = [...(opts.htfTimeframes ?? HTF_KEYS)];
    this.entryAtPct = opts.entryAtPct ?? ENTRY_DISTANCE_AT_ENTRY_PCT;
    this.entryMissedPct = opts.entryMissedPct ?? ENTRY_DISTANCE_MISSED_PCT;
  }

  // ----- Main entry point ---------------------------------------------------

  /**
   * Score a trading signal against market structure.
   *
   * @param signal - the SignalInput (pair, direction, entry, stopLoss, etc.).
   * @param confluence - BiasResult from ConfluenceEngine.calculateBias().
   * @param currentPrice - live market price.
   * @param tfAnalyses - per-TF analyses for detailed factor scoring (optional).
   */
  scoreSignal(
    signal: SignalInput,
    confluence: BiasResult,
    currentPrice: number,
    tfAnalyses?: Record<string, TimeframeAnalysis>,
  ): ScoreReport {
    const direction = signal.direction;
    const longSignal = isLong(direction);

    const rr = this.calculateRiskReward(
      signal.entry,
      signal.stopLoss,
      signal.takeProfits,
      direction,
    );
    const entryDistPct = this.entryDistancePct(currentPrice, signal.entry);
    const entryStatus = this.entryStatus(currentPrice, signal.entry, longSignal);

    const factors: Record<string, FactorScore> = {
      timeframe_alignment: this.scoreTfAlignment(direction, confluence, tfAnalyses),
      entry_quality: this.assessEntryQuality(signal.entry, direction, tfAnalyses),
      structure: this.scoreStructure(direction, tfAnalyses),
      risk_reward_quality: this.scoreRr(rr),
      htf_trend: this.checkHtfAlignment(direction, tfAnalyses, this.htfKeys),
      swing_position: this.scoreSwingPosition(direction, tfAnalyses),
      zone_confluence: this.scoreZoneConfluence(signal.entry, direction, tfAnalyses),
    };

    let totalScore = 0;
    for (const [name, factor] of Object.entries(factors)) {
      const w = this.weights[name] ?? 0;
      totalScore += factor.score * w;
    }
    totalScore = Math.max(0, Math.min(100, totalScore));

    const { rating, multiplier } = getSignalRating(totalScore);
    const justification = this.buildJustification(direction, factors, confluence, rr);

    return {
      rating,
      score: round1(totalScore),
      scoreMultiplier: multiplier,
      riskReward: round2(rr),
      entryDistancePct: round3(entryDistPct),
      entryStatus,
      factors,
      justification,
    };
  }

  // ----- Risk / Reward ------------------------------------------------------

  /**
   * Weighted-average R:R across the take-profit set.
   * Long: R:R = (TP − entry) / (entry − SL)
   * Short: R:R = (entry − TP) / (SL − entry)
   * Defaults to 50/30/20 split for first 3 TPs; extras share remaining weight.
   */
  calculateRiskReward(
    entry: number,
    stopLoss: number,
    takeProfits: readonly number[],
    direction: string,
  ): number {
    const longSignal = isLong(direction);
    const risk = Math.abs(entry - stopLoss);
    if (risk === 0) return 0;
    if (takeProfits.length === 0) return 0;

    const weights = this.getTpWeights(takeProfits.length);
    let weightedReward = 0;
    for (let i = 0; i < takeProfits.length; i++) {
      const tp = takeProfits[i];
      const reward = longSignal ? tp - entry : entry - tp;
      weightedReward += reward * weights[i];
    }

    if (longSignal) {
      return entry > stopLoss ? weightedReward / (entry - stopLoss) : 0;
    }
    return stopLoss > entry ? weightedReward / (stopLoss - entry) : 0;
  }

  /** Score "is the entry inside any matching OB/FVG zone?" — 0..1. */
  assessEntryQuality(
    entry: number,
    direction: string,
    tfAnalyses?: Record<string, TimeframeAnalysis>,
  ): FactorScore {
    if (!tfAnalyses) return { score: 0.5, detail: "No TF data available for zone check" };

    const targetDir = isLong(direction) ? 1 : -1;
    let zoneHits = 0;
    let zoneChecks = 0;
    const insideZoneTfs: string[] = [];

    for (const [tfStr, tfData] of Object.entries(tfAnalyses)) {
      for (const ob of tfData.activeObs) {
        if (ob.direction === targetDir) {
          zoneChecks++;
          if (ob.bottom <= entry && entry <= ob.top) {
            zoneHits++;
            insideZoneTfs.push(`${tfStr} OB`);
          }
        }
      }
      for (const fvg of tfData.activeFvgs) {
        if (fvg.direction === targetDir) {
          zoneChecks++;
          if (fvg.bottom <= entry && entry <= fvg.top) {
            zoneHits++;
            insideZoneTfs.push(`${tfStr} FVG`);
          }
        }
      }
      if (tfData.nearestOb && tfData.nearestOb.isInside && tfData.nearestOb.direction === targetDir) {
        zoneHits++;
        zoneChecks++;
      }
      if (tfData.nearestFvg && tfData.nearestFvg.isInside && tfData.nearestFvg.direction === targetDir) {
        zoneHits++;
        zoneChecks++;
      }
    }

    if (zoneChecks === 0) {
      return { score: 0.3, detail: "No matching zones found near entry" };
    }

    // Sigmoid-ish: 1 hit = 0.4, 2 = 0.8, 3+ = 1.0
    const confidence = Math.min(1.0, zoneHits * 0.4);
    const detail =
      insideZoneTfs.length > 0
        ? `Entry at ${insideZoneTfs.join(", ")}`
        : "Entry not inside any matching zone";

    return { score: round3(confidence), detail };
  }

  /** Do the higher TFs support the signal direction? — 0..1. */
  checkHtfAlignment(
    direction: string,
    tfAnalyses?: Record<string, TimeframeAnalysis>,
    htfTimeframes: readonly string[] = this.htfKeys,
  ): FactorScore {
    if (!tfAnalyses) return { score: 0.5, detail: "No TF data for HTF check" };

    const target = isLong(direction) ? 1 : -1;
    const supporting: string[] = [];
    const opposing: string[] = [];
    const neutral: string[] = [];

    for (const tfStr of htfTimeframes) {
      const tfData = tfAnalyses[tfStr];
      if (tfData === undefined) continue;
      const structBias = tfData.structure.bias;
      if (structBias === target) supporting.push(tfStr);
      else if (structBias === -target) opposing.push(tfStr);
      else neutral.push(tfStr);
    }

    const total = supporting.length + opposing.length + neutral.length;
    if (total === 0) return { score: 0.5, detail: "No HTF data available" };

    // Position-weighted (later in htfTimeframes = higher TF = more weight)
    const tfWeight: Record<string, number> = {};
    htfTimeframes.forEach((tf, i) => {
      tfWeight[tf] = i + 1;
    });

    const sumWeights = (tfs: string[]): number =>
      tfs.reduce((acc, tf) => acc + (tfWeight[tf] ?? 1), 0);
    const weightedSupport = sumWeights(supporting);
    const weightedOppose = sumWeights(opposing);
    const maxWeight = htfTimeframes.reduce(
      (acc, tf) => acc + (tf in tfAnalyses ? tfWeight[tf] ?? 1 : 0),
      0,
    );

    if (maxWeight === 0) return { score: 0.5, detail: "No HTF data available" };

    const score = clamp01(
      (weightedSupport - weightedOppose + maxWeight) / (2 * maxWeight),
    );

    const parts: string[] = [];
    if (supporting.length > 0) {
      parts.push(`${supporting.join(", ")} ${isLong(direction) ? "bullish" : "bearish"}`);
    }
    if (opposing.length > 0) {
      parts.push(`${opposing.join(", ")} ${isLong(direction) ? "bearish" : "bullish"}`);
    }
    const detail = parts.length > 0 ? parts.join(". ") : "HTFs neutral";

    return { score: round3(score), detail };
  }

  // ----- Internal factor scorers --------------------------------------------

  private scoreTfAlignment(
    direction: string,
    confluence: BiasResult,
    tfAnalyses?: Record<string, TimeframeAnalysis>,
  ): FactorScore {
    const target = isLong(direction) ? 1 : -1;
    const pct = confluence.percentage;

    let score: number;
    if (target > 0) {
      score = pct >= 50 ? Math.max(0, (pct - 50) / 50) : 0;
    } else {
      score = pct <= 50 ? Math.max(0, (50 - pct) / 50) : 0;
    }

    let countStr = "";
    if (tfAnalyses) {
      const engine = new ConfluenceEngine();
      const agreeing = engine.getAgreeingTimeframes(
        direction as "long" | "short",
        tfAnalyses,
      );
      let totalTfs = 0;
      for (const tf of Object.keys(tfAnalyses)) {
        if (engine.getWeight(tf) > 0) totalTfs++;
      }
      if (totalTfs > 0) {
        const tfRatio = agreeing.length / totalTfs;
        score = score * 0.6 + tfRatio * 0.4;
        countStr = ` (${agreeing.length}/${totalTfs} TFs agree)`;
      }
    }

    return {
      score: round3(clamp01(score)),
      detail: `Confluence ${confluence.percentage.toFixed(1)}%${countStr}`,
    };
  }

  private scoreStructure(
    direction: string,
    tfAnalyses?: Record<string, TimeframeAnalysis>,
  ): FactorScore {
    if (!tfAnalyses) return { score: 0.5, detail: "No structure data" };

    const longSignal = isLong(direction);
    const supportingTfs: string[] = [];
    let totalScored = 0;

    for (const [tfStr, tfData] of Object.entries(tfAnalyses)) {
      const labels = tfData.structure.labels;
      if (labels.length === 0) continue;
      totalScored++;

      let bullish = 0;
      let bearish = 0;
      for (const l of labels) {
        if (longSignal) {
          if (l === "HH" || l === "HL") bullish++;
          else if (l === "LH" || l === "LL") bearish++;
        } else {
          if (l === "LH" || l === "LL") bullish++; // reversed semantics
          else if (l === "HH" || l === "HL") bearish++;
        }
      }
      if (bullish > bearish) supportingTfs.push(tfStr);
    }

    if (totalScored === 0) {
      return { score: 0.5, detail: "No structure labels available" };
    }

    const score = supportingTfs.length / totalScored;
    const detail =
      supportingTfs.length > 0
        ? `Structure supports on ${supportingTfs.join(", ")}`
        : "Structure does not support direction";
    return { score: round3(score), detail };
  }

  /** Logarithmic R:R curve: rr=1→0.41, rr=2→0.61, rr=3→0.84, rr=4→1.0. */
  private scoreRr(rr: number): FactorScore {
    if (rr <= 0) return { score: 0, detail: "Invalid R:R (negative or zero)" };
    const score = clamp01(Math.log(rr + 0.5) / Math.log(4.5));
    let quality: string;
    if (rr >= 3.0) quality = "Excellent";
    else if (rr >= 2.0) quality = "Good";
    else if (rr >= 1.0) quality = "Acceptable";
    else quality = "Poor";
    return { score: round3(score), detail: `R:R ${rr.toFixed(2)} (${quality})` };
  }

  private scoreSwingPosition(
    direction: string,
    tfAnalyses?: Record<string, TimeframeAnalysis>,
  ): FactorScore {
    if (!tfAnalyses) return { score: 0.5, detail: "No swing data" };

    const longSignal = isLong(direction);
    const positions: number[] = [];
    for (const tfData of Object.values(tfAnalyses)) {
      const pos = tfData.swing.positionPct;
      if (pos > 0 || tfData.swing.high > 0) positions.push(pos);
    }
    if (positions.length === 0) {
      return { score: 0.5, detail: "No swing position data" };
    }

    const avgPos = positions.reduce((a, b) => a + b, 0) / positions.length;
    let score = longSignal ? 1.0 - avgPos / 100.0 : avgPos / 100.0;
    score = clamp01(score);

    let posDesc = `Avg swing position ${avgPos.toFixed(0)}%`;
    posDesc += longSignal
      ? " (lower is better for longs)"
      : " (higher is better for shorts)";
    return { score: round3(score), detail: posDesc };
  }

  private scoreZoneConfluence(
    entry: number,
    direction: string,
    tfAnalyses?: Record<string, TimeframeAnalysis>,
  ): FactorScore {
    if (!tfAnalyses) return { score: 0.3, detail: "No zone data" };

    const targetDir = isLong(direction) ? 1 : -1;
    let obAtEntry = 0;
    let fvgAtEntry = 0;
    const overlapTfs: string[] = [];

    for (const [tfStr, tfData] of Object.entries(tfAnalyses)) {
      let hasOb = false;
      let hasFvg = false;
      for (const ob of tfData.activeObs) {
        if (ob.direction === targetDir && ob.bottom <= entry && entry <= ob.top) {
          hasOb = true;
        }
      }
      for (const fvg of tfData.activeFvgs) {
        if (fvg.direction === targetDir && fvg.bottom <= entry && entry <= fvg.top) {
          hasFvg = true;
        }
      }
      if (hasOb) obAtEntry++;
      if (hasFvg) fvgAtEntry++;
      if (hasOb && hasFvg) overlapTfs.push(tfStr);
    }

    const totalZones = obAtEntry + fvgAtEntry;
    if (totalZones === 0) return { score: 0.1, detail: "No zones at entry level" };

    // 1 zone = 0.3, 2 = 0.6, 3+ = 0.85, OB+FVG overlap = bonus
    const baseScore = Math.min(1.0, totalZones * 0.3);
    const overlapBonus = Math.min(0.15, overlapTfs.length * 0.15);
    const score = Math.min(1.0, baseScore + overlapBonus);

    const parts: string[] = [];
    if (obAtEntry) parts.push(`${obAtEntry} OB`);
    if (fvgAtEntry) parts.push(`${fvgAtEntry} FVG`);
    if (overlapTfs.length > 0) {
      parts.push(`OB+FVG overlap on ${overlapTfs.join(", ")}`);
    }
    return { score: round3(score), detail: parts.join(" | ") };
  }

  // ----- Entry helpers ------------------------------------------------------

  private entryDistancePct(currentPrice: number, entry: number): number {
    if (entry === 0) return 0;
    return ((currentPrice - entry) / entry) * 100;
  }

  private entryStatus(
    currentPrice: number,
    entry: number,
    longSignal: boolean,
  ): EntryStatus {
    const distPct = Math.abs(this.entryDistancePct(currentPrice, entry));
    if (distPct <= this.entryAtPct) return "at_entry";

    if (longSignal) {
      if (currentPrice < entry) return "approaching";
      return distPct > this.entryMissedPct ? "missed" : "approaching";
    }
    if (currentPrice > entry) return "approaching";
    return distPct > this.entryMissedPct ? "missed" : "approaching";
  }

  // ----- TP weight helpers --------------------------------------------------

  /** Weight vector for N TPs — uses configured weights for first N, splits remainder equally, normalizes to sum=1. */
  private getTpWeights(tpCount: number): number[] {
    if (tpCount === 0) return [];
    if (tpCount === 1) return [1.0];

    const base = this.tpWeights.slice(0, tpCount);
    if (base.length < tpCount) {
      const usedWeight = base.reduce((a, b) => a + b, 0);
      const remaining = 1.0 - usedWeight;
      const extraCount = tpCount - base.length;
      const extraWeight = extraCount > 0 ? remaining / extraCount : 0;
      for (let i = 0; i < extraCount; i++) base.push(extraWeight);
    }

    const total = base.reduce((a, b) => a + b, 0);
    if (total > 0) return base.map((w) => w / total);
    return base;
  }

  // ----- Justification ------------------------------------------------------

  private buildJustification(
    direction: string,
    factors: Record<string, FactorScore>,
    _confluence: BiasResult,
    rr: number,
  ): string {
    const parts: string[] = [];
    const longSignal = isLong(direction);
    const dirWord = longSignal ? "bullish" : "bearish";

    const htf = factors.htf_trend;
    if (htf && htf.score >= 0.7) {
      parts.push(`Strong HTF alignment (${htf.detail})`);
    } else if (htf && htf.score >= 0.4) {
      parts.push("Moderate HTF support");
    } else {
      parts.push("Weak HTF alignment");
    }

    const entryQ = factors.entry_quality;
    if (entryQ && entryQ.score >= 0.6) {
      parts.push(`Entry at key zone (${entryQ.detail})`);
    }

    const struct = factors.structure;
    if (struct && struct.score < 0.4) parts.push("Structure mixed or opposing");

    if (rr >= 2.0) parts.push(`R:R ${rr.toFixed(1)}`);
    else if (rr < 1.0 && rr > 0) parts.push(`Low R:R ${rr.toFixed(1)}`);

    const zone = factors.zone_confluence;
    if (zone && zone.score >= 0.7) parts.push("Strong zone confluence");

    const swing = factors.swing_position;
    if (swing && swing.score < 0.3) parts.push("Unfavorable swing position");

    return parts.length > 0 ? parts.join(". ") + "." : `Signal ${dirWord}, limited data.`;
  }
}

// ===========================================================================
// Position sizing
// ===========================================================================

export interface PositionSizeOpts {
  accountBalance: number;
  entry: number;
  stopLoss: number;
  /** From signal rating (A+=1.5, D=0.5). */
  scoreMultiplier: number;
  /** Maximum risk per trade as percentage of balance (default 1.0 = 1%). */
  maxRiskPct?: number;
  /** Leverage multiplier (default 1 = no leverage). */
  leverage?: number;
}

/**
 * Position size from risk-management rules.
 *
 *   size = (balance × maxRiskPct/100) / slDistance × scoreMultiplier × entry × leverage
 */
export function calculatePositionSize(opts: PositionSizeOpts): PositionSizeResult {
  const {
    accountBalance,
    entry,
    stopLoss,
    scoreMultiplier,
    maxRiskPct = 1.0,
    leverage = 1,
  } = opts;

  const slDistance = Math.abs(entry - stopLoss);
  if (slDistance === 0 || entry === 0) {
    return { positionSize: 0, riskAmount: 0, riskPct: 0, slDistancePct: 0 };
  }

  const slDistancePct = (slDistance / entry) * 100;
  const riskAmount = accountBalance * (maxRiskPct / 100) * scoreMultiplier;
  const positionSize = (riskAmount / slDistance) * entry;
  const positionSizeWithLeverage = positionSize * leverage;

  return {
    positionSize: round2(positionSizeWithLeverage),
    riskAmount: round2(riskAmount),
    riskPct: round3(maxRiskPct * scoreMultiplier),
    slDistancePct: round3(slDistancePct),
  };
}

// ===========================================================================
// Convenience pipeline — full verification
// ===========================================================================

export interface RiskRules {
  maxRiskPct?: number;
  maxLeverage?: number;
}

export interface SignalVerificationReport {
  signal: SignalInput;
  currentPrice: number;
  confluence: {
    bias: BiasResult;
    matrix: ConfluenceMatrix;
  };
  scoring: ScoreReport;
  positionSizing: PositionSizeResult | null;
  timeframeAnalyses: Record<string, TimeframeAnalysis>;
}

export interface GenerateSignalVerificationOpts {
  signal: SignalInput;
  /** TF → newest-last OHLCV bars. */
  candleData: Record<string, readonly Candle[]>;
  currentPrice: number;
  accountBalance?: number;
  riskRules?: RiskRules;
  biasConfig?: BiasConfig;
  timeframeWeights?: Record<string, number>;
}

/**
 * Full pipeline: per-TF analyze → confluence → score signal → position size.
 *
 * Call this once per signal. Pass either raw `Candle[]` per TF (the analyzer
 * runs internally) or a pre-built `TimeframeAnalysis` map via a custom path.
 */
export function generateSignalVerification(
  opts: GenerateSignalVerificationOpts,
): SignalVerificationReport {
  const {
    signal,
    candleData,
    currentPrice,
    accountBalance,
    riskRules = {},
    biasConfig,
    timeframeWeights,
  } = opts;

  // 1. Per-TF analysis
  const tfAnalyses: Record<string, TimeframeAnalysis> = {};
  for (const [tfStr, candles] of Object.entries(candleData)) {
    if (!candles || candles.length === 0) continue;
    tfAnalyses[tfStr] = analyzeTimeframe(candles, tfStr);
  }

  // 2. Confluence
  const engine = new ConfluenceEngine({ biasConfig, timeframeWeights });
  const confluence = engine.calculateBias(tfAnalyses);
  const matrix = engine.calculateConfluenceMatrix(tfAnalyses);

  // 3. Score
  const scorer = new SignalScorer();
  const scoreResult = scorer.scoreSignal(signal, confluence, currentPrice, tfAnalyses);

  // 4. Position sizing (optional)
  let positionSizing: PositionSizeResult | null = null;
  if (accountBalance !== undefined && accountBalance > 0) {
    const maxRisk = riskRules.maxRiskPct ?? 1.0;
    const maxLev = riskRules.maxLeverage ?? 125;
    const requested = signal.leverage ?? 1;
    const leverage = Math.min(requested, maxLev);

    positionSizing = calculatePositionSize({
      accountBalance,
      entry: signal.entry,
      stopLoss: signal.stopLoss,
      scoreMultiplier: scoreResult.scoreMultiplier,
      maxRiskPct: maxRisk,
      leverage,
    });
  }

  return {
    signal,
    currentPrice,
    confluence: { bias: confluence, matrix },
    scoring: scoreResult,
    positionSizing,
    timeframeAnalyses: tfAnalyses,
  };
}

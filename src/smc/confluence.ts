/**
 * Multi-Timeframe Confluence Scoring Engine — SMC/ICT Methodology
 *
 * Source: psyd3x/lazytrader@feat/opendeedee-integration src/smc_engine/confluence.py
 *
 * Pine Script logic:
 *   1. Each TF scores enabled factors as +1 (bull) / -1 (bear) / 0 (neutral).
 *   2. Raw TF score × the TF's weight = weighted contribution.
 *   3. Sum all weighted scores → biasPoints.
 *   4. maxScore = sum(weight × factorCount) for active TFs.
 *   5. biasPct = (biasPoints / maxScore) · 100, normalized to 0..100 with 50=neutral.
 *   6. Label mapped from percentage thresholds via `getBiasLabel`.
 */

import { DEFAULT_BIAS_CONFIG, DEFAULT_TIMEFRAMES, getBiasLabel } from "./config";
import type {
  BiasConfig,
  BiasResult,
  TimeframeAnalysis,
} from "./models";
import { Direction, makeBiasResult } from "./models";

// ---------------------------------------------------------------------------
// Factor extraction
// ---------------------------------------------------------------------------

/** Clamp to {-1, 0, 1}. */
const clamp1 = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0);

const structureBias = (tf: TimeframeAnalysis): number => clamp1(tf.structure.bias);
const obDirection = (tf: TimeframeAnalysis): number =>
  tf.nearestOb === null ? 0 : clamp1(tf.nearestOb.direction);
const fvgDirection = (tf: TimeframeAnalysis): number =>
  tf.nearestFvg === null ? 0 : clamp1(tf.nearestFvg.direction);
const emaDirection = (tf: TimeframeAnalysis): number => clamp1(tf.ema.direction);

/**
 * Pine `swingBiasDir` — 5-branch hybrid on swing position %.
 *
 *   pct < 0   → -1  (broke below swing low — trend bear)
 *   pct > 100 → +1  (broke above swing high — trend bull)
 *   pct < 30  → +1  (near low, contrarian bounce)
 *   pct > 70  → -1  (near high, contrarian rejection)
 *   else      →  0  (mid-range neutral)
 *
 * **Trap warning:** independent of `tf.swing.bias` (the persistent last-pivot
 * type from `calcSwingHL`). Pine uses the position-based hybrid here, not the
 * pivot type. Documented in the archived swing_bias_trap memo.
 */
const swingBias = (tf: TimeframeAnalysis): number => {
  const pct = tf.swing.positionPct;
  if (pct < 0) return -1;
  if (pct > 100) return 1;
  if (pct < 30) return 1;
  if (pct > 70) return -1;
  return 0;
};

// Ordered factor list. `configKey` selects the toggle on BiasConfig.
interface Factor {
  name: string;
  extract: (tf: TimeframeAnalysis) => number;
  configKey: keyof BiasConfig;
}

const FACTORS: readonly Factor[] = [
  { name: "structure", extract: structureBias, configKey: "useStructure" },
  { name: "ob", extract: obDirection, configKey: "useOb" },
  { name: "fvg", extract: fvgDirection, configKey: "useFvg" },
  { name: "ema", extract: emaDirection, configKey: "useEma" },
  { name: "swing", extract: swingBias, configKey: "useSwing" },
];

// ---------------------------------------------------------------------------
// Confluence Engine
// ---------------------------------------------------------------------------

export interface FactorAgreement {
  /** Per-TF score map for this factor. */
  scores: Record<string, number>;
  /** Fraction of opinionated TFs agreeing with the majority side, [0..1]. */
  agreement: number;
  /** Direction of the majority opinion: +1, -1, or 0 (no opinions). */
  majorityDirection: number;
  agreeingTfs: string[];
  dissentingTfs: string[];
}

export interface TimeframeBreakdown {
  rawScore: number;
  weightedScore: number;
  weight: number;
  factorScores: Record<string, number>;
}

export interface ConfluenceMatrix {
  factors: Record<string, FactorAgreement>;
  timeframes: Record<string, TimeframeBreakdown>;
  /** Avg agreement across all factors, [0..1]. */
  overallAgreement: number;
  strongestFactor: string | null;
  weakestFactor: string | null;
}

export interface ConfluenceEngineOptions {
  biasConfig?: BiasConfig;
  /** Custom TF→weight map. Defaults to the enabled TFs in DEFAULT_TIMEFRAMES. */
  timeframeWeights?: Record<string, number>;
}

/** Multi-timeframe confluence scoring engine using SMC/ICT methodology. */
export class ConfluenceEngine {
  readonly biasConfig: BiasConfig;
  /** TF→weight map for the active timeframes. Read-only for downstream. */
  readonly timeframeWeights: Readonly<Record<string, number>>;
  private readonly enabledFactors: readonly Factor[];
  private readonly factorCount: number;

  constructor(opts: ConfluenceEngineOptions = {}) {
    this.biasConfig = opts.biasConfig ?? DEFAULT_BIAS_CONFIG;

    let weights: Record<string, number>;
    if (opts.timeframeWeights !== undefined) {
      weights = { ...opts.timeframeWeights };
    } else {
      weights = {};
      for (const tf of DEFAULT_TIMEFRAMES) {
        if (tf.enabled) weights[tf.timeframe] = tf.weight;
      }
    }
    this.timeframeWeights = weights;

    this.enabledFactors = FACTORS.filter((f) => this.biasConfig[f.configKey]);
    this.factorCount = this.enabledFactors.length;
  }

  /** Weight for a given TF, or 0 if not in the active set. */
  getWeight(tf: string): number {
    return this.timeframeWeights[tf] ?? 0;
  }

  // ----- Public API ---------------------------------------------------------

  /**
   * Score a single timeframe — sum of enabled factor scores in {-1, 0, +1}.
   * Range: [−factorCount, +factorCount].
   */
  scoreTimeframe(tf: TimeframeAnalysis): number {
    let total = 0;
    for (const f of this.enabledFactors) total += f.extract(tf);
    return total;
  }

  /** Per-factor breakdown for one TF. */
  scoreTimeframeDetailed(tf: TimeframeAnalysis): Record<string, number> {
    const out: Record<string, number> = {};
    for (const f of this.enabledFactors) out[f.name] = f.extract(tf);
    return out;
  }

  /** Calculate overall directional bias from all TF analyses. */
  calculateBias(allTfAnalyses: Record<string, TimeframeAnalysis>): BiasResult {
    let biasPoints = 0;
    let maxPossible = 0;

    for (const [tfStr, tfData] of Object.entries(allTfAnalyses)) {
      const weight = this.timeframeWeights[tfStr] ?? 0;
      if (weight === 0) continue;

      const rawScore = this.scoreTimeframe(tfData);
      biasPoints += rawScore * weight;
      maxPossible += this.factorCount * weight;
    }

    if (maxPossible === 0) return makeBiasResult();

    // Normalize to 0..100 with 50 = neutral.
    // biasPoints ∈ [−maxPossible, +maxPossible] → 0..100.
    let normalizedPct = (biasPoints / maxPossible + 1) * 50;
    normalizedPct = Math.max(0, Math.min(100, normalizedPct));

    const { label, direction } = getBiasLabel(normalizedPct);

    return {
      label,
      score: biasPoints,
      maxScore: maxPossible,
      percentage: Math.round(normalizedPct * 100) / 100, // 2 decimals
      direction: direction as Direction,
    };
  }

  /**
   * Detailed agreement matrix: per-factor agreement across TFs and per-TF
   * weighted breakdown. Used by the dashboard's "INTELLIGENCE" panel.
   */
  calculateConfluenceMatrix(
    allTfAnalyses: Record<string, TimeframeAnalysis>,
  ): ConfluenceMatrix {
    const factorData: Record<string, Record<string, number>> = {};
    for (const f of this.enabledFactors) factorData[f.name] = {};

    const tfData: Record<string, TimeframeBreakdown> = {};

    const activeTfs = Object.keys(allTfAnalyses).filter(
      (tf) => (this.timeframeWeights[tf] ?? 0) > 0,
    );

    for (const tfStr of activeTfs) {
      const tfAnalysis = allTfAnalyses[tfStr];
      const weight = this.timeframeWeights[tfStr];
      const detailed = this.scoreTimeframeDetailed(tfAnalysis);
      const raw = Object.values(detailed).reduce((a, b) => a + b, 0);

      tfData[tfStr] = {
        rawScore: raw,
        weightedScore: raw * weight,
        weight,
        factorScores: detailed,
      };

      for (const [factorName, score] of Object.entries(detailed)) {
        factorData[factorName][tfStr] = score;
      }
    }

    // Per-factor agreement
    const factorsResult: Record<string, FactorAgreement> = {};
    const agreementScores: number[] = [];

    for (const [factorName, tfScores] of Object.entries(factorData)) {
      const nonZero = Object.entries(tfScores).filter(([, s]) => s !== 0);
      if (nonZero.length === 0) {
        factorsResult[factorName] = {
          scores: tfScores,
          agreement: 0,
          majorityDirection: 0,
          agreeingTfs: [],
          dissentingTfs: [],
        };
        agreementScores.push(0);
        continue;
      }

      let bullCount = 0;
      let bearCount = 0;
      for (const [, s] of nonZero) {
        if (s > 0) bullCount++;
        else if (s < 0) bearCount++;
      }
      const majorityDir = bullCount >= bearCount ? 1 : -1;

      const agreeingTfs: string[] = [];
      const dissentingTfs: string[] = [];
      for (const [tf, s] of Object.entries(tfScores)) {
        if (s === majorityDir) agreeingTfs.push(tf);
        else if (s === -majorityDir) dissentingTfs.push(tf);
      }
      const totalOpinionated = nonZero.length;
      const agreement = totalOpinionated > 0 ? agreeingTfs.length / totalOpinionated : 0;

      factorsResult[factorName] = {
        scores: tfScores,
        agreement: Math.round(agreement * 1000) / 1000, // 3 decimals
        majorityDirection: majorityDir,
        agreeingTfs,
        dissentingTfs,
      };
      agreementScores.push(agreement);
    }

    const overallAgreement =
      agreementScores.length > 0
        ? agreementScores.reduce((a, b) => a + b, 0) / agreementScores.length
        : 0;

    // Strongest/weakest factor by agreement
    const sortedFactors = Object.entries(factorsResult).sort(
      (a, b) => b[1].agreement - a[1].agreement,
    );

    return {
      factors: factorsResult,
      timeframes: tfData,
      overallAgreement: Math.round(overallAgreement * 1000) / 1000,
      strongestFactor: sortedFactors[0]?.[0] ?? null,
      weakestFactor: sortedFactors[sortedFactors.length - 1]?.[0] ?? null,
    };
  }

  /** TFs whose raw score sign matches the requested direction. */
  getAgreeingTimeframes(
    direction: "long" | "short" | "bull" | "bullish" | "bear" | "bearish",
    allTfAnalyses: Record<string, TimeframeAnalysis>,
  ): string[] {
    const lower = direction.toLowerCase();
    const target = lower === "long" || lower === "bull" || lower === "bullish" ? 1 : -1;

    const agreeing: string[] = [];
    for (const [tfStr, tfData] of Object.entries(allTfAnalyses)) {
      if ((this.timeframeWeights[tfStr] ?? 0) === 0) continue;
      const raw = this.scoreTimeframe(tfData);
      if ((raw > 0 && target > 0) || (raw < 0 && target < 0)) {
        agreeing.push(tfStr);
      }
    }
    return agreeing;
  }

  /** Bias using only higher timeframes (default 4H, 1D, 1W). */
  getHtfBias(
    allTfAnalyses: Record<string, TimeframeAnalysis>,
    htfKeys: readonly string[] = ["4H", "1D", "1W"],
  ): BiasResult {
    const subset: Record<string, TimeframeAnalysis> = {};
    for (const k of htfKeys) {
      if (k in allTfAnalyses) subset[k] = allTfAnalyses[k];
    }
    return this.calculateBias(subset);
  }
}

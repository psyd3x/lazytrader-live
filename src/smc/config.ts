/**
 * SMC Engine — Default Configuration
 *
 * Constants and defaults ported from the Pine Script indicator's input()
 * declarations. Mirrors the TradingView settings panel.
 *
 * Source: psyd3x/lazytrader@feat/opendeedee-integration src/smc_engine/config.py
 */

import type { BiasConfig, BiasLabel, Direction, SignalRating, TimeframeConfig } from "./models";

// ---------------------------------------------------------------------------
// Timeframe weights — higher TFs carry more weight in confluence scoring.
// 1m and 5m are computed but excluded from bias scoring (too noisy).
// ---------------------------------------------------------------------------

export const DEFAULT_TIMEFRAMES: readonly TimeframeConfig[] = [
  { timeframe: "1m", weight: 1, enabled: false },
  { timeframe: "5m", weight: 1, enabled: false },
  { timeframe: "15m", weight: 2, enabled: true },
  { timeframe: "1H", weight: 2, enabled: true },
  { timeframe: "4H", weight: 2, enabled: true },
  { timeframe: "1D", weight: 3, enabled: true },
  { timeframe: "1W", weight: 4, enabled: true },
] as const;

// ---------------------------------------------------------------------------
// Bias component toggles — EMA off by default per the Pine original.
// ---------------------------------------------------------------------------

export const DEFAULT_BIAS_CONFIG: BiasConfig = {
  useStructure: true,
  useOb: true,
  useFvg: true,
  useEma: false,
  useSwing: true,
};

// ---------------------------------------------------------------------------
// Indicator Parameters (Pine input.int defaults)
// ---------------------------------------------------------------------------

/** ta.ema(close, EMA_LENGTH) — fast EMA for trend direction. */
export const EMA_LENGTH = 9;

/** ta.pivothigh / ta.pivotlow lookback period for swing detection. */
export const SWING_LENGTH = 5;

/** ta.atr(ATR_LENGTH) — short ATR for zone width sizing. */
export const ATR_LENGTH = 3;

/** ta.atr(ATR_AVG_LENGTH) — longer ATR for volatility normalization. */
export const ATR_AVG_LENGTH = 20;

/** ta.sma(volume, VOLUME_LENGTH) — volume average for OB/FVG filtering. */
export const VOLUME_LENGTH = 20;

// ---------------------------------------------------------------------------
// Signal Rating Thresholds — confluence % → letter grade + position multiplier.
// Ordered highest-first. First match wins.
// ---------------------------------------------------------------------------

export interface SignalRatingThreshold {
  minPct: number;
  rating: SignalRating;
  multiplier: number;
  label: string;
}

export const SIGNAL_RATING_THRESHOLDS: readonly SignalRatingThreshold[] = [
  { minPct: 80, rating: "A+", multiplier: 1.5, label: "STRONG" },
  { minPct: 65, rating: "A", multiplier: 1.25, label: "GOOD" },
  { minPct: 50, rating: "B", multiplier: 1.0, label: "MODERATE" },
  { minPct: 35, rating: "C", multiplier: 0.75, label: "WEAK" },
  { minPct: 0, rating: "D", multiplier: 0.5, label: "POOR" },
] as const;

// ---------------------------------------------------------------------------
// Bias Label Thresholds (documentation only — actual classification uses
// strict comparisons in getBiasLabel to mirror Pine exactly at boundaries).
//
// Pine signed biasPct → bands (NORMALIZED scale, 50 = neutral):
//   biasPct > 50  → BULLISH    (normalized > 75)
//   biasPct > 20  → LEAN BULL  (normalized > 60)
//   biasPct < -50 → BEARISH    (normalized < 25)
//   biasPct < -20 → LEAN BEAR  (normalized < 40)
//   else          → NEUTRAL    ([40, 60])
// ---------------------------------------------------------------------------

export interface BiasLabelThreshold {
  minPct: number;
  label: BiasLabel;
  direction: Direction;
}

export const BIAS_LABEL_THRESHOLDS: readonly BiasLabelThreshold[] = [
  { minPct: 75, label: "BULLISH", direction: 1 },
  { minPct: 60, label: "LEAN BULL", direction: 1 },
  { minPct: 40, label: "NEUTRAL", direction: 0 },
  { minPct: 25, label: "LEAN BEAR", direction: -1 },
  { minPct: 0, label: "BEARISH", direction: -1 },
] as const;

// ---------------------------------------------------------------------------
// Entry Status Thresholds
// ---------------------------------------------------------------------------

/** Within this % of entry price = 'at_entry'. */
export const ENTRY_DISTANCE_AT_ENTRY_PCT = 0.15;

/** Beyond this % past entry in the wrong direction = 'missed'. */
export const ENTRY_DISTANCE_MISSED_PCT = 1.0;

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export interface SignalRatingResolved {
  rating: SignalRating;
  multiplier: number;
  label: string;
}

/** Resolve confluence percentage (0-100) to (rating, multiplier, label). */
export function getSignalRating(confluencePct: number): SignalRatingResolved {
  for (const t of SIGNAL_RATING_THRESHOLDS) {
    if (confluencePct >= t.minPct) {
      return { rating: t.rating, multiplier: t.multiplier, label: t.label };
    }
  }
  // Unreachable — minPct=0 always matches — but keep an explicit fallback.
  return { rating: "D", multiplier: 0.5, label: "POOR" };
}

export interface BiasLabelResolved {
  label: BiasLabel;
  direction: Direction;
}

/**
 * Resolve normalized bias % (0-100) to (label, direction) per Pine.
 *
 * Pine source (using STRICT comparisons):
 *   biasLabel = biasPct > 50  ? "BULLISH ↑"
 *             : biasPct > 20  ? "LEAN BULL ↑"
 *             : biasPct < -50 ? "BEARISH ↓"
 *             : biasPct < -20 ? "LEAN BEAR ↓"
 *             :                 "NEUTRAL →"
 *
 * Conversion: normalized = (biasPct + 100) / 2
 *   biasPct > 50  ↔ normalized > 75   → BULLISH
 *   biasPct > 20  ↔ normalized > 60   → LEAN BULL
 *   biasPct < -50 ↔ normalized < 25   → BEARISH
 *   biasPct < -20 ↔ normalized < 40   → LEAN BEAR
 *   else                              → NEUTRAL  (band [40, 60])
 */
export function getBiasLabel(biasPct: number): BiasLabelResolved {
  if (biasPct > 75) return { label: "BULLISH", direction: 1 };
  if (biasPct > 60) return { label: "LEAN BULL", direction: 1 };
  if (biasPct < 25) return { label: "BEARISH", direction: -1 };
  if (biasPct < 40) return { label: "LEAN BEAR", direction: -1 };
  return { label: "NEUTRAL", direction: 0 };
}

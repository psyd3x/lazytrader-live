/**
 * SMC/ICT Market Structure Primitives
 *
 * Core calculations for Smart Money Concepts / Inner Circle Trader methodology.
 * Source: psyd3x/lazytrader@feat/opendeedee-integration src/smc_engine/primitives.py
 *
 * **Convention:** all arrays use newest-LAST ordering (ascending chronological,
 * matching pandas/numpy). Pine Script's `[0]` = current = `arr[arr.length - 1]`,
 * `[1]` = prev = `arr[arr.length - 2]`, etc.
 *
 * **NaN sentinel:** uses `NaN` for "no value yet" (e.g. before any pivot has
 * been seen). Always check with `Number.isNaN`, never `=== NaN` (always false).
 *
 * **Internal vs public types:** the `SwingTrackerResult` / `StructureTrackerResult`
 * here include extra fields (`prevHigh`/`prevLow`) used by analyzer to feed the
 * public-facing `SwingResult` / `StructureResult` from `models.ts`.
 */

import type { Candle } from "./models";

// ---------------------------------------------------------------------------
// Internal result types (richer than the public models — analyzer trims them)
// ---------------------------------------------------------------------------

export interface SwingTrackerResult {
  /** Current swing high. NaN until first pivot. */
  high: number;
  /** Current swing low. NaN until first pivot. */
  low: number;
  /** Previous swing high. NaN until two pivots have occurred. */
  prevHigh: number;
  /** Previous swing low. */
  prevLow: number;
  /** +1 bull, -1 bear, 0 neutral. Persistent state set by last pivot. */
  bias: number;
  reclaimLow: boolean;
  reclaimHigh: boolean;
  /** Where price sits in swing range (0-100). May be <0 or >100 when broken. */
  positionPct: number;
}

export interface StructureTrackerResult {
  /** Latest label: HH, HL, LH, LL or empty string. */
  label: string;
  /** 1 = HH, -1 = LH, 0 = unset. */
  highType: number;
  /** 1 = HL, -1 = LL, 0 = unset. */
  lowType: number;
  /** 1 = bullish, -1 = bearish, 0 = neutral. */
  bias: number;
  /** Real-time label if close broke structure intra-bar. */
  realtimeOverride: string;
  /** Last 3 structure labels (e.g. ["HH","HL","LH"]). */
  labels: string[];
}

// ===========================================================================
// 1. EMA & Trend
// ===========================================================================

/**
 * Exponential Moving Average — matches Pine Script `ta.ema()`.
 *
 * EMA_t = α · close_t + (1 − α) · EMA_{t−1}, where α = 2 / (length + 1).
 * Seeded with SMA of first `length` bars.
 */
export function calcEma(closes: readonly number[], length = 9): number[] {
  const n = closes.length;
  if (n === 0) return [];

  const alpha = 2.0 / (length + 1);
  const ema = new Array<number>(n);

  const seedLen = Math.min(length, n);
  ema[0] = closes[0];

  if (seedLen > 1) {
    // Seed boundary value with SMA of first `seedLen` closes
    let sum = 0;
    for (let i = 0; i < seedLen; i++) sum += closes[i];
    const sma = sum / seedLen;

    // Forward EMA from index 1 up to seedLen-2
    for (let i = 1; i < seedLen - 1; i++) {
      ema[i] = alpha * closes[i] + (1 - alpha) * ema[i - 1];
    }
    ema[seedLen - 1] = sma;
  }

  // Standard EMA from seed point onward
  const start = Math.max(seedLen - 1, 1);
  for (let i = start; i < n; i++) {
    ema[i] = alpha * closes[i] + (1 - alpha) * ema[i - 1];
  }

  return ema;
}

export interface TrendState {
  /** +1 above EMA, -1 below. */
  direction: number;
  /** Signed distance close − ema. */
  distance: number;
}

/** Trend direction + signed EMA distance for the current (last) bar. */
export function calcTrend(
  closes: readonly number[],
  emaValues: readonly number[],
): TrendState {
  const close = closes[closes.length - 1];
  const ema = emaValues[emaValues.length - 1];
  const distance = close - ema;
  return { direction: distance > 0 ? 1 : -1, distance };
}

// ===========================================================================
// 2. Pivot / Swing Detection
// ===========================================================================

export interface PivotArrays {
  /** Pivot-high values placed at the bar where they're confirmed; NaN otherwise. */
  pivotHighs: number[];
  /** Pivot-low values placed at the bar where they're confirmed; NaN otherwise. */
  pivotLows: number[];
}

/**
 * Detect pivot highs and pivot lows — matches Pine `ta.pivothigh / ta.pivotlow`.
 *
 * A pivot high at center bar `c` exists when `highs[c]` is the maximum of
 * `highs[c-swingLength..c+swingLength]`. The pivot is *confirmed* and reported
 * at bar `c + swingLength` to mirror Pine's behavior of only knowing pivots
 * once the right-side window has materialized.
 */
export function detectPivots(
  highs: readonly number[],
  lows: readonly number[],
  swingLength = 5,
): PivotArrays {
  const n = highs.length;
  const ph = new Array<number>(n).fill(NaN);
  const pl = new Array<number>(n).fill(NaN);

  for (let c = swingLength; c < n - swingLength; c++) {
    // Pivot high: highs[c] must equal the window max
    let windowMax = -Infinity;
    let windowMin = Infinity;
    for (let k = c - swingLength; k <= c + swingLength; k++) {
      if (highs[k] > windowMax) windowMax = highs[k];
      if (lows[k] < windowMin) windowMin = lows[k];
    }
    const confirmBar = c + swingLength;
    if (highs[c] === windowMax && confirmBar < n) {
      ph[confirmBar] = highs[c];
    }
    if (lows[c] === windowMin && confirmBar < n) {
      pl[confirmBar] = lows[c];
    }
  }

  return { pivotHighs: ph, pivotLows: pl };
}

// ===========================================================================
// 3. Swing High/Low Tracker — Pine calcSwingHL
// ===========================================================================

/**
 * Stateful tracker for swing highs/lows + break + reclaim detection.
 * Maintains current and previous swing levels and flags reclaims (price
 * breaks through a swing then closes back across it).
 */
export class SwingTracker {
  private currH = NaN;
  private currL = NaN;
  private prevH = NaN;
  private prevL = NaN;
  private lowBroken = false;
  private highBroken = false;
  /** Pine `var int swingBias` — set on each new pivot, persists between bars. */
  private swingBias = 0;

  /**
   * Process a new candle and optional pivot signals (use NaN for "no pivot").
   */
  update(
    candle: Candle,
    pivotHigh: number = NaN,
    pivotLow: number = NaN,
  ): SwingTrackerResult {
    let reclaimLow = false;
    let reclaimHigh = false;

    if (!Number.isNaN(pivotHigh)) {
      this.prevH = this.currH;
      this.currH = pivotHigh;
      this.highBroken = false;
      this.swingBias = 1;
    }

    if (!Number.isNaN(pivotLow)) {
      this.prevL = this.currL;
      this.currL = pivotLow;
      this.lowBroken = false;
      this.swingBias = -1;
    }

    // Break detection — price trades through swing level
    if (!Number.isNaN(this.currL) && candle.low < this.currL) {
      this.lowBroken = true;
    }
    if (!Number.isNaN(this.currH) && candle.high > this.currH) {
      this.highBroken = true;
    }

    // Reclaim detection — close returns past the broken level
    if (this.lowBroken && !Number.isNaN(this.currL) && candle.close > this.currL) {
      reclaimLow = true;
      this.lowBroken = false;
    }
    if (this.highBroken && !Number.isNaN(this.currH) && candle.close < this.currH) {
      reclaimHigh = true;
      this.highBroken = false;
    }

    return {
      high: this.currH,
      low: this.currL,
      prevHigh: this.prevH,
      prevLow: this.prevL,
      bias: this.swingBias,
      reclaimLow,
      reclaimHigh,
      positionPct: calcPositionPct(candle.close, this.currH, this.currL),
    };
  }
}

// ===========================================================================
// 4. Market Structure Tracker — Pine calcStructure
// ===========================================================================

/**
 * Tracks market structure labels HH/HL/LH/LL with Pine's real-time override.
 *
 * Real-time override: when close breaks `prevH` or `prevL` intra-bar, the
 * RT version of high_type/low_type/labels reflects that immediately for the
 * current bar's report — but the persistent class state is **not** mutated.
 * This matches Pine's local `rtHighType` / `rtLowType` / `rtStruct1-3` vars.
 */
export class StructureTracker {
  private currH = NaN;
  private currL = NaN;
  private prevH = NaN;
  private prevL = NaN;
  /** 1 = HH, -1 = LH; persistent. */
  private highType = 0;
  /** 1 = HL, -1 = LL; persistent. */
  private lowType = 0;
  /** Last 3 confirmed labels. */
  private labels: string[] = [];

  update(
    candle: Candle,
    pivotHigh: number = NaN,
    pivotLow: number = NaN,
  ): StructureTrackerResult {
    let label = "";

    // New pivot high — classify HH or LH
    if (!Number.isNaN(pivotHigh)) {
      this.prevH = this.currH;
      this.currH = pivotHigh;
      if (!Number.isNaN(this.prevH)) {
        if (this.currH > this.prevH) {
          label = "HH";
          this.highType = 1;
        } else {
          label = "LH";
          this.highType = -1;
        }
        this.pushLabel(label);
      }
    }

    // New pivot low — classify HL or LL
    if (!Number.isNaN(pivotLow)) {
      this.prevL = this.currL;
      this.currL = pivotLow;
      if (!Number.isNaN(this.prevL)) {
        if (this.currL > this.prevL) {
          label = "HL";
          this.lowType = 1;
        } else {
          label = "LL";
          this.lowType = -1;
        }
        this.pushLabel(label);
      }
    }

    // Real-time override (LOCAL only — does NOT mutate persistent fields)
    let realtimeOverride = "";
    let rtHighType = this.highType;
    let rtLowType = this.lowType;
    let rtLabels = [...this.labels];

    if (!Number.isNaN(this.prevL) && candle.close < this.prevL) {
      realtimeOverride = "LL";
      rtLowType = -1;
      rtLabels = [...rtLabels, "LL"].slice(-3);
    } else if (!Number.isNaN(this.prevH) && candle.close > this.prevH) {
      realtimeOverride = "HH";
      rtHighType = 1;
      rtLabels = [...rtLabels, "HH"].slice(-3);
    }

    // Structure bias — uses RT-overridden types per Pine semantics
    let bias = 0;
    if (rtHighType > 0 && rtLowType > 0) bias = 1; // HH + HL
    else if (rtHighType < 0 && rtLowType < 0) bias = -1; // LH + LL

    return {
      label,
      highType: rtHighType,
      lowType: rtLowType,
      bias,
      realtimeOverride,
      labels: rtLabels,
    };
  }

  private pushLabel(label: string): void {
    this.labels.push(label);
    if (this.labels.length > 3) {
      this.labels = this.labels.slice(-3);
    }
  }
}

// ===========================================================================
// 5. Fair Value Gap (FVG) Detection
// ===========================================================================

export interface FvgDetection {
  /** 1 = bull FVG, -1 = bear FVG, 0 = none. */
  direction: number;
  /** Upper boundary of the gap. */
  top: number;
  /** Lower boundary of the gap. */
  bottom: number;
  /** Index in the input candles list of the middle candle of the FVG. */
  barIdx: number;
}

/**
 * Detect a Fair Value Gap on the most recent completed bars.
 *
 * Pine logic (bar indices = bars-back from current):
 * - Bull FVG: low[1] > high[3] AND green[2] AND low[1] < high[2] AND low[2] < high[3]
 *   → gap zone: bottom = high[3], top = low[1]
 * - Bear FVG: high[1] < low[3] AND red[2] AND high[1] > low[2] AND high[2] > low[3]
 *   → gap zone: bottom = high[1], top = low[3]
 *
 * Pine `_green` / `_red` accept the OR clause: middle candle counts as green
 * if `close > open` OR `close > close[1]` (mirror for red). Preserves the
 * "gray middle candle" fix from the archived Python branch.
 *
 * Maps Pine indices to our newest-last array:
 *   pine[1] = candles[n-2], pine[2] = candles[n-3], pine[3] = candles[n-4]
 */
export function detectFvg(candles: readonly Candle[]): FvgDetection {
  if (candles.length < 4) return { direction: 0, top: 0, bottom: 0, barIdx: 0 };

  const n = candles.length;
  const b1 = candles[n - 2]; // pine [1]
  const b2 = candles[n - 3]; // pine [2]
  const b3 = candles[n - 4]; // pine [3]

  // Pine _green/_red — OR clause accepts gray middle candle
  const isGreen = b2.close > b2.open || b2.close > b3.close;
  const isRed = b2.close < b2.open || b2.close < b3.close;

  // Bull FVG: gap between b3.high (bottom) and b1.low (top)
  if (
    b1.low > b3.high && // gap exists
    isGreen && // middle candle bullish
    b1.low < b2.high && // b1 low within b2 range (not an island)
    b2.low < b3.high // b2 low reaches into b3 territory (continuity)
  ) {
    return { direction: 1, top: b1.low, bottom: b3.high, barIdx: n - 3 };
  }

  // Bear FVG: gap between b1.high (bottom) and b3.low (top)
  if (
    b1.high < b3.low &&
    isRed &&
    b1.high > b2.low &&
    b2.high > b3.low
  ) {
    return { direction: -1, top: b3.low, bottom: b1.high, barIdx: n - 3 };
  }

  return { direction: 0, top: 0, bottom: 0, barIdx: 0 };
}

// ===========================================================================
// 6. Candle Search Helpers
// ===========================================================================

export interface ExtremeCandle {
  /** The pivot price (low for findLowest, high for findHighest). */
  primary: number;
  /** The companion price on the same candle (high for findLowest, low for findHighest). */
  companion: number;
  /** Index in the original candles list where the extreme was found. */
  barIdx: number;
}

/** Find the candle with the lowest low in the last `barsBack` bars. */
export function findLowestCandle(
  candles: readonly Candle[],
  barsBack: number,
): ExtremeCandle {
  const n = candles.length;
  const start = Math.max(0, n - barsBack);

  let minLow = Infinity;
  let minHigh = 0;
  let minIdx = start;

  for (let i = start; i < n; i++) {
    if (candles[i].low < minLow) {
      minLow = candles[i].low;
      minHigh = candles[i].high;
      minIdx = i;
    }
  }

  return { primary: minLow, companion: minHigh, barIdx: minIdx };
}

/** Find the candle with the highest high in the last `barsBack` bars. */
export function findHighestCandle(
  candles: readonly Candle[],
  barsBack: number,
): ExtremeCandle {
  const n = candles.length;
  const start = Math.max(0, n - barsBack);

  let maxHigh = -Infinity;
  let maxLow = 0;
  let maxIdx = start;

  for (let i = start; i < n; i++) {
    if (candles[i].high > maxHigh) {
      maxHigh = candles[i].high;
      maxLow = candles[i].low;
      maxIdx = i;
    }
  }

  return { primary: maxHigh, companion: maxLow, barIdx: maxIdx };
}

// ===========================================================================
// 7. ATR & Volume
// ===========================================================================

/**
 * Average True Range — matches Pine `ta.atr()` using Wilder's RMA smoothing.
 * TR = max(high − low, |high − prevClose|, |low − prevClose|).
 */
export function calcAtr(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  length = 3,
): number[] {
  const n = highs.length;
  const tr = new Array<number>(n);
  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < n; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }

  // RMA: rma[i] = rma[i-1] · (1−α) + tr[i] · α, α = 1/length
  const atr = new Array<number>(n);
  atr[0] = tr[0];
  const alpha = 1.0 / length;
  for (let i = 1; i < n; i++) {
    atr[i] = atr[i - 1] * (1 - alpha) + tr[i] * alpha;
  }
  return atr;
}

export interface VolatilityState {
  currentAtr: number;
  avgAtr: number;
  /** 1 = high (>1.5× avg), -1 = low (<0.5× avg), 0 = normal. */
  state: number;
}

export function calcVolatilityState(
  atrValues: readonly number[],
  avgLength = 20,
): VolatilityState {
  const n = atrValues.length;
  const currentAtr = atrValues[n - 1];

  const sliceLen = Math.min(avgLength, n);
  let sum = 0;
  for (let i = n - sliceLen; i < n; i++) sum += atrValues[i];
  const avgAtr = sum / sliceLen;

  if (avgAtr === 0) return { currentAtr, avgAtr, state: 0 };

  const ratio = currentAtr / avgAtr;
  let state = 0;
  if (ratio > 1.5) state = 1;
  else if (ratio < 0.5) state = -1;

  return { currentAtr, avgAtr, state };
}

export interface VolumeState {
  currentVol: number;
  avgVol: number;
  /** 1 = high (>2× avg), -1 = low (<0.5× avg), 0 = normal. */
  state: number;
}

export function calcVolumeState(
  volumes: readonly number[],
  length = 20,
): VolumeState {
  const n = volumes.length;
  const currentVol = volumes[n - 1];

  const sliceLen = Math.min(length, n);
  let sum = 0;
  for (let i = n - sliceLen; i < n; i++) sum += volumes[i];
  const avgVol = sum / sliceLen;

  if (avgVol === 0) return { currentVol, avgVol, state: 0 };

  const ratio = currentVol / avgVol;
  let state = 0;
  if (ratio > 2.0) state = 1;
  else if (ratio < 0.5) state = -1;

  return { currentVol, avgVol, state };
}

// ===========================================================================
// 8. Swing Bias Direction (Pine swingBiasDir — 5-branch hybrid)
// ===========================================================================

/**
 * Pine `swingBiasDir` — trend-following on breakout, contrarian inside.
 *
 *   pct = (close − low) / max(high − low, ε) · 100
 *
 *   pct < 0   → -1  (broke below swing low — trend bear)
 *   pct > 100 → +1  (broke above swing high — trend bull)
 *   pct < 30  → +1  (near low, contrarian bounce)
 *   pct > 70  → -1  (near high, contrarian rejection)
 *   else      →  0  (mid-range neutral)
 *
 * **Trap warning:** confluence scoring uses THIS function's output, NOT
 * `SwingTracker.bias` (which is the persistent last-pivot type). They look
 * similar but have opposite semantics in mid-range. See archive memo.
 */
export function swingBiasDirection(
  close: number,
  swingHigh: number,
  swingLow: number,
): number {
  if (Number.isNaN(swingHigh) || Number.isNaN(swingLow) || swingHigh === swingLow) {
    return 0;
  }
  const pct = calcPositionPct(close, swingHigh, swingLow);
  if (pct < 0) return -1;
  if (pct > 100) return 1;
  if (pct < 30) return 1;
  if (pct > 70) return -1;
  return 0;
}

// ===========================================================================
// Internal helpers
// ===========================================================================

/**
 * Position % of `close` within `[low, high]`. May go below 0 or above 100
 * when price is outside the range (intentional — used to detect breakouts).
 * Returns 50 when high/low undefined or equal.
 */
export function calcPositionPct(
  close: number,
  high: number,
  low: number,
): number {
  if (Number.isNaN(high) || Number.isNaN(low) || high === low) return 50.0;
  return ((close - low) / (high - low)) * 100.0;
}

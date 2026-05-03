/**
 * TimeframeAnalyzer — orchestrates SMC primitives into a TimeframeAnalysis.
 *
 * Source: psyd3x/lazytrader@feat/opendeedee-integration src/smc_engine/analyzer.py
 *
 * Given raw OHLCV candles for a single timeframe, produces a complete
 * `TimeframeAnalysis` (EMA, swing, structure, OBs, FVGs, nearest zones).
 * Streaming-style: walks candles bar-by-bar through the trackers to mirror
 * the Pine indicator's update semantics (preserves real-time vs persistent
 * state distinctions in StructureTracker).
 *
 * The Python original maintained two Candle types (Pydantic + dataclass);
 * here a single `Candle` interface from `models.ts` works everywhere.
 */

import {
  ATR_AVG_LENGTH,
  ATR_LENGTH,
  EMA_LENGTH,
  SWING_LENGTH,
  VOLUME_LENGTH,
} from "./config";
import type {
  Candle,
  EMAResult,
  StructureLabel,
  StructureResult,
  SwingResult,
  TimeframeAnalysis,
  ZoneResult,
} from "./models";
import { Direction, makeTimeframeAnalysis } from "./models";
import {
  StructureTracker,
  SwingTracker,
  calcAtr,
  calcEma,
  calcTrend,
  calcVolatilityState,
  calcVolumeState,
  detectPivots,
  type VolatilityState,
  type VolumeState,
} from "./primitives";
import { FVGTracker, OrderBlockTracker } from "./zones";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface OhlcvArrays {
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
}

function candlesToArrays(candles: readonly Candle[]): OhlcvArrays {
  const n = candles.length;
  const opens = new Array<number>(n);
  const highs = new Array<number>(n);
  const lows = new Array<number>(n);
  const closes = new Array<number>(n);
  const volumes = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    opens[i] = candles[i].open;
    highs[i] = candles[i].high;
    lows[i] = candles[i].low;
    closes[i] = candles[i].close;
    volumes[i] = candles[i].volume;
  }
  return { opens, highs, lows, closes, volumes };
}

/** NaN-safe number coercion for the public-facing models (Python `_safe_float`). */
function safeFloat(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

/** Clamp a numeric direction value to the Direction union {-1, 0, 1}. */
function asDirection(v: number): Direction {
  if (v > 0) return Direction.BULL;
  if (v < 0) return Direction.BEAR;
  return Direction.NEUTRAL;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TimeframeAnalyzerOptions {
  emaLength?: number;
  swingLength?: number;
  atrLength?: number;
  atrAvgLength?: number;
  volumeLength?: number;
  maxObs?: number;
  maxFvgs?: number;
}

/**
 * Orchestrates SMC primitives + zone trackers across a candle history to
 * produce a single `TimeframeAnalysis` snapshot at the latest bar.
 */
export class TimeframeAnalyzer {
  readonly emaLength: number;
  readonly swingLength: number;
  readonly atrLength: number;
  readonly atrAvgLength: number;
  readonly volumeLength: number;
  readonly maxObs: number;
  readonly maxFvgs: number;

  constructor(opts: TimeframeAnalyzerOptions = {}) {
    this.emaLength = opts.emaLength ?? EMA_LENGTH;
    this.swingLength = opts.swingLength ?? SWING_LENGTH;
    this.atrLength = opts.atrLength ?? ATR_LENGTH;
    this.atrAvgLength = opts.atrAvgLength ?? ATR_AVG_LENGTH;
    this.volumeLength = opts.volumeLength ?? VOLUME_LENGTH;
    this.maxObs = opts.maxObs ?? 6;
    this.maxFvgs = opts.maxFvgs ?? 6;
  }

  /**
   * Run full SMC analysis on a candle series and return the
   * TimeframeAnalysis at the latest bar.
   *
   * Requires at least `2 * swingLength + 2` candles for pivots to confirm.
   * Returns an empty analysis below that threshold.
   */
  analyze(candles: readonly Candle[]): TimeframeAnalysis {
    if (candles.length < 2 * this.swingLength + 2) {
      return makeTimeframeAnalysis();
    }

    const { highs, lows, closes } = candlesToArrays(candles);

    // 1. EMA + trend
    const emaValues = calcEma(closes, this.emaLength);
    const { direction: trendDir, distance: trendDist } = calcTrend(closes, emaValues);
    const ema: EMAResult = {
      direction: asDirection(trendDir),
      distance: trendDist,
      value: emaValues[emaValues.length - 1],
    };

    // 2. Pivots (centered, confirmed `swingLength` bars later)
    const { pivotHighs, pivotLows } = detectPivots(highs, lows, this.swingLength);

    // 3. Swing + Structure trackers — bar-by-bar streaming.
    // Length gate above guarantees at least one iteration.
    const swingTracker = new SwingTracker();
    const structureTracker = new StructureTracker();

    let swingState!: ReturnType<SwingTracker["update"]>;
    let structureState!: ReturnType<StructureTracker["update"]>;
    for (let i = 0; i < candles.length; i++) {
      swingState = swingTracker.update(candles[i], pivotHighs[i], pivotLows[i]);
      structureState = structureTracker.update(candles[i], pivotHighs[i], pivotLows[i]);
    }

    const swing: SwingResult = {
      high: safeFloat(swingState.high),
      low: safeFloat(swingState.low),
      bias: asDirection(swingState.bias),
      reclaimLow: swingState.reclaimLow,
      reclaimHigh: swingState.reclaimHigh,
      positionPct: swingState.positionPct,
    };

    const structure: StructureResult = {
      highType: structureState.highType,
      lowType: structureState.lowType,
      bias: asDirection(structureState.bias),
      // Tracker labels are plain strings; cast to the public union (HH/HL/LH/LL).
      labels: structureState.labels.filter(isStructureLabel),
    };

    // 4. Zone trackers — bar-by-bar
    const obTracker = new OrderBlockTracker({
      maxObs: this.maxObs,
      swingLength: this.swingLength,
    });
    const fvgTracker = new FVGTracker({ maxFvgs: this.maxFvgs });

    for (let i = 0; i < candles.length; i++) {
      obTracker.update(candles, i);
      fvgTracker.update(candles, i);
    }

    const currentPrice = candles[candles.length - 1].close;
    const nearestOb = obTracker.getNearest(currentPrice);
    const nearestFvg = fvgTracker.getNearest(currentPrice);

    const activeObs: ZoneResult[] = obTracker.getAllActive().map((ob) => ({
      direction: ob.direction,
      top: ob.top,
      bottom: ob.bottom,
      barIdx: ob.barIdx,
      isNew: false,
    }));
    const activeFvgs: ZoneResult[] = fvgTracker.getAllActive().map((fvg) => ({
      direction: fvg.direction,
      top: fvg.top,
      bottom: fvg.bottom,
      barIdx: fvg.barIdx,
      isNew: false,
    }));

    return {
      ema,
      swing,
      structure,
      nearestOb,
      nearestFvg,
      activeObs,
      activeFvgs,
    };
  }

  /** Volatility classification (current ATR, avg ATR, state). */
  computeVolatility(candles: readonly Candle[]): VolatilityState {
    if (candles.length < this.atrLength + 1) {
      return { currentAtr: 0, avgAtr: 0, state: 0 };
    }
    const { highs, lows, closes } = candlesToArrays(candles);
    const atrValues = calcAtr(highs, lows, closes, this.atrLength);
    return calcVolatilityState(atrValues, this.atrAvgLength);
  }

  /** Volume classification (current volume, avg volume, state). */
  computeVolume(candles: readonly Candle[]): VolumeState {
    if (candles.length === 0) return { currentVol: 0, avgVol: 0, state: 0 };
    const { volumes } = candlesToArrays(candles);
    return calcVolumeState(volumes, this.volumeLength);
  }
}

const STRUCTURE_LABELS: readonly StructureLabel[] = ["HH", "HL", "LH", "LL"] as const;

function isStructureLabel(s: string): s is StructureLabel {
  return (STRUCTURE_LABELS as readonly string[]).includes(s);
}

// ---------------------------------------------------------------------------
// Module-level convenience
// ---------------------------------------------------------------------------

const DEFAULT_ANALYZER = new TimeframeAnalyzer();

/**
 * Module-level convenience — single analyze call with default config.
 *
 * @param candles - Newest-last OHLCV bars for a single timeframe.
 * @param _timeframeStr - TF identifier (informational; reserved for future
 *   TF-specific behaviour). Currently unused in calculations.
 */
export function analyzeTimeframe(
  candles: readonly Candle[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _timeframeStr?: string,
): TimeframeAnalysis {
  return DEFAULT_ANALYZER.analyze(candles);
}

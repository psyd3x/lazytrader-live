/**
 * SMC/ICT Market Structure Analysis — TypeScript Data Models
 *
 * Ported from the Python prototype at psyd3x/lazytrader@feat/opendeedee-integration
 * (src/smc_engine/models.py). Plain TS interfaces — no runtime validation cost
 * inside the hot path. Use Zod only at fixture / API boundaries.
 *
 * Pydantic field defaults are reproduced as factory functions (`make*Default`)
 * since TS interfaces can't carry defaults.
 */

// ---------------------------------------------------------------------------
// Enums (Pine Script numeric/string conventions)
// ---------------------------------------------------------------------------

/** Market direction — maps to Pine Script +1 / -1 convention. */
export const Direction = {
  BEAR: -1,
  NEUTRAL: 0,
  BULL: 1,
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

/** Swing-point labels: HH=Higher High, HL=Higher Low, LH=Lower High, LL=Lower Low. */
export type StructureLabel = "HH" | "HL" | "LH" | "LL";

/** Signal quality grades, A+ best through D worst. */
export type SignalRating = "A+" | "A" | "B" | "C" | "D";

/** Whether price is approaching, at, or has missed the entry level. */
export type EntryStatus = "approaching" | "at_entry" | "missed";

// ---------------------------------------------------------------------------
// Raw / Intermediate Data
// ---------------------------------------------------------------------------

/** Single OHLCV bar — atomic unit of price data. */
export interface Candle {
  /** Unix epoch ms. */
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Defaults to 0 when source feed lacks volume. */
  volume: number;
}

/**
 * Configuration for a single timeframe in the multi-TF analysis.
 * Higher TF = higher weight in confluence scoring.
 * `weight` is bounded [1, 10] in the Python original; we don't enforce
 * at runtime — config is dev-controlled, not user input.
 */
export interface TimeframeConfig {
  /** e.g. '1m','5m','15m','1H','4H','1D','1W' */
  timeframe: string;
  /** Confluence weight, 1-10. */
  weight: number;
  enabled: boolean;
}

/** Rolling swing-point tracking state. */
export interface SwingData {
  prevHigh: number;
  currHigh: number;
  prevLow: number;
  currLow: number;
}

export const makeSwingData = (): SwingData => ({
  prevHigh: 0,
  currHigh: 0,
  prevLow: 0,
  currLow: 0,
});

/** Pivot high/low detection state — Pine ta.pivothigh / ta.pivotlow. */
export interface PivotData {
  lastPh: number;
  lastPhBar: number;
  lastPl: number;
  lastPlBar: number;
}

export const makePivotData = (): PivotData => ({
  lastPh: 0,
  lastPhBar: 0,
  lastPl: 0,
  lastPlBar: 0,
});

/** Generic price zone — used for both Order Blocks (OB) and Fair Value Gaps (FVG). */
export interface ZoneBlock {
  /** +1 bullish, -1 bearish. */
  direction: Direction;
  top: number;
  bottom: number;
  /** Bar index where the zone formed. */
  barIdx: number;
}

// ---------------------------------------------------------------------------
// Per-Component Analysis Results
// ---------------------------------------------------------------------------

/**
 * Market structure analysis output.
 * Detects Break of Structure (BOS) and Change of Character (CHoCH) by
 * comparing successive swing points.
 */
export interface StructureResult {
  /** +1 HH, -1 LH, 0 equal */
  highType: number;
  /** +1 HL, -1 LL, 0 equal */
  lowType: number;
  /** +1 bull, -1 bear, 0 neutral */
  bias: Direction;
  /** Last 3 structure labels e.g. ['HH','HL','LH']. */
  labels: StructureLabel[];
}

export const makeStructureResult = (): StructureResult => ({
  highType: 0,
  lowType: 0,
  bias: Direction.NEUTRAL,
  labels: [],
});

/** Swing analysis output — current swing high/low + reclaim flags + position %. */
export interface SwingResult {
  high: number;
  low: number;
  bias: Direction;
  reclaimLow: boolean;
  reclaimHigh: boolean;
  /** Price position within swing range, 0-100. May exceed bounds in broken states. */
  positionPct: number;
}

export const makeSwingResult = (): SwingResult => ({
  high: 0,
  low: 0,
  bias: Direction.NEUTRAL,
  reclaimLow: false,
  reclaimHigh: false,
  positionPct: 0,
});

/** Single zone (OB or FVG) output with freshness flag. */
export interface ZoneResult {
  direction: Direction;
  top: number;
  bottom: number;
  barIdx: number;
  isNew: boolean;
}

/** Distance to the nearest OB or FVG zone from current price. */
export interface NearestZone {
  direction: Direction;
  /** Distance from price to zone edge (absolute). */
  distance: number;
  /** True if price is currently inside the zone. */
  isInside: boolean;
}

/** EMA analysis output. direction +1 if price > EMA (bull), -1 if below (bear). */
export interface EMAResult {
  direction: Direction;
  /** Distance from price to EMA. */
  distance: number;
  /** Current EMA value. */
  value: number;
}

export const makeEMAResult = (): EMAResult => ({
  direction: Direction.NEUTRAL,
  distance: 0,
  value: 0,
});

// ---------------------------------------------------------------------------
// Timeframe-Level Composite
// ---------------------------------------------------------------------------

/** Complete SMC analysis for a single timeframe — feeds the confluence engine. */
export interface TimeframeAnalysis {
  ema: EMAResult;
  swing: SwingResult;
  structure: StructureResult;
  nearestOb: NearestZone | null;
  nearestFvg: NearestZone | null;
  /** All non-mitigated order blocks. */
  activeObs: ZoneResult[];
  /** All non-filled fair value gaps. */
  activeFvgs: ZoneResult[];
}

export const makeTimeframeAnalysis = (): TimeframeAnalysis => ({
  ema: makeEMAResult(),
  swing: makeSwingResult(),
  structure: makeStructureResult(),
  nearestOb: null,
  nearestFvg: null,
  activeObs: [],
  activeFvgs: [],
});

// ---------------------------------------------------------------------------
// Bias / Confluence Scoring
// ---------------------------------------------------------------------------

/** Toggle which SMC components contribute to the bias calculation. */
export interface BiasConfig {
  useStructure: boolean;
  useOb: boolean;
  useFvg: boolean;
  /** Off by default — Pine original disables EMA in bias. */
  useEma: boolean;
  useSwing: boolean;
}

/** Directional bias label as rendered by the Pine indicator. */
export type BiasLabel =
  | "BULLISH"
  | "LEAN BULL"
  | "NEUTRAL"
  | "LEAN BEAR"
  | "BEARISH";

/** Directional bias output from the confluence engine. */
export interface BiasResult {
  label: BiasLabel;
  /** Raw weighted score sum. */
  score: number;
  /** Maximum possible score given enabled components & TFs. */
  maxScore: number;
  /** score / maxScore as 0-100. */
  percentage: number;
  direction: Direction;
}

export const makeBiasResult = (): BiasResult => ({
  label: "NEUTRAL",
  score: 0,
  maxScore: 0,
  percentage: 0,
  direction: Direction.NEUTRAL,
});

/**
 * Top-level multi-timeframe confluence output.
 * Main product of the SMC engine — consumed by the signal verification
 * pipeline and the dashboard UI.
 */
export interface ConfluenceReport {
  /** Keyed by timeframe string e.g. '1H'. */
  timeframeAnalyses: Record<string, TimeframeAnalysis>;
  overallBias: BiasResult;
  signalRating: SignalRating;
  /** Multiplier applied to position sizing. */
  signalScoreMultiplier: number;
  /** Human-readable confluence summary. */
  summary: string;
}

// ---------------------------------------------------------------------------
// Signal Input / Verification
// ---------------------------------------------------------------------------

/** Incoming trade signal to verify against the SMC confluence engine. */
export interface SignalInput {
  /** Trading pair e.g. 'BTCUSDT'. */
  pair: string;
  direction: "long" | "short";
  entry: number;
  stopLoss: number;
  takeProfits: number[];
  /** 1-125 if provided. */
  leverage: number | null;
}

/** Full signal verification — extends ConfluenceReport with trade context. */
export interface SignalVerification extends ConfluenceReport {
  signal: SignalInput;
  currentPrice: number;
  /** % distance from current price to entry. */
  entryDistancePct: number;
  entryStatus: EntryStatus;
  /** R:R ratio to first TP. */
  riskReward: number;
  /** Suggested position size as % of capital. */
  suggestedSizePct: number;
  /** Risk per trade as % of capital. */
  riskPct: number;
}

/**
 * SMC/ICT Engine — TypeScript port of the validated Python prototype.
 *
 * Source of truth for engine semantics:
 *   psyd3x/lazytrader@feat/opendeedee-integration src/smc_engine/
 *
 * Validation:
 *   golden fixtures live in `validation-fixtures/` and are exercised by the
 *   vitest suite under `src/smc/__tests__/` to confirm parity with Python.
 */

// Models / types
export type {
  Candle,
  Direction,
  StructureLabel,
  SignalRating,
  EntryStatus,
  TimeframeConfig,
  SwingData,
  PivotData,
  ZoneBlock,
  StructureResult,
  SwingResult,
  ZoneResult,
  NearestZone,
  EMAResult,
  TimeframeAnalysis,
  BiasConfig,
  BiasLabel,
  BiasResult,
  ConfluenceReport,
  SignalInput,
  SignalVerification,
} from "./models";
export {
  Direction as DirectionEnum,
  makeSwingData,
  makePivotData,
  makeStructureResult,
  makeSwingResult,
  makeEMAResult,
  makeTimeframeAnalysis,
  makeBiasResult,
} from "./models";

// Config
export {
  DEFAULT_TIMEFRAMES,
  DEFAULT_BIAS_CONFIG,
  EMA_LENGTH,
  SWING_LENGTH,
  ATR_LENGTH,
  ATR_AVG_LENGTH,
  VOLUME_LENGTH,
  SIGNAL_RATING_THRESHOLDS,
  BIAS_LABEL_THRESHOLDS,
  ENTRY_DISTANCE_AT_ENTRY_PCT,
  ENTRY_DISTANCE_MISSED_PCT,
  getSignalRating,
  getBiasLabel,
} from "./config";
export type {
  SignalRatingThreshold,
  SignalRatingResolved,
  BiasLabelThreshold,
  BiasLabelResolved,
} from "./config";

// Sessions
export { Session, Killzone, classifySession, isKillzone } from "./sessions";
export type { SessionState } from "./sessions";

// Primitives
export {
  calcEma,
  calcTrend,
  detectPivots,
  SwingTracker,
  StructureTracker,
  detectFvg,
  findLowestCandle,
  findHighestCandle,
  calcAtr,
  calcVolatilityState,
  calcVolumeState,
  swingBiasDirection,
  calcPositionPct,
} from "./primitives";
export type {
  TrendState,
  PivotArrays,
  SwingTrackerResult,
  StructureTrackerResult,
  FvgDetection,
  ExtremeCandle,
  VolatilityState,
  VolumeState,
} from "./primitives";

// Zones
export {
  OrderBlockTracker,
  FVGTracker,
  findNearest,
  zoneInState,
  findCombinedNearest,
} from "./zones";

// Confluence
export { ConfluenceEngine } from "./confluence";
export type {
  FactorAgreement,
  TimeframeBreakdown,
  ConfluenceMatrix,
  ConfluenceEngineOptions,
} from "./confluence";

// Analyzer
export { TimeframeAnalyzer, analyzeTimeframe } from "./analyzer";
export type { TimeframeAnalyzerOptions } from "./analyzer";

// Scorer + pipeline
export {
  SignalScorer,
  DEFAULT_SCORING_WEIGHTS,
  DEFAULT_TP_WEIGHTS,
  calculatePositionSize,
  generateSignalVerification,
} from "./scorer";
export type {
  FactorScore,
  ScoreReport,
  PositionSizeResult,
  PositionSizeOpts,
  SignalScorerOptions,
  RiskRules,
  SignalVerificationReport,
  GenerateSignalVerificationOpts,
} from "./scorer";

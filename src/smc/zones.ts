/**
 * SMC/ICT Zone Management — Order Blocks & Fair Value Gaps
 *
 * Source: psyd3x/lazytrader@feat/opendeedee-integration src/smc_engine/zones.py
 *
 * - Order Blocks via pivot-break lookback (find extreme candle in the
 *   pivot→break window).
 * - FVGs via 3-candle gap pattern with Pine `_green/_red` OR-clause for
 *   gray middle candles.
 * - Mitigation removes invalidated zones each bar.
 * - Direction-aware nearest-zone search (bull dist = top − close; bear
 *   dist = bottom − close), smallest |dist| wins.
 */

import type { Candle, NearestZone, ZoneBlock, ZoneResult } from "./models";
import { Direction } from "./models";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Mutable pivot tracking state for OB detection. */
interface PivotState {
  lastPh: number;
  lastPhBar: number;
  lastPl: number;
  lastPlBar: number;
  /** True once the most recent pivot break has been consumed. */
  phBroken: boolean;
  plBroken: boolean;
}

const makePivotState = (): PivotState => ({
  lastPh: 0,
  lastPhBar: 0,
  lastPl: 0,
  lastPlBar: 0,
  phBroken: false,
  plBroken: false,
});

/** Centered pivot-high check at `idx − length`. Returns the pivot value or null. */
function isPivotHigh(
  candles: readonly Candle[],
  idx: number,
  length: number,
): number | null {
  const pivotBar = idx - length;
  if (pivotBar < length || pivotBar >= candles.length) return null;

  const pivotVal = candles[pivotBar].high;
  for (let offset = 1; offset <= length; offset++) {
    const left = pivotBar - offset;
    const right = pivotBar + offset;
    if (left < 0 || right >= candles.length) return null;
    if (candles[left].high > pivotVal || candles[right].high > pivotVal) {
      return null;
    }
  }
  return pivotVal;
}

/** Centered pivot-low check at `idx − length`. Returns the pivot value or null. */
function isPivotLow(
  candles: readonly Candle[],
  idx: number,
  length: number,
): number | null {
  const pivotBar = idx - length;
  if (pivotBar < length || pivotBar >= candles.length) return null;

  const pivotVal = candles[pivotBar].low;
  for (let offset = 1; offset <= length; offset++) {
    const left = pivotBar - offset;
    const right = pivotBar + offset;
    if (left < 0 || right >= candles.length) return null;
    if (candles[left].low < pivotVal || candles[right].low < pivotVal) {
      return null;
    }
  }
  return pivotVal;
}

/** True if zones [aBot, aTop] and [bBot, bTop] overlap vertically. */
function zonesOverlap(
  aTop: number,
  aBot: number,
  bTop: number,
  bBot: number,
): boolean {
  return aBot <= bTop && bBot <= aTop;
}

// ===========================================================================
// Order Block Tracker
// ===========================================================================

/**
 * Tracks Order Blocks across candle updates.
 *
 * Detection: pivots → break → scan pivot→break window for extreme candle →
 * that candle's range becomes the OB. Skips overlapping same-direction zones.
 *
 * Mitigation:
 * - Bull OB removed when close < ob.bottom (support failed).
 * - Bear OB removed when close > ob.top (resistance broken).
 */
export class OrderBlockTracker {
  private readonly maxObs: number;
  private readonly swingLength: number;
  private obs: ZoneBlock[] = [];
  private pivot: PivotState = makePivotState();

  constructor(opts: { maxObs?: number; swingLength?: number } = {}) {
    this.maxObs = opts.maxObs ?? 6;
    this.swingLength = opts.swingLength ?? 5;
  }

  /**
   * Process candle at `currentIdx`, detect new OB, mitigate old ones.
   * Returns the freshly created ZoneResult or null.
   */
  update(candles: readonly Candle[], currentIdx: number): ZoneResult | null {
    if (currentIdx < this.swingLength * 2 + 1) return null;
    const newOb = this.detect(candles, currentIdx);
    this.mitigate(candles, currentIdx);
    return newOb;
  }

  /** Find nearest unmitigated OB to current price (direction-aware). */
  getNearest(currentPrice: number): NearestZone | null {
    return findNearest(this.obs, currentPrice);
  }

  /** All unmitigated OBs (defensive copy). */
  getAllActive(): ZoneBlock[] {
    return [...this.obs];
  }

  // ---- internals --------------------------------------------------------

  private detect(candles: readonly Candle[], idx: number): ZoneResult | null {
    const c = candles[idx];

    // Update pivots (centered, so we look at idx − swingLength)
    const ph = isPivotHigh(candles, idx, this.swingLength);
    if (ph !== null) {
      this.pivot.lastPh = ph;
      this.pivot.lastPhBar = idx - this.swingLength;
      this.pivot.phBroken = false;
    }
    const pl = isPivotLow(candles, idx, this.swingLength);
    if (pl !== null) {
      this.pivot.lastPl = pl;
      this.pivot.lastPlBar = idx - this.swingLength;
      this.pivot.plBroken = false;
    }

    let newOb: ZoneResult | null = null;

    // Bull break: close crosses above last pivot high
    if (this.pivot.lastPh > 0 && !this.pivot.phBroken && idx > 0) {
      const prevClose = candles[idx - 1].close;
      if (c.close > this.pivot.lastPh && prevClose <= this.pivot.lastPh) {
        this.pivot.phBroken = true;
        const ob = this.buildBullOb(candles, idx, this.pivot.lastPhBar);
        if (ob !== null) {
          newOb = { ...ob, isNew: true };
        }
      }
    }

    // Bear break: close crosses below last pivot low (overrides bull if both fire)
    if (this.pivot.lastPl > 0 && !this.pivot.plBroken && idx > 0) {
      const prevClose = candles[idx - 1].close;
      if (c.close < this.pivot.lastPl && prevClose >= this.pivot.lastPl) {
        this.pivot.plBroken = true;
        const ob = this.buildBearOb(candles, idx, this.pivot.lastPlBar);
        if (ob !== null) {
          newOb = { ...ob, isNew: true };
        }
      }
    }

    return newOb;
  }

  /** Bull OB: lowest-low candle in [pivotBar, breakIdx] becomes the support zone. */
  private buildBullOb(
    candles: readonly Candle[],
    breakIdx: number,
    pivotBar: number,
  ): ZoneBlock | null {
    if (pivotBar >= breakIdx) return null;

    let lowestIdx = pivotBar;
    let lowestVal = candles[pivotBar].low;
    for (let i = pivotBar + 1; i <= breakIdx; i++) {
      if (i < candles.length && candles[i].low < lowestVal) {
        lowestVal = candles[i].low;
        lowestIdx = i;
      }
    }

    const obCandle = candles[lowestIdx];
    const ob: ZoneBlock = {
      direction: Direction.BULL,
      top: obCandle.high,
      bottom: obCandle.low,
      barIdx: lowestIdx,
    };

    if (this.hasOverlapping(ob)) return null;
    this.add(ob);
    return ob;
  }

  /** Bear OB: highest-high candle in [pivotBar, breakIdx] becomes resistance. */
  private buildBearOb(
    candles: readonly Candle[],
    breakIdx: number,
    pivotBar: number,
  ): ZoneBlock | null {
    if (pivotBar >= breakIdx) return null;

    let highestIdx = pivotBar;
    let highestVal = candles[pivotBar].high;
    for (let i = pivotBar + 1; i <= breakIdx; i++) {
      if (i < candles.length && candles[i].high > highestVal) {
        highestVal = candles[i].high;
        highestIdx = i;
      }
    }

    const obCandle = candles[highestIdx];
    const ob: ZoneBlock = {
      direction: Direction.BEAR,
      top: obCandle.high,
      bottom: obCandle.low,
      barIdx: highestIdx,
    };

    if (this.hasOverlapping(ob)) return null;
    this.add(ob);
    return ob;
  }

  private hasOverlapping(newOb: ZoneBlock): boolean {
    for (const ob of this.obs) {
      if (
        ob.direction === newOb.direction &&
        zonesOverlap(ob.top, ob.bottom, newOb.top, newOb.bottom)
      ) {
        return true;
      }
    }
    return false;
  }

  private add(ob: ZoneBlock): void {
    this.obs.push(ob);
    while (this.obs.length > this.maxObs) {
      this.obs.shift();
    }
  }

  private mitigate(candles: readonly Candle[], idx: number): void {
    const close = candles[idx].close;
    this.obs = this.obs.filter((ob) => {
      if (ob.direction === Direction.BULL && close < ob.bottom) return false;
      if (ob.direction === Direction.BEAR && close > ob.top) return false;
      return true;
    });
  }
}

// ===========================================================================
// FVG Tracker
// ===========================================================================

/**
 * Tracks Fair Value Gaps using the Pine 3-candle pattern.
 *
 * Mapping (current bar = `idx`, evaluating the gap between idx−3 and idx−1):
 *   c0 = candles[idx−3]   oldest    ("candle[-3]" in Pine spec)
 *   c1 = candles[idx−2]   middle    ("candle[-2]" — gap candle)
 *   c2 = candles[idx−1]   newest    ("candle[-1]")
 *
 * Pine `_green` / `_red` OR-clause: middle candle counts as green if
 * `close > open` OR `close > close[1]` (mirror for red). Captures gray
 * middle candles that still drift directionally.
 *
 * Mitigation: bull FVG filled when low < fvg.bottom; bear FVG when
 * high > fvg.top.
 */
export class FVGTracker {
  private readonly maxFvgs: number;
  private fvgs: ZoneBlock[] = [];

  constructor(opts: { maxFvgs?: number } = {}) {
    this.maxFvgs = opts.maxFvgs ?? 6;
  }

  update(candles: readonly Candle[], currentIdx: number): ZoneResult | null {
    const newFvg = this.detect(candles, currentIdx);
    this.mitigate(candles, currentIdx);
    return newFvg;
  }

  getNearest(currentPrice: number): NearestZone | null {
    return findNearest(this.fvgs, currentPrice);
  }

  getAllActive(): ZoneBlock[] {
    return [...this.fvgs];
  }

  // ---- internals --------------------------------------------------------

  private detect(candles: readonly Candle[], idx: number): ZoneResult | null {
    if (idx < 3) return null;

    const c0 = candles[idx - 3]; // oldest
    const c1 = candles[idx - 2]; // middle (gap candle)
    const c2 = candles[idx - 1]; // newest of the 3

    const c1Green = c1.close > c1.open || c1.close > c0.close;
    const c1Red = c1.close < c1.open || c1.close < c0.close;

    let newFvg: ZoneBlock | null = null;

    // Bull FVG: gap between c0.high (bot) and c2.low (top), middle is green
    if (
      c2.low > c0.high &&
      c1Green &&
      c2.low < c1.high &&
      c1.low < c0.high
    ) {
      newFvg = {
        direction: Direction.BULL,
        top: c2.low,
        bottom: c0.high,
        barIdx: idx - 2,
      };
    } else if (
      // Bear FVG: gap between c2.high (bot) and c0.low (top), middle is red
      c2.high < c0.low &&
      c1Red &&
      c2.high > c1.low &&
      c1.high > c0.low
    ) {
      newFvg = {
        direction: Direction.BEAR,
        top: c0.low,
        bottom: c2.high,
        barIdx: idx - 2,
      };
    }

    if (newFvg !== null) {
      this.fvgs.push(newFvg);
      while (this.fvgs.length > this.maxFvgs) this.fvgs.shift();
      return { ...newFvg, isNew: true };
    }
    return null;
  }

  private mitigate(candles: readonly Candle[], idx: number): void {
    const c = candles[idx];
    this.fvgs = this.fvgs.filter((fvg) => {
      if (fvg.direction === Direction.BULL && c.low < fvg.bottom) return false;
      if (fvg.direction === Direction.BEAR && c.high > fvg.top) return false;
      return true;
    });
  }
}

// ===========================================================================
// Shared zone utilities
// ===========================================================================

/**
 * Pine `findNearestZone` — direction-aware distance always (even when inside).
 *
 * - Bull zones: `dist = top − close`
 * - Bear zones: `dist = bottom − close`
 * - Smallest `|dist|` wins regardless of strict containment.
 * - `isInside` reported separately (strict containment) for downstream use.
 *
 * This lets a bear zone whose bottom is just below price beat a bull zone
 * whose top is well above — both contain price but the bear is "closer".
 */
export function findNearest(
  zones: readonly ZoneBlock[],
  currentPrice: number,
): NearestZone | null {
  if (zones.length === 0) return null;

  let best: NearestZone | null = null;
  let bestAbsDist = Infinity;

  for (const z of zones) {
    const dist = z.direction > 0 ? z.top - currentPrice : z.bottom - currentPrice;
    const absDist = Math.abs(dist);
    const isInside = z.bottom <= currentPrice && currentPrice <= z.top;

    if (absDist < bestAbsDist) {
      bestAbsDist = absDist;
      best = { direction: z.direction, distance: dist, isInside };
    }
  }

  return best;
}

/**
 * Pine `zoneInState(nearDir, nearDist)` —
 *   +1 inside bullish, -1 inside bearish, 0 otherwise.
 */
export function zoneInState(nearest: NearestZone | null): number {
  if (nearest === null || !nearest.isInside) return 0;
  return nearest.direction;
}

/**
 * Single nearest zone across both OBs and FVGs combined.
 * Inside-zones beat outside-zones; otherwise smallest |dist| wins.
 */
export function findCombinedNearest(
  obTracker: OrderBlockTracker,
  fvgTracker: FVGTracker,
  currentPrice: number,
): NearestZone | null {
  const ob = obTracker.getNearest(currentPrice);
  const fvg = fvgTracker.getNearest(currentPrice);

  if (ob === null) return fvg;
  if (fvg === null) return ob;

  if (ob.isInside && !fvg.isInside) return ob;
  if (fvg.isInside && !ob.isInside) return fvg;

  return Math.abs(ob.distance) <= Math.abs(fvg.distance) ? ob : fvg;
}

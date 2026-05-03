/**
 * Golden fixture parity test — TS engine output must match the captured
 * Python engine output (within tolerances) on the same input candles.
 *
 * Fixtures: `validation-fixtures/{btc,eth,sol}-now-{input,expected}.json`,
 * captured 2026-05-03 from the validated Python engine at
 * psyd3x/lazytrader@feat/opendeedee-integration.
 *
 * Tolerances per `expected.tolerance`:
 *   - structure_label, ob_fvg_direction, bias_label, bias_score, ema_direction → exact
 *   - ema_value           → 0.001 absolute
 *   - swing_position_pct  → 0.5 absolute
 *   - ob_fvg_distance     → 0.05% relative
 *   - bias_percentage     → 2 absolute
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { Candle, TimeframeAnalysis } from "../models";
import { TimeframeAnalyzer } from "../analyzer";
import { ConfluenceEngine } from "../confluence";
import { classifySession } from "../sessions";

// ---------------------------------------------------------------------------
// Fixture types (snake_case to mirror the Python output JSON)
// ---------------------------------------------------------------------------

interface FixtureCandle {
  ts: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface InputFixture {
  pair: string;
  captured_at_ts: number;
  primary_tf: string;
  current_price: number;
  candles: Record<string, FixtureCandle[]>;
}

interface ExpectedEma {
  direction: number;
  distance: number;
  value: number;
}

interface ExpectedSwing {
  high: number;
  low: number;
  bias: number;
  reclaim_low: boolean;
  reclaim_high: boolean;
  position_pct: number;
}

interface ExpectedStructure {
  high_type: number;
  low_type: number;
  bias: number;
  labels: string[];
}

interface ExpectedNearestZone {
  direction: number;
  distance: number;
  is_inside: boolean;
}

interface ExpectedZone {
  direction: number;
  top: number;
  bottom: number;
  bar_idx: number;
}

interface ExpectedTfAnalysis {
  ema: ExpectedEma;
  swing: ExpectedSwing;
  structure: ExpectedStructure;
  nearest_ob: ExpectedNearestZone | null;
  nearest_fvg: ExpectedNearestZone | null;
  active_obs: ExpectedZone[];
  active_fvgs: ExpectedZone[];
}

interface ExpectedBias {
  label: string;
  score: number;
  max_score: number;
  percentage: number;
  direction: number;
}

interface ExpectedSession {
  session: string;
  killzone: string;
}

interface ExpectedFixture {
  fixture_id: string;
  pair: string;
  captured_at_ts: number;
  current_price: number;
  bias: ExpectedBias;
  session: ExpectedSession;
  current_volatility_state: number;
  current_volume_state: number;
  timeframe_analyses: Record<string, ExpectedTfAnalysis>;
  // confluence_matrix not asserted — implementation detail of the dashboard.
}

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.resolve(__dirname, "../../../validation-fixtures");

function loadFixtureIds(): string[] {
  const indexJson = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, "INDEX.json"), "utf-8"),
  ) as { fixtures: string[] };
  return indexJson.fixtures;
}

function loadInput(id: string): InputFixture {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, `${id}-input.json`), "utf-8"),
  ) as InputFixture;
}

function loadExpected(id: string): ExpectedFixture {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, `${id}-expected.json`), "utf-8"),
  ) as ExpectedFixture;
}

function toCandle(fc: FixtureCandle): Candle {
  return {
    timestamp: fc.ts,
    open: fc.o,
    high: fc.h,
    low: fc.l,
    close: fc.c,
    volume: fc.v,
  };
}

// ---------------------------------------------------------------------------
// Tolerance comparators
// ---------------------------------------------------------------------------

const ABS = (a: number, b: number, tol: number): boolean =>
  Math.abs(a - b) <= tol + 1e-9;

const REL = (a: number, b: number, pct: number): boolean => {
  const denom = Math.max(Math.abs(b), 1e-9);
  return Math.abs(a - b) / denom <= pct / 100 + 1e-9;
};

// ---------------------------------------------------------------------------
// TF analysis comparison
// ---------------------------------------------------------------------------

interface ComparisonContext {
  pair: string;
  tf: string;
}

function compareTfAnalysis(
  actual: TimeframeAnalysis,
  expected: ExpectedTfAnalysis,
  ctx: ComparisonContext,
): void {
  const tag = `[${ctx.pair} ${ctx.tf}]`;

  // EMA
  expect(actual.ema.direction, `${tag} ema.direction`).toBe(expected.ema.direction);
  expect(
    ABS(actual.ema.value, expected.ema.value, 0.001),
    `${tag} ema.value: actual=${actual.ema.value} expected=${expected.ema.value}`,
  ).toBe(true);

  // Swing
  expect(
    ABS(actual.swing.positionPct, expected.swing.position_pct, 0.5),
    `${tag} swing.positionPct: actual=${actual.swing.positionPct} expected=${expected.swing.position_pct}`,
  ).toBe(true);
  expect(actual.swing.bias, `${tag} swing.bias`).toBe(expected.swing.bias);
  expect(actual.swing.reclaimLow, `${tag} swing.reclaimLow`).toBe(
    expected.swing.reclaim_low,
  );
  expect(actual.swing.reclaimHigh, `${tag} swing.reclaimHigh`).toBe(
    expected.swing.reclaim_high,
  );

  // Structure
  expect(actual.structure.highType, `${tag} structure.highType`).toBe(
    expected.structure.high_type,
  );
  expect(actual.structure.lowType, `${tag} structure.lowType`).toBe(
    expected.structure.low_type,
  );
  expect(actual.structure.bias, `${tag} structure.bias`).toBe(expected.structure.bias);
  expect(actual.structure.labels, `${tag} structure.labels`).toEqual(
    expected.structure.labels,
  );

  // Nearest OB
  if (expected.nearest_ob === null) {
    expect(actual.nearestOb, `${tag} nearest_ob should be null`).toBeNull();
  } else {
    expect(actual.nearestOb, `${tag} nearest_ob should not be null`).not.toBeNull();
    if (actual.nearestOb !== null) {
      expect(actual.nearestOb.direction, `${tag} nearest_ob.direction`).toBe(
        expected.nearest_ob.direction,
      );
      expect(actual.nearestOb.isInside, `${tag} nearest_ob.isInside`).toBe(
        expected.nearest_ob.is_inside,
      );
      expect(
        REL(actual.nearestOb.distance, expected.nearest_ob.distance, 0.05),
        `${tag} nearest_ob.distance: actual=${actual.nearestOb.distance} expected=${expected.nearest_ob.distance}`,
      ).toBe(true);
    }
  }

  // Nearest FVG
  if (expected.nearest_fvg === null) {
    expect(actual.nearestFvg, `${tag} nearest_fvg should be null`).toBeNull();
  } else {
    expect(actual.nearestFvg, `${tag} nearest_fvg should not be null`).not.toBeNull();
    if (actual.nearestFvg !== null) {
      expect(actual.nearestFvg.direction, `${tag} nearest_fvg.direction`).toBe(
        expected.nearest_fvg.direction,
      );
      expect(actual.nearestFvg.isInside, `${tag} nearest_fvg.isInside`).toBe(
        expected.nearest_fvg.is_inside,
      );
      expect(
        REL(actual.nearestFvg.distance, expected.nearest_fvg.distance, 0.05),
        `${tag} nearest_fvg.distance: actual=${actual.nearestFvg.distance} expected=${expected.nearest_fvg.distance}`,
      ).toBe(true);
    }
  }
}

// ---------------------------------------------------------------------------
// The test suite
// ---------------------------------------------------------------------------

const FIXTURE_IDS = loadFixtureIds();

describe("SMC engine — golden fixture parity (TS vs Python)", () => {
  for (const id of FIXTURE_IDS) {
    describe(`fixture ${id}`, () => {
      const input = loadInput(id);
      const expected = loadExpected(id);

      // Pre-compute the per-TF analyses once for the shared scope
      const analyzer = new TimeframeAnalyzer();
      const tfAnalyses: Record<string, TimeframeAnalysis> = {};
      for (const [tfStr, fcs] of Object.entries(input.candles)) {
        tfAnalyses[tfStr] = analyzer.analyze(fcs.map(toCandle));
      }

      it("session classification matches", () => {
        const actualSession = classifySession(input.captured_at_ts);
        expect(actualSession.session).toBe(expected.session.session);
        // The killzone field in the expected fixture stores "NONE" for the
        // none-state; map our enum value back to that representation.
        const actualKz = actualSession.killzone === "NO KILLZONE" ? "NONE" : actualSession.killzone;
        expect(actualKz).toBe(expected.session.killzone);
      });

      it("overall bias matches Python output", () => {
        const engine = new ConfluenceEngine();
        const bias = engine.calculateBias(tfAnalyses);

        expect(bias.label, `${id} bias.label`).toBe(expected.bias.label);
        expect(bias.score, `${id} bias.score`).toBe(expected.bias.score);
        expect(bias.maxScore, `${id} bias.max_score`).toBe(expected.bias.max_score);
        expect(bias.direction, `${id} bias.direction`).toBe(expected.bias.direction);
        expect(
          ABS(bias.percentage, expected.bias.percentage, 2),
          `${id} bias.percentage: actual=${bias.percentage} expected=${expected.bias.percentage}`,
        ).toBe(true);
      });

      // One sub-test per timeframe so failures point precisely
      for (const tfStr of Object.keys(input.candles)) {
        it(`timeframe ${tfStr} analysis matches`, () => {
          const exp = expected.timeframe_analyses[tfStr];
          if (exp === undefined) {
            // Skip TFs we don't have an expected for (shouldn't happen with
            // current fixtures but keeps the test forward-compatible)
            return;
          }
          compareTfAnalysis(tfAnalyses[tfStr], exp, { pair: input.pair, tf: tfStr });
        });
      }
    });
  }
});

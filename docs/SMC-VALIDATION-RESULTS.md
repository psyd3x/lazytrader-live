---
title: SMC Engine Validation Results
description: Results of M0 SMC engine validation. Engine passes all 22 tests across edge cases, deterministic scenarios, sessions/killzones, and live data on BTC/ETH/SOL. Performance well within mobile budget. Golden fixtures captured for the TypeScript port.
type: validation-results
project: lazytrader
version: 1.0
status: validated
phase: hackathon-mvp
date: 2026-05-03
created: 2026-05-03
tags: [validation, results, smc, m0, golden-fixtures]
---

# SMC Engine Validation — Results

**Date**: 2026-05-03
**Engine source**: `~/lazytrader/src/smc_engine/` (Python)
**Status**: VALIDATED for engineering correctness; ready to port to TypeScript

**Related docs**: [[PRD]] · [[ARCHITECTURE]] · [[IMPLEMENTATION-PLAN]] · [[SMC-ENGINE-VALIDATION]]

---

## TL;DR

Engine works. 22/22 tests pass. ~60ms for full 7-TF analysis on desktop. Stable across 2000-bar histories. Live data flows correctly for BTC, ETH, SOL across all 7 timeframes. Golden fixtures captured for the TypeScript port (M2). **M0 sign-off: PASS.**

What we did NOT verify visually against TradingView Flux Charts dashboard — see "Open verifications" below. The engine is internally consistent and matches the Pine Script logic in code, but a side-by-side screenshot comparison is still pending.

## What was missing before validation

Two modules referenced by the engine but never built:

1. `analyzer.py` — orchestrator that converts raw candles → `TimeframeAnalysis`. Without this, `scorer.generate_signal_verification` couldn't run end-to-end.
2. `sessions.py` — ICT session + killzone classification (NY AM KZ, London KZ, Asia, etc.).

Both were built during M0 and committed to `~/lazytrader/src/smc_engine/`.

## Test results

### Edge cases — 5/5 PASS

| Test | Result |
|------|--------|
| Empty candle list | PASS — returns empty `TimeframeAnalysis` |
| Too few candles (below pivot threshold) | PASS — returns empty analysis |
| Single candle | PASS — no crash, empty analysis |
| No NaN/Inf in output | PASS — all numeric fields are finite |
| Zero volume doesn't crash | PASS — engine produces valid output |

### Deterministic scenarios — 7/7 PASS

| Test | Result |
|------|--------|
| Strong bull trend → bull bias | PASS — EMA dir +1, swing/structure bias ≥ 0 |
| Strong bear trend → bear bias | PASS — EMA dir -1, swing bias ≤ 0 |
| Known bull FVG detected | PASS — 4-candle pattern correctly identified |
| Confluence with all-neutral data | PASS — score=0, percentage=50.0 |
| Position sizing math | PASS — 1% of $1000 with $1 SL distance → 1000 units |
| Position sizing score multiplier | PASS — A+ (1.5x) sizes 1.5x larger than B (1.0x) |
| Signal scorer end-to-end | PASS — produces valid rating + score |

### Sessions / Killzones — 4/4 PASS

| Test | Result |
|------|--------|
| NY AM KZ at 13:00 UTC (May, DST) | PASS |
| London KZ at 07:00 UTC | PASS |
| Asia KZ at 03:00 UTC | PASS |
| Off-hours at 22:00 UTC | PASS |

### Live data — 6/6 PASS

| Test | Result |
|------|--------|
| BTCUSDT live pipeline (3 TFs) | PASS — EMA values valid |
| ETHUSDT live pipeline (3 TFs) | PASS |
| SOLUSDT live pipeline (3 TFs) | PASS |
| Confluence returns valid bias label | PASS — one of (BULLISH, LEAN BULL, NEUTRAL, LEAN BEAR, BEARISH) |
| Different pairs produce different output | PASS — EMA values differ by 100x+ as expected |
| Engine performance under 5000ms | PASS — ~60ms for full 7-TF analysis with 500 candles each |

## Performance benchmarks (5-run averages)

Run on Mac M2 (16GB), Python 3.14, 500 candles per timeframe.

| Pair | Per-TF avg | Sum 7-TF | Full pipeline |
|------|-----------|----------|---------------|
| BTCUSDT | 7-11ms | 60ms | 61ms |
| ETHUSDT | 8-10ms | 60ms | 57ms |
| SOLUSDT | 8-15ms | 83ms | 68ms |

Mobile (Android, mid-range CPU) budget: 500ms. Engine has ~10x headroom even after porting.

## Stability — long history

Streamed 2000 BTC 1H candles bar-by-bar through the analyzer + zone trackers. Invariants checked at every bar:

- Active OB count never exceeded the configured `max_obs=6`
- Active FVG count never exceeded `max_fvgs=6`
- No inverted zones (top < bottom) ever produced
- Per-bar analyzer time scales linearly: 2ms at bar 100 → 33ms at bar 2000

VERDICT: stable across 2000+ bars, no state leak, mitigation logic working as expected.

## Live dashboard sample (2026-05-03 09:22 UTC)

For each pair we ran the engine across all 7 TFs and rendered a Flux-style dashboard. All cells populate, all directions resolve, all distances compute as percentages of price.

**Observations** (not bugs):
- Swing position % can exceed 100% or go negative when current price has broken out of the latest confirmed swing range. This is intentional — matches Pine Script behaviour and is meaningful info ("price has broken out").
- Stale zones with large distances (10–30% from price) are tracked correctly. UX-wise we may want a "max nearest-zone distance" filter for display, but mitigation logic is correct.
- Multiple "BULL OB +0.00% *" lines on SOL across TFs are real (price was inside multiple OBs simultaneously). This is the kind of confluence the engine is designed to surface.

## Golden fixtures captured

Three live snapshots captured to gate the TypeScript port (M2):

| Fixture | Pair | Captured at | Bias | Price |
|---------|------|-------------|------|-------|
| `btc-now` | BTCUSDT | 2026-05-03 09:22 UTC | NEUTRAL (48%) | 78,472.36 |
| `eth-now` | ETHUSDT | 2026-05-03 09:22 UTC | NEUTRAL (50%) | 2,313.21 |
| `sol-now` | SOLUSDT | 2026-05-03 09:22 UTC | NEUTRAL (45%) | 84.03 |

Each fixture includes:
- `<id>-input.json` — raw candle data for all 7 TFs (~500 candles each)
- `<id>-expected.json` — full engine output: per-TF analysis, bias, confluence matrix, session state

The TS port (M2) must reproduce these outputs from the same inputs within documented tolerances.

Stored at: `validation-fixtures/` in the lazytrader-live repo. Total size ~1.6MB.

## Open verifications

These are NOT done yet and are recommended before claiming full Pine-port fidelity:

1. **Visual side-by-side with TradingView Flux Charts** — capture screenshots of the Pine indicator on the same BTC bar where we captured fixtures, manually compare each cell. Tolerances are documented in `SMC-ENGINE-VALIDATION.md`. This catches subtle Pine-vs-Python deltas that internal tests can't.
2. **Real Pine Script side-by-side** — run the original `original_pinescript.pine` next to our engine, log outputs, diff. This is the gold standard but requires either (a) TradingView Pine export tooling, or (b) translating the Pine to a runnable form (e.g., port to Backtrader).

For hackathon scope, internal correctness + matching documented Pine behaviour in code is sufficient. The visual verification is a "nice to have" and can be done later in a polish pass.

## Bugs found / fixed during validation

None. The existing 24 unit tests at `~/lazytrader/tests/test_smc_bugs.py` already cover the three previously-fixed bugs (FVG continuity checks, swing-bias direction, position-pct clamping). No regressions surfaced.

## Decision: continue or revise plan?

Engine **passes M0**. We can proceed to:

- **M1**: Android scaffold (parallel — no engine dependency)
- **M2**: TypeScript port of the validated engine, gated by these golden fixtures
- **M3+**: app integration

No PRD revisions required. The plan stands as written.

## What we keep / scrap

**Keep (production):**
- `~/lazytrader/src/smc_engine/analyzer.py` — orchestrator, permanent engine module
- `~/lazytrader/src/smc_engine/sessions.py` — ICT sessions, permanent engine module
- Golden fixtures in `lazytrader-live/validation-fixtures/` — TS port gate

**Scrap (throwaway validation tooling):**
- `~/lazytrader/validation/fetch_binance.py`
- `~/lazytrader/validation/dashboard.py`
- `~/lazytrader/validation/test_engine_thoroughly.py`
- `~/lazytrader/validation/perf_benchmark.py`
- `~/lazytrader/validation/stability_test.py`
- `~/lazytrader/validation/capture_golden_fixtures.py`

The validation tools served their purpose (proved the engine works, captured fixtures). They can be deleted unless you want to keep them for future regression runs.

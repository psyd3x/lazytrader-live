---
title: SMC Engine Validation Plan
description: How to prove the LazyTrader SMC/ICT engine matches the Flux Charts Pine Script indicator on real BTC/ETH/SOL data. Mandatory M0 milestone — gates everything downstream.
type: validation-plan
project: lazytrader
version: 1.0
status: draft
phase: hackathon-mvp
date: 2026-05-03
created: 2026-05-03
tags: [smc, ict, validation, testing, golden-fixtures, flux-charts]
---

# SMC Engine Validation Plan

The SMC/ICT engine is the heart of the product. If it produces wrong analysis, the app gives wrong ratings, and users lose money on bad trades. Before any UI work begins, we must prove the engine output matches the reference Pine Script indicator on real market data.

**Related docs**: [[PRD]] · [[ARCHITECTURE]] · [[IMPLEMENTATION-PLAN]] · [[ANDROID-DEV-SETUP]]

**Reference indicator**: Flux Charts "Market Structure Dashboard" — https://www.tradingview.com/script/vXui7vrm-Market-Structure-Dashboard-Flux-Charts/

---

## 1. What we are validating

The Python engine at `~/lazytrader/src/smc_engine/` is a port of the Flux Charts Pine Script indicator. We need to confirm the port is faithful, then capture golden fixtures for the TypeScript port that ships in the app.

The dashboard exposes these per-timeframe outputs:

| Field | Source module | Validation method |
|-------|--------------|-------------------|
| Swing H/L | `primitives.SwingTracker` | Compare swing high/low values to dashboard at same bar |
| Structure (HH/HL/LH/LL labels) | `primitives.StructureTracker` | Compare label string to dashboard |
| Order Block (Bull/Bear + distance %) | `zones.OrderBlockTracker` | Compare nearest OB direction + distance |
| FVG (Bull/Bear + distance %) | `zones.FVGTracker` | Compare nearest FVG direction + distance |
| EMA-9 trend (% distance) | `primitives.calc_ema` + `calc_trend` | Compare direction + signed distance |
| Volume state | `primitives.calc_volume_state` | Compare normal/high/low classification |
| Volatility state | `primitives.calc_volatility_state` | Compare normal/high/low classification |
| Session (NY / London / Asia) | `sessions.py` (NEW — to build in M0.3) | Compare to dashboard "SESSION" cell |
| Killzone (NY AM KZ / London KZ / etc.) | `sessions.py` (NEW) | Compare to dashboard "KILLZONE" cell |
| Trend bias (-N/M score, label) | `confluence.ConfluenceEngine.calculate_bias` | Compare numerator/denominator/label |

## 2. Validation methodology

We use **snapshot comparison** on historical data:

1. Pick a specific historical timestamp where the dashboard state was visually captured
2. Fetch all 7 timeframe candles up to that timestamp
3. Run the Python engine on those candles
4. Compare each engine output field to the dashboard screenshot
5. Document deltas, fix engine, re-run until matching within tolerance

We pick **5 distinct snapshots** spanning:
- Bullish trend (e.g. BTC during a clear uptrend day)
- Bearish trend (clear downtrend)
- Range / chop
- Around a structure break (BOS or CHoCH moment)
- Across session transitions (London close → NY open)

## 3. Acceptable tolerance per field

Engine output will not be byte-identical to the dashboard for two reasons:
1. Pine Script uses bar-close-only updates; our engine handles the same; minor float differences from FP order-of-ops
2. The dashboard occasionally rounds display values for UI

**Tolerance bands**:

| Field | Tolerance | Rationale |
|-------|-----------|-----------|
| Structure label | Exact match | Categorical, no float involved |
| OB / FVG direction | Exact match | Categorical |
| OB / FVG distance % | ±0.05% absolute | Display rounds to 0.1% |
| EMA-9 trend % | ±0.02% absolute | Float drift from EMA recurrence |
| Bias label | Exact match | Threshold-based, deterministic |
| Bias percentage | ±2 percentage points | Acceptable display drift |
| Bias raw score | Exact match | Integer, must match exactly |
| Swing H/L values | ±0.1% relative | Float comparison |
| Volume / volatility state | Exact match | Categorical |
| Session / killzone | Exact match | Time-based, deterministic |

If any field falls outside its tolerance, the engine has a bug. Fix it before continuing.

## 4. Pre-validation checklist (existing engine)

Before running validation, complete these tasks (these are M0.2 / M0.3):

- [ ] **Build `analyzer.py`** — orchestrates primitives into a `TimeframeAnalysis` per TF. The Python engine has all the building blocks (EMA, pivots, swing, structure, OB, FVG) but lacks the orchestrator. Without this, end-to-end runs are impossible.
- [ ] **Build `sessions.py`** — ICT session + killzone classification:
  - Asia: 19:00–22:00 EST (Tokyo open)
  - London: 02:00–05:00 EST (London open)
  - NY AM: 08:30–11:00 EST (NY AM killzone)
  - NY PM: 13:30–16:00 EST (NY PM session)
- [ ] **Add OB/FVG distance as % of price** to nearest-zone outputs (already have absolute distance; need percentage)
- [ ] **Confirm test suite runs**: `cd ~/lazytrader && python -m pytest tests/`

## 5. Validation execution plan

### Step 1: Tooling

Build `~/lazytrader/scripts/validate_against_flux.py`:

- Argument: `--pair BTCUSDT --timestamp 2026-04-15T14:30:00Z`
- Fetches 1m / 5m / 15m / 1H / 4H / 1D / 1W candles up to that timestamp from Birdeye (or Drift)
- Runs analyzer per TF
- Runs ConfluenceEngine
- Prints a structured report mirroring the dashboard layout

```
TF    SWING H/L         STRUCTURE       ORDER BLOCK       FVG              EMA-9 TREND
1M    L 67120 — H 68440  LL-LH-LL ↓     BULL OB (0.7%) ↑  BULL FVG (0.3%) ↑  +0.19% ↑
5M    L 67200 — H 68400  HH-LH-HH ↑     BEAR OB (-0.1%) ↓ NONE             +0.23% ↑
...
```

### Step 2: Capture snapshots

For each of 5 chosen timestamps:
1. Open TradingView with Flux Charts indicator, navigate to the chosen pair + time
2. Screenshot the Market Structure Dashboard panel
3. Save to `~/lazytrader/validation/snapshots/<timestamp>-<pair>.png`
4. Run `validate_against_flux.py --pair X --timestamp T > validation/snapshots/<timestamp>-<pair>.txt`

### Step 3: Diff

For each snapshot pair (image + engine output):
- Walk the dashboard table cell by cell
- Compare against engine output
- Document any deltas in `validation/deltas/<timestamp>-<pair>.md`

### Step 4: Fix and iterate

For each delta:
1. Identify the source module
2. Reproduce in isolation with a small test fixture
3. Fix the engine
4. Re-run all 5 snapshots
5. Repeat until all 5 pass within tolerance

### Step 5: Lock golden fixtures

After all 5 snapshots pass:

1. Save raw input candles: `validation/fixtures/<id>-input.json`
2. Save expected engine output: `validation/fixtures/<id>-expected.json`
3. Tolerance metadata in each fixture so the TS port can use the same tolerances
4. Tag the engine commit: `git tag smc-engine-validated-v1`
5. Document M0 sign-off: `validation/M0-SIGN-OFF.md` with date, commit hash, snapshot results

These fixtures gate M2 (TypeScript port) — the TS engine must reproduce them within the same tolerances.

## 6. What "spotless and rock solid" means

- All 5 snapshots match within tolerance — no exceptions
- No silent NaN / Infinity outputs
- No unhandled edge cases on first 50 bars (cold-start before EMA seeded, before pivots confirmed)
- No drift on extended runs (1000+ bars)
- Mitigation logic produces the same OB/FVG removals as the dashboard
- Session + killzone correct across DST transitions
- `confluence_matrix` agreement scores match a manual count on the dashboard

## 7. Future hardening (post-MVP)

- Continuous fuzz: synthetic candle generator + invariant checks (e.g. "swing high never below swing low")
- Replay mode: feed historical N-day data through the engine, log all outputs, statistical sanity checks
- A/B against alternative SMC indicators (LuxAlgo, Smart Money Concepts) to flag divergence

## 8. Open questions for M0

- **Data source for historical candles** — Drift historical or Birdeye? Pick before M0.4
- **Snapshot timestamps** — pick 5 specific (pair, time) pairs we can repeatably reach on TradingView. Document them in `validation/snapshots/INDEX.md`
- **Tolerance for "distance %" fields** — confirm with one round-trip what the dashboard's actual rounding is

## 9. Exit gate for M0

```
[ ] analyzer.py exists and runs
[ ] sessions.py exists and runs
[ ] OB/FVG distance % wired into nearest-zone outputs
[ ] validate_against_flux.py runs end-to-end on at least one snapshot
[ ] 5 snapshot pairs collected (image + engine output)
[ ] All 5 snapshots pass within documented tolerances
[ ] Golden fixtures captured under validation/fixtures/
[ ] Engine commit tagged smc-engine-validated-v1
[ ] M0-SIGN-OFF.md committed
```

Until every box is ticked, the engine is **not** considered validated and downstream milestones (M2 TS port, M3 live data, M7 vertical slice) cannot start.

---
title: LazyTrader Implementation Plan
description: Phased implementation plan for LazyTrader hackathon MVP — starts with SMC engine validation gate, then Android scaffold, parser, Drift integration, wallet flow, and demo prep.
type: implementation-plan
project: lazytrader
version: 1.0
status: draft
phase: hackathon-mvp
date: 2026-05-03
created: 2026-05-03
tags: [plan, lazytrader, milestones, smc-validation, drift, react-native]
---

# LazyTrader — Implementation Plan

**Related docs**: [[PRD]] · [[ARCHITECTURE]] · [[ANDROID-DEV-SETUP]] · [[SMC-ENGINE-VALIDATION]]

---

## Plan philosophy

1. **Validate the engine before building the app.** A wrong SMC engine ships a wrong product. M0 is mandatory and gates everything else.
2. **Vertical slice over horizontal layers.** Get a single signal type → SMC → Drift devnet tx working end-to-end before broadening.
3. **No backend.** Everything ships on-device. Telegram channel monitoring is Phase 2 only.
4. **Demo-first.** Each milestone produces something demonstrable on a real Android phone.

## Milestones

| ID | Name | Gate | Deliverable |
|----|------|------|------------|
| M0 | SMC Engine Validation | **Mandatory blocker** | Engine output verified against Flux Charts dashboard on live BTC/ETH/SOL data |
| M1 | Android Project Scaffold | M0 complete | Hello-world RN app on phone via Tailscale + Expo dev client |
| M2 | SMC Engine Port (TS) | M0 complete | TypeScript SMC engine passing same test fixtures as Python original |
| M3 | Live Data Feed | M2 complete | App fetches multi-TF candles for any pair, feeds engine, displays report |
| M4 | Parser Pipeline | M1 complete | Camera/paste/gallery → ML Kit → regex → NuExtract → ParsedSignal |
| M5 | Wallet Connection | M1 complete | Phantom/Solflare connect via MWA, display address |
| M6 | Drift Order Builder | M5 complete | Construct unsigned perp tx for any signal |
| M7 | Vertical Slice E2E | M3+M4+M6 complete | paste → verify → sign → execute on Drift devnet |
| M8 | UI polish + Settings | M7 complete | All screens production-quality, settings persist |
| M9 | Demo Prep | M8 complete | Pitch deck, demo flow rehearsed, fallback scripts |

---

## M0 — SMC Engine Validation (BLOCKER)

**Goal**: Prove the existing Python SMC engine produces output that matches the Flux Charts "Market Structure Dashboard" Pine Script indicator on the same data, on real BTC/ETH/SOL across multiple timeframes.

This is the most important milestone. If the engine is wrong, everything downstream is wrong.

**Tasks**:

- M0.1 Stand up `~/lazytrader/` Python environment, install deps, run existing tests
- M0.2 Build the missing `analyzer.py` module that orchestrates primitives → `TimeframeAnalysis`
- M0.3 Add ICT session + killzone module (`sessions.py`)
- M0.4 Build a live data ingest script (Birdeye or Drift) that fetches multi-TF candles for BTC, ETH, SOL
- M0.5 Build a "snapshot comparison" harness:
  - Pick 5 historical timestamps with known structure (manually verified)
  - Feed candles up to that timestamp into the engine
  - Compare output (structure label, OB direction, FVG presence, EMA trend, bias %) to Flux Charts dashboard at the same moment
  - Document deltas
- M0.6 Fix any deltas in the engine; re-run until output matches within tolerance
- M0.7 Document acceptable tolerance per field (see [[SMC-ENGINE-VALIDATION]])
- M0.8 Lock the engine — tag commit, capture golden test fixtures (input candles + expected output) for the TS port to validate against

**Exit criteria**:
- All 5 manually verified snapshots produce engine output that matches Flux Charts within tolerance
- Golden fixtures captured and committed
- M0 sign-off documented

---

## M1 — Android Project Scaffold

**Goal**: Hello-world RN app running on a real Android phone, hot-reloading over Tailscale.

**Tasks**:

- M1.1 `npx create-expo-app lazytrader --template blank-typescript`
- M1.2 Configure app.json: package name `live.lazytrader`, Android-only platforms
- M1.3 Install core deps: zustand, @react-native-async-storage/async-storage, zod, react-native-vision-camera, @react-native-ml-kit/text-recognition
- M1.4 Configure Expo dev client (we have native modules, can't use Expo Go)
- M1.5 EAS build profile for development (`eas.json`)
- M1.6 First dev build: `eas build --profile development --platform android`
- M1.7 Install resulting APK on phone via ADB over Tailscale
- M1.8 Start dev server: `REACT_NATIVE_PACKAGER_HOSTNAME=<tailscale-ip> npx expo start --dev-client`
- M1.9 Verify hot reload over Tailscale works
- M1.10 Set up basic navigation skeleton (Home / Capture / Settings)

**Exit criteria**:
- Dev build installed on Dexter's Android phone
- Hot reload over Tailscale works
- Navigation skeleton renders

---

## M2 — SMC Engine Port (Python → TypeScript)

**Goal**: Faithful TypeScript port of the validated Python engine, passing the same golden fixtures from M0.

**Tasks**:

- M2.1 Set up `src/smc/` directory in RN project
- M2.2 Port `models.py` → `models.ts` (Pydantic → Zod or plain types)
- M2.3 Port `config.ts` (TF weights, thresholds, defaults)
- M2.4 Port `primitives.ts` — EMA, ATR, pivots, swing, structure, FVG detect
- M2.5 Port `zones.ts` — OrderBlockTracker, FVGTracker, nearest helpers
- M2.6 Port `confluence.ts` — ConfluenceEngine
- M2.7 Port `scorer.ts` — SignalScorer with all 7 factors
- M2.8 Port `analyzer.ts` (built fresh in M0)
- M2.9 Port `sessions.ts` (built fresh in M0)
- M2.10 Set up vitest; load golden fixtures from M0
- M2.11 Run TS engine against fixtures; iterate until output matches Python within float tolerance

**Exit criteria**:
- All M0 golden fixtures pass on TS engine
- TS engine runs in <500ms for 7-TF analysis on a phone-class CPU

---

## M3 — Live Data Feed

**Goal**: App fetches real candle data and feeds the engine end-to-end.

**Tasks**:

- M3.1 `src/data/birdeye.ts` — adapter for Birdeye OHLCV endpoint
- M3.2 `src/data/drift.ts` — adapter for Drift historical candles
- M3.3 `src/data/cache.ts` — in-memory LRU + AsyncStorage persistence with per-TF TTL
- M3.4 `src/data/feed.ts` — unified `fetchCandles(pair, tf)` interface, primary=drift fallback=birdeye
- M3.5 Test screen that fetches BTC across all 7 TFs and renders raw output
- M3.6 Wire to engine: pair input → feed → analyzer → confluence → display report
- M3.7 Compare on-phone engine output to M0 desktop fixtures for the same pair/timestamp
- M3.8 Performance check: full 7-TF fetch + analyze in <5s on Dexter's phone

**Exit criteria**:
- Type "BTCUSDT" → see SMC report on phone in <5s
- Output matches M0 desktop fixtures

---

## M4 — Parser Pipeline

**Goal**: Any signal source (camera, paste, gallery, share) → `ParsedSignal` object.

**Tasks**:

- M4.1 `src/input/paste.ts` — TextInput screen
- M4.2 `src/input/camera.ts` — vision-camera capture, returns image URI
- M4.3 `src/input/gallery.ts` — image picker
- M4.4 `src/input/shareIntent.ts` — Android share-target manifest + handler
- M4.5 `src/parser/ocr.ts` — ML Kit wrapper, image URI → string
- M4.6 `src/parser/regex.ts` — patterns for common Telegram bot formats (collect 10 real examples first)
- M4.7 `src/parser/schema.ts` — Zod `ParsedSignal` schema
- M4.8 `src/parser/nuExtract.ts` — ExecuTorch + NuExtract-tiny wrapper with schema-driven extraction
- M4.9 `src/parser/smolLm.ts` — ExecuTorch + SmolLM2-1.7B fallback
- M4.10 `src/parser/pipeline.ts` — orchestrate regex → nuExtract → smolLm with confidence gating
- M4.11 Pre-load NuExtract on app start; lazy-load SmolLM2
- M4.12 Test against 20 real signals (10 from Telegram, 10 from Twitter screenshots)
- M4.13 Review screen with editable parsed fields

**Exit criteria**:
- 90% of test signals parsed correctly (regex hits 80%, NuExtract handles the rest)
- Parser cold start <3s, warm <1s

---

## M5 — Wallet Connection (MWA)

**Goal**: User connects Phantom or Solflare; app holds a wallet authorization token.

**Tasks**:

- M5.1 Install `@solana-mobile/wallet-adapter-mobile`
- M5.2 `src/wallet/mwa.ts` — wrapper around MWA
- M5.3 `src/wallet/connect.ts` — connect/disconnect flow, persist auth token
- M5.4 Settings screen wallet section: connect button, show connected pubkey
- M5.5 Test with Phantom on devnet
- M5.6 Test with Solflare on devnet
- M5.7 Handle wallet rejection / disconnection gracefully

**Exit criteria**:
- Phantom and Solflare both connect on Android
- Connected pubkey displayed in Settings
- Auth token persists across app restarts

---

## M6 — Drift Order Builder

**Goal**: Given a `ParsedSignal` + suggested size, construct an unsigned Drift perp transaction.

**Tasks**:

- M6.1 Install `@drift-labs/sdk`
- M6.2 `src/drift/client.ts` — DriftClient with read-only init (no keypair, signs via wallet adapter later)
- M6.3 `src/drift/markets.ts` — pair string → Drift `marketIndex` resolver
- M6.4 `src/drift/orderBuilder.ts`:
  - Market entry order
  - Trigger market SL order
  - Trigger market TP orders (split per TP weights)
- M6.5 `src/drift/transaction.ts` — bundle order ixs into versioned tx
- M6.6 Test: produce unsigned tx for a synthetic signal, decode and inspect ixs
- M6.7 Wire to wallet: pass unsigned tx to MWA, receive signed tx
- M6.8 Submit signed tx to devnet RPC
- M6.9 Confirm tx, capture signature

**Exit criteria**:
- Unsigned Drift tx successfully constructed for any signal
- Phantom signs and submits successfully on devnet
- Order visible on Drift devnet UI (`app.beta.drift.trade`)

---

## M7 — Vertical Slice E2E

**Goal**: Single-tap end-to-end flow: paste signal → on-chain Drift order on devnet.

**Tasks**:

- M7.1 Wire Capture → Parser → Review → Verification → Confirm → Sign → Submit
- M7.2 Loading states + error boundaries at each transition
- M7.3 Tx status screen with on-chain link
- M7.4 History store: append every executed signal + tx
- M7.5 History screen: list past signals with ratings + tx links
- M7.6 Smoke test: paste 5 different real signals, run through full flow
- M7.7 Demo timing: target <15s from paste to confirmed tx

**Exit criteria**:
- Real Telegram signal pasted → Drift order on devnet within 15s, no manual JSON editing
- 5 different signal formats all complete the flow

---

## M8 — UI Polish + Settings

**Goal**: Production-quality UI, all settings working and persisted.

**Tasks**:

- M8.1 Apply consistent design system (colors, type, spacing)
- M8.2 Settings screen: balance, max risk %, leverage default, TP split, network, RPC
- M8.3 Engine settings: bias factor toggles, TF weight overrides
- M8.4 Empty states, error states, retry flows for each screen
- M8.5 Loading skeletons during candle fetch + engine compute
- M8.6 Score card UI (A+ to D with color coding + justification)
- M8.7 Position size override UI on Confirm screen
- M8.8 Onboarding flow first-launch (3 screens: what it does, connect wallet, set risk)

**Exit criteria**:
- App is presentable to judges without commentary
- Settings persist across kills
- All states (loading / error / empty / success) handled

---

## M9 — Demo Prep

**Goal**: Hackathon-ready submission.

**Tasks**:

- M9.1 Pitch deck (10 slides max): problem, solution, demo, tech, Solana angle, team, ask
- M9.2 Demo flow script: 3 minutes max, paste-to-execute
- M9.3 Pre-record demo video as fallback
- M9.4 Set up demo wallet on devnet with funding
- M9.5 Set up demo phone with stable Tailscale + dev build
- M9.6 Practice 10x with timer
- M9.7 Devpost / Colosseum submission write-up
- M9.8 GitHub repo polish: README, screenshots, demo gif
- M9.9 Decide: devnet demo (safe) or mainnet demo (impact). Have both paths ready
- M9.10 **TradingView Flux Charts live-spot comparison** — Flux Charts only renders on the current bar (no historical replay), so the comparison must be done in real time. Procedure:
  1. Open TradingView in browser with the Flux Charts "Market Structure Dashboard" indicator on `BINANCE:BTCUSDT` (any TF view).
  2. Trigger our engine in parallel: `python -m validation.dashboard BTCUSDT` (or equivalent on phone) at the same wall-clock moment.
  3. Screenshot both and place side by side.
  4. Walk each dashboard cell: structure label, OB direction, FVG direction, EMA trend, swing H/L, session, killzone, bias label/score.
  5. Apply documented tolerances from `SMC-ENGINE-VALIDATION.md`. Discrepancies inside tolerance = pass.
  6. If a delta exceeds tolerance: capture the candle data at that moment, file as a regression case, fix in engine, re-run.

  Repeat once per pair (BTC/ETH/SOL) to widen confidence. Single live snapshot per pair is the goal — not a battery of historical fixtures.

**Exit criteria**:
- Submission live before deadline
- Demo can be done in 3 minutes from cold start

---

## Out-of-band: pre-M0 setup

These can run in parallel with M0:

- Set up `~/lazytrader-app/` repo on GitHub (this doc is part of that)
- Install Android Studio + SDK on Mac
- Enable USB debugging + ADB-over-Tailscale on phone
- Install Phantom + Solflare on phone, fund devnet wallets
- Bookmark Drift devnet UI

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| SMC engine doesn't match Flux Charts on real data | High | Critical (M0 blocks everything) | M0 is the mandatory first milestone with hard exit criteria |
| TS port introduces float drift vs Python | Medium | High | Golden fixtures with float tolerance bands |
| ExecuTorch + SmolLM2 too slow on Dexter's phone | Medium | Medium | Regex covers 80%; LLM is fallback only |
| Drift devnet flaky during demo | Medium | High | Pre-recorded video + mainnet fallback |
| MWA / Phantom version mismatch | Low | High | Test on multiple Android versions early in M5 |
| Birdeye API rate-limits or pricing changes | Medium | Medium | Drift historical as primary; cache aggressively |

## Decision log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-05-03 | Android-only for MVP | Single platform = faster shipping |
| 2026-05-03 | TypeScript port of SMC engine (vs Python backend) | Zero-backend narrative, no hosting cost |
| 2026-05-03 | Drift Protocol over Jupiter Perps | Better SDK, orderbook, programmatic-friendly |
| 2026-05-03 | Phantom + Solflare via MWA, no built-in wallet | Non-custodial principle |
| 2026-05-03 | Telegram monitoring deferred to Phase 2 | Requires backend; out of MVP scope |
| 2026-05-03 | No success-fee program in MVP | Zero on losses = bad unit economics; subscription model in pitch only |
| 2026-05-03 | Fresh repo (lazytrader-app) | Pivot is too fundamental to keep old Python prototype as base |

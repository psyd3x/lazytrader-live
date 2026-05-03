---
title: LazyTrader PRD
description: Product requirements for LazyTrader — Android trading app with on-device SMC/ICT signal verification and Solana-native Drift Protocol perp execution via Phantom/Solflare.
type: prd
project: lazytrader
version: 1.0
status: draft
phase: hackathon-mvp
date: 2026-05-03
created: 2026-05-03
domain: lazytrader.live
hackathon: colosseum-solana-frontiers
tags: [prd, lazytrader, solana, drift, smc-ict, react-native, android]
---

# LazyTrader — Product Requirements Document

**Version**: 1.0 (Hackathon MVP)
**Date**: 2026-05-03
**Domain**: lazytrader.live
**Hackathon**: Colosseum (Solana Frontiers), AI track primary

**Related docs**: [[ARCHITECTURE]] · [[IMPLEMENTATION-PLAN]] · [[ANDROID-DEV-SETUP]] · [[SMC-ENGINE-VALIDATION]]

---

## 1. Problem

Retail traders consume trading signals from Telegram channels, Twitter screenshots, paid groups, friends, and AI tools. They have no objective way to evaluate whether a given signal is worth taking. They blindly trust providers, take signals out of context, miss optimal entries, and use poor position sizing. Most lose money.

Existing solutions:
- **Signal copy-trading bots** — execute blindly, no verification, often locked to one platform
- **Pine Script indicators** — manual chart analysis, not actionable for mobile users
- **TradingView alerts** — generic, no signal-quality scoring, no execution
- **Centralized exchanges** — custody risk, KYC, geo-restrictions

Nothing on Solana combines: signal ingestion + AI verification + on-chain execution + non-custodial wallet UX, all on mobile.

## 2. Solution

A mobile Android app that:

1. **Ingests** trading signals from any source (camera, paste, Telegram channel)
2. **Parses** them on-device with free OCR + small language models
3. **Verifies** them with a Smart Money Concepts (SMC) / Inner Circle Trader (ICT) market structure engine
4. **Scores** signals A+ to D based on multi-timeframe confluence
5. **Constructs** a Drift Protocol perp order
6. **Hands** the unsigned transaction to the user's Solana wallet (Phantom, Solflare)
7. **Executes** on-chain when the user signs

The app never holds keys, never custodies funds, never charges fees on losses.

## 3. Target user

- Crypto trader who consumes signals from external sources
- Owns a Solana wallet (Phantom / Solflare)
- Has Android phone (iOS post-hackathon)
- Wants objective, fast verification before committing capital
- Trades perps (BTC, ETH, SOL, memecoins)
- Comfortable with self-custody

Not for: total beginners with no wallet, futures-illiterate retail, copy-traders who want zero-effort automation.

## 4. Hackathon scope

### 4.1 Phase 1 (MVP — what gets shipped for judging)

**In scope:**

- Android-only React Native app
- Three signal input methods:
  1. **Text paste** — paste signal text → parser
  2. **Camera / screenshot OCR** — image → ML Kit text → parser
  3. **Image picker** — select image from gallery → ML Kit → parser
- On-device parser pipeline (regex → NuExtract-tiny → SmolLM2-1.7B fallback)
- SMC/ICT engine port from Python to TypeScript
- Multi-timeframe live data feed (Birdeye or Drift candles for BTC/ETH/SOL)
- Signal scoring with A+ to D rating + justification
- Drift Protocol perp order construction (TypeScript SDK)
- Wallet connection via Solana Mobile Wallet Adapter (Phantom / Solflare)
- One-tap approve/reject signal flow
- Position sizing calculator with score multiplier
- Settings: account balance input, max risk per trade, default leverage, default TP split
- On-chain trade execution on Drift devnet (mainnet if time permits)

**Out of scope (Phase 2 or later):**

- iOS support
- Telegram channel monitoring
- Telegram bot notifications
- Discord / WhatsApp notifications
- Subscription / payment infrastructure
- Provider leaderboard / reputation
- Copy-trading
- Web dashboard
- Solana Actions / Blinks distribution
- PDA escrow / success-fee programs
- Custodial flows of any kind

### 4.2 Phase 2 (post-hackathon, near-term)

- **Telegram channel monitor**: lightweight backend worker (Cloudflare Worker or small VPS) bridges Telegram channel messages → SMC analysis → FCM push to phone
- **Multi-channel notifications**: same signal summary delivered to Telegram bot, optionally WhatsApp, Discord, with approve/reject from any channel (app-first approve still preferred)
- **Subscription billing**: USDC SPL micropayment for Pro tier (unlimited signals)
- **iOS port**

### 4.3 Phase 3 (later)

- Provider leaderboard with on-chain attestation of signal performance
- Multi-CEX execution via CCXT (BloFin, MEXC, Bitget) — user's choice
- Web dashboard (Next.js) on lazytrader.live
- Auto-execution mode (no manual approve, with strict guardrails)

## 5. Non-functional requirements

| Category | Requirement |
|----------|-------------|
| **Cost to user** | Zero — only Solana network fees (~$0.001/tx) |
| **Cost to operator** | Zero — fully on-device, no backend in MVP |
| **Privacy** | All parsing on-device. No signal text leaves the phone unless user opts in to share/post |
| **Custody** | Non-custodial. Keys never leave Phantom/Solflare |
| **Latency** | OCR + parse: <3s (95th percentile). SMC verification: <5s. Order construction: <2s |
| **Battery** | Camera + parse cycle: <0.05% per signal |
| **RAM** | Peak <2GB during model inference (4GB+ phones supported) |
| **Network** | Required only for live candle data + tx submission. Parse + verify works offline if candles cached |

## 6. Functional requirements

### 6.1 Signal input

**FR-IN-1**: User can take a photo of a signal with the in-app camera; app extracts text via ML Kit and feeds it to the parser.

**FR-IN-2**: User can pick an existing image from their gallery; same flow.

**FR-IN-3**: User can paste raw text into a text box; parser runs on the text directly.

**FR-IN-4**: User can share an image to LazyTrader from another app via Android share intent; same flow.

**FR-IN-5**: Parser pipeline order: (1) regex on known formats, (2) if regex fails, NuExtract-tiny structured extraction, (3) if NuExtract fails or low-confidence, SmolLM2-1.7B with structured prompt.

**FR-IN-6**: Parser output schema: `{ pair, direction (long/short), entry, stop_loss, take_profits[], leverage }`.

**FR-IN-7**: User sees parsed result before verification and can manually correct any field.

### 6.2 SMC verification

**FR-SMC-1**: Engine fetches multi-timeframe candles (1m, 5m, 15m, 1H, 4H, 1D, 1W) for the parsed pair from the configured data source.

**FR-SMC-2**: Engine computes per-timeframe analysis: EMA-9 trend, swing highs/lows, structure labels (HH/HL/LH/LL), order blocks (active + nearest), fair value gaps (active + nearest), volume state, volatility state, ICT session, ICT killzone.

**FR-SMC-3**: Engine produces a multi-timeframe confluence score with weighted bias (factors: structure, OB, FVG, swing, EMA optional).

**FR-SMC-4**: Engine outputs a final signal rating: A+ (≥80%), A (≥65%), B (≥50%), C (≥35%), D (<35%) with a position-size multiplier (A+=1.5, A=1.25, B=1.0, C=0.75, D=0.5).

**FR-SMC-5**: Engine outputs a one-paragraph human-readable justification covering: HTF alignment, entry quality (zone confluence), structure, R:R, swing position, killzone state.

**FR-SMC-6**: Engine output must match the Flux Charts "Market Structure Dashboard" Pine Script indicator on the same data within an acceptable tolerance (see SMC-ENGINE-VALIDATION.md).

### 6.3 Position sizing & risk management

The position sizing module is the safety net of the entire app. It enforces that no single trade can risk more than the user's configured percentage of their wallet balance, regardless of the signal's leverage or TP targets. It is calculated **from the stop-loss outward**, never from the leverage inward.

#### Wallet balance source

**FR-SIZE-1**: App reads the user's available USDC balance directly from the connected Solana wallet (or Drift collateral account, where applicable) on every signal verification. No manual balance entry. Refreshed each time the user opens a signal for verification.

**FR-SIZE-1a**: User can override the "active capital" the app sizes against — useful when the wallet holds funds the user doesn't want to trade with. Default = 100% of available USDC balance.

#### Max-risk per trade

**FR-SIZE-2**: User selects max-risk-per-trade as a percentage of active capital. Default **1%**. Selectable presets: **0.5%, 1%, 2%, 3%**. Custom value allowed (any value 0.1% to 10%, hard-capped at 10% to prevent obvious mistakes; warning shown above 3%).

**FR-SIZE-2a**: This setting is the user's **maximum loss on stop-out**. The app must size every trade so that if SL hits, the user loses no more than `active_capital * max_risk_pct`.

#### Suggested size & leverage calculation

**FR-SIZE-3**: For each verified signal, the app calculates and **pre-fills** the order with:

```
risk_dollars      = active_capital × max_risk_pct × score_multiplier
sl_distance_pct   = |entry − SL| / entry
position_notional = risk_dollars / sl_distance_pct
suggested_lev     = ceil(position_notional / active_capital)   // capped at signal.leverage if specified
                                                                // and at user's max_leverage setting
position_size     = position_notional                           // in quote currency
margin_required   = position_notional / suggested_lev
```

`score_multiplier` comes from the SMC engine's signal rating (A+=1.5, A=1.25, B=1.0, C=0.75, D=0.5).

**FR-SIZE-3a**: Suggested leverage is the **minimum leverage** required to open the calculated notional given the user's active capital. The app prefers lower leverage. The app never increases position size to "use more leverage" — leverage is an output, not an input.

**FR-SIZE-3b**: If the signal source specifies a leverage value, it is used as a **ceiling**, not a target. The app sizes for the SL-bounded risk first, then verifies suggested leverage ≤ signal leverage ≤ user's `max_leverage` setting.

**FR-SIZE-3c**: User can override suggested size and leverage before approving. Override UI shows the resulting **risk in dollars + as % of capital** in real time so the user always sees what they're about to risk.

#### Pre-trade visibility

**FR-SIZE-4**: The Confirm screen MUST clearly display, before the wallet sign step:

- **Position size** (in quote currency, e.g. "$1,000 BTC-PERP")
- **Leverage** (e.g. "5x")
- **Margin required** (in USDC)
- **Stop-loss price** + **distance from entry** (% and absolute)
- **Maximum loss if SL hits** — both **as a $ amount** and **as % of active capital**, in **prominent type**
- **Take-profit levels** + weighted reward at each
- **R:R ratio** computed against the weighted TP split
- **Liquidation price** (for transparency on margin trades)

Example display:
```
  POSITION:    $1,000 BTC-PERP   5x leverage
  ENTRY:       67,500          MARGIN: $200 USDC
  STOP LOSS:   66,800  (-1.04%)
  ⚠ MAX LOSS:  $10.00  (1.0% of $1,000 capital)
  TP1: 68,200 (50%)  TP2: 69,000 (30%)  TP3: 70,500 (20%)
  R:R:         2.4
  LIQ:         53,800  (price needs to drop -20.3%)
```

**FR-SIZE-4a**: If the user adjusts size/leverage on the Confirm screen, the "MAX LOSS" line updates live before any signing happens.

#### TP split

**FR-SIZE-5**: TP split defaults to 50% TP1, 30% TP2, 20% TP3 when 3 TPs are specified. For 1 TP: 100%. For 2 TPs: 60/40. Configurable per-user in settings.

#### Hard guards

**FR-SIZE-6**: App refuses to construct a transaction if any of the following are true:
- Resulting margin > active capital
- Suggested leverage > user's `max_leverage` setting
- SL distance is 0 or invalid (would mean infinite size)
- Computed position size is below Drift's minimum order size for the market
In each case, the user sees a clear explanation, never a silent failure.

### 6.4 Execution

**FR-EXEC-1**: App connects to a Solana wallet via Mobile Wallet Adapter. Supported wallets MVP: Phantom, Solflare.

**FR-EXEC-2**: On user approval, app constructs a Drift perp order transaction (entry market order + SL trigger order + TP trigger orders) using `@drift-labs/sdk`.

**FR-EXEC-3**: App passes the unsigned transaction to the wallet for signing via MWA.

**FR-EXEC-4**: After signing, app submits transaction to Solana RPC and shows confirmation status.

**FR-EXEC-5**: App displays the on-chain transaction signature with a link to a Solana explorer.

**FR-EXEC-6**: MVP defaults to Drift devnet; mainnet behind a settings toggle for power users.

### 6.5 Settings

**FR-SET-1**: Wallet management — connect, disconnect, view connected address.

**FR-SET-2**: Risk management — active capital % override (default 100% of wallet USDC), max-risk-per-trade preset (0.5/1/2/3% with custom override, default 1%), max leverage cap, default TP split.

**FR-SET-3**: Network — Drift devnet vs mainnet, RPC endpoint override.

**FR-SET-4**: SMC engine — toggle which factors feed bias (structure, OB, FVG, swing, EMA), TF weights override.

**FR-SET-5**: (Phase 2 placeholder) Telegram integration — link Telegram bot, select channel to monitor, notification preferences.

### 6.6 Data feed

**FR-DATA-1**: App fetches OHLCV candles for the parsed trading pair across all 7 timeframes.

**FR-DATA-2**: Primary data source: Drift historical API (matches execution venue).

**FR-DATA-3**: Fallback data source: Birdeye (free tier).

**FR-DATA-4**: Candles are cached locally with TTL appropriate to the timeframe (1m=60s, 5m=300s, etc.).

**FR-DATA-5**: If no live data is available, app shows a clear error and prevents verification.

## 7. Constraints

- **Free for users**: monetization is Phase 2+; MVP must run with zero recurring user cost
- **No backend in MVP**: all logic on-device; the only network calls are candle data and Solana RPC
- **Android only**: iOS deferred to focus engineering on a single platform
- **Solana-native**: execution must happen on Solana via Drift; do not bring back Hyperliquid
- **Self-custody only**: keys never leave the user's wallet, even for "convenience"

## 8. Success metrics (hackathon)

- Live demo: paste a real Telegram signal → SMC engine produces a sensible rating + justification → Drift order signed by Phantom on devnet → executed on-chain
- SMC engine output matches Flux Charts dashboard on at least 5 manually verified BTC/ETH/SOL bars
- Full pipeline (paste → verify → sign → execute) completes in under 15 seconds on a mid-range Android phone
- Pitch deck + on-chain demo transactions visible to judges

## 9. Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| SMC engine produces wrong output on real data | High — trust killer | Validation phase before any UI work; compare to Flux dashboard |
| SmolLM2 too slow on mid-range Android | Medium | Regex covers 80% of signals; LLM is fallback only |
| Drift devnet down during demo | High — no demo | Pre-record demo as backup, prep mainnet path |
| Wallet adapter issues on stage | High — no demo | Test on multiple Android versions before demo |
| Live candle data API rate-limited | Medium | Cache aggressively, prep static fixtures as fallback |

## 10. Open questions

- Where does the SMC engine live: ported to TypeScript on-device, or kept as a tiny Python service called over the network? **Decision needed before implementation**. Default = TypeScript on-device for the "zero backend" narrative.
- Which Drift environment for demo: devnet (safer, less liquidity) or mainnet (real money, real liquidity, real risk)? **Decision needed at demo prep**.
- Do we ship a custodial demo wallet for judges who don't have Phantom installed, or require Phantom on the demo device?

## 11. Non-goals (explicit)

- Not a charting app — no candlestick rendering required in MVP
- Not a portfolio tracker — show position only after execution, no full PnL dashboard in MVP
- Not a social platform — no copy-trading, no Blinks, no signal sharing
- Not a custodian — never holds user funds
- Not a trading robot — every order requires explicit user approval in MVP

---
title: LazyTrader Architecture
description: System architecture for LazyTrader — fully on-device Android pipeline (OCR + parser + SMC engine + Drift order builder) with Solana wallet signing via MWA. Zero backend in MVP.
type: architecture
project: lazytrader
version: 1.0
status: draft
phase: hackathon-mvp
date: 2026-05-03
created: 2026-05-03
tags: [architecture, lazytrader, on-device, drift, solana, react-native, mwa]
---

# LazyTrader — Architecture

**Related docs**: [[PRD]] · [[IMPLEMENTATION-PLAN]] · [[ANDROID-DEV-SETUP]] · [[SMC-ENGINE-VALIDATION]]

---

## 1. Guiding principles

1. **Fully on-device** — no backend in MVP. The only network calls are public market data and Solana RPC.
2. **Non-custodial** — keys never leave the user's wallet (Phantom / Solflare via MWA).
3. **Free for users** — zero API costs. ML Kit OCR, SmolLM2/NuExtract on-device, public RPC, free candle data tier.
4. **Solana-native execution** — Drift Protocol perps via the official TypeScript SDK.
5. **Composable engine** — the SMC engine is a pure function of candles → analysis. No I/O coupling.

## 2. High-level diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Android App (React Native)                     │
│                                                                       │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────┐   │
│  │  Signal Input    │    │  Parser Pipeline │    │  SMC Engine  │   │
│  │  ─────────────   │    │  ─────────────   │    │  ──────────  │   │
│  │  • Camera        │───▶│  1. ML Kit OCR   │───▶│  • Multi-TF  │   │
│  │  • Gallery       │    │  2. Regex        │    │    candles   │   │
│  │  • Paste         │    │  3. NuExtract-   │    │  • Pivots    │   │
│  │  • Share intent  │    │     tiny         │    │  • Structure │   │
│  └──────────────────┘    │  4. SmolLM2-1.7B │    │  • OB / FVG  │   │
│                          │     fallback      │    │  • EMA / ATR │   │
│                          └──────────────────┘    │  • Sessions  │   │
│                                  │                │  • Confluence│   │
│                                  ▼                │  • Scorer    │   │
│                          ┌──────────────────┐    └──────┬───────┘   │
│                          │ Parsed Signal    │           │           │
│                          │ {pair, dir, ...} │           │           │
│                          └──────────────────┘           │           │
│                                                          ▼           │
│  ┌────────────────────────┐    ┌───────────────────────────────┐    │
│  │  Drift Order Builder   │◀───│  Verification + Position Size │    │
│  │  ─────────────────     │    │  ──────────────────────────   │    │
│  │  • Construct perp tx   │    │  • Rating A+→D                │    │
│  │  • Entry + SL + TPs    │    │  • Justification              │    │
│  │  • Unsigned tx bytes   │    │  • Suggested size             │    │
│  └────────────┬───────────┘    └───────────────────────────────┘    │
│               │                                                       │
│               ▼                                                       │
│  ┌────────────────────────┐                                          │
│  │  Solana Mobile Wallet  │                                          │
│  │  Adapter (MWA)         │                                          │
│  │  • Phantom             │                                          │
│  │  • Solflare            │                                          │
│  └────────────┬───────────┘                                          │
└───────────────┼───────────────────────────────────────────────────────┘
                │
                ▼ (signed tx)
        ┌──────────────────┐         ┌──────────────────┐
        │  Solana RPC      │────────▶│  Drift Protocol  │
        │  (Helius / pub)  │         │  (perps program) │
        └──────────────────┘         └──────────────────┘

        Off-app:
        ┌──────────────────────────────────────────┐
        │  Live OHLCV (Birdeye / Drift historical) │
        └──────────────────────────────────────────┘
```

## 3. Module breakdown

### 3.1 Signal Input

**Module**: `src/input/`

| File | Responsibility |
|------|----------------|
| `camera.ts` | `react-native-vision-camera` integration; capture image, return URI |
| `gallery.ts` | `react-native-image-picker` integration; pick image, return URI |
| `paste.ts` | Plain TextInput; emits raw string |
| `shareIntent.ts` | Android share intent receiver; handles incoming images |

All inputs converge on a single `RawSignal` type:
```typescript
type RawSignal = { kind: 'image'; uri: string } | { kind: 'text'; text: string };
```

### 3.2 Parser Pipeline

**Module**: `src/parser/`

| File | Responsibility |
|------|----------------|
| `ocr.ts` | ML Kit Text Recognition v2 wrapper. Image → string |
| `regex.ts` | Pattern matchers for known signal formats (Telegram bot styles, plain "Entry: SL: TP:" formats) |
| `nuExtract.ts` | ExecuTorch + NuExtract-tiny (0.5B) structured extraction with JSON schema |
| `smolLm.ts` | ExecuTorch + SmolLM2-1.7B fallback with structured prompt |
| `pipeline.ts` | Orchestrates: image→OCR→text, then text→regex→nuExtract→smolLm chain with confidence gating |
| `schema.ts` | `ParsedSignal` Zod schema for validation |

**Confidence gating**:
- Regex returns a result with `confidence: 'high' | 'low'`. High = exit immediately.
- NuExtract has a self-confidence proxy (number of fields filled vs schema). If <60%, escalate.
- SmolLM2 is the final arbiter; output validated by Zod schema.

**Cold-start strategy**:
- Pre-load NuExtract-tiny on app start (background).
- Lazy-load SmolLM2 only on demand (rare path).

### 3.3 SMC Engine

**Module**: `src/smc/`

Port of the existing Python engine at `~/lazytrader/src/smc_engine/` to TypeScript.

| File | Responsibility | Source equivalent |
|------|----------------|-------------------|
| `models.ts` | Type definitions (Candle, ZoneBlock, BiasResult, etc.) | `models.py` |
| `config.ts` | Defaults: TF weights, bias config, signal rating thresholds | `config.py` |
| `primitives.ts` | EMA, ATR, pivots, swing tracker, structure tracker, FVG detect | `primitives.py` |
| `zones.ts` | OrderBlockTracker, FVGTracker, nearest-zone helpers | `zones.py` |
| `confluence.ts` | ConfluenceEngine — multi-TF weighted bias, agreement matrix | `confluence.py` |
| `scorer.ts` | SignalScorer — A+→D rating, justification, position sizing | `scorer.py` |
| `analyzer.ts` | **NEW** — orchestrates primitives into TimeframeAnalysis (missing in Python source) |
| `sessions.ts` | **NEW** — ICT session + killzone classification (London / NY AM / NY PM / Asia) |

The engine is a pure module: takes `Record<TF, Candle[]>` → returns `ConfluenceReport`. No I/O.

### 3.4 Data Feed

**Module**: `src/data/`

| File | Responsibility |
|------|----------------|
| `birdeye.ts` | Birdeye OHLCV adapter (free tier, multi-pair) |
| `drift.ts` | Drift historical candle adapter (matches execution venue) |
| `cache.ts` | LRU cache keyed by `{pair, tf}`, TTL per timeframe |
| `feed.ts` | Unified interface; primary=drift, fallback=birdeye |

### 3.5 Drift Order Builder

**Module**: `src/drift/`

| File | Responsibility |
|------|----------------|
| `client.ts` | DriftClient initialization (read-only without keypair, uses wallet adapter) |
| `markets.ts` | Resolve pair string ("BTCUSDT") to Drift `marketIndex` |
| `orderBuilder.ts` | Construct perp order: market entry + trigger SL + trigger TPs |
| `transaction.ts` | Bundle into a versioned transaction; return unsigned bytes |

### 3.6 Wallet Layer

**Module**: `src/wallet/`

| File | Responsibility |
|------|----------------|
| `mwa.ts` | `@solana-mobile/wallet-adapter-mobile` integration |
| `connect.ts` | Connect/disconnect flow; persist authorization token |
| `sign.ts` | Pass unsigned tx to wallet; receive signed tx |
| `submit.ts` | Submit signed tx to RPC; poll for confirmation |

### 3.7 UI

**Module**: `src/screens/`

| Screen | Purpose |
|--------|---------|
| `Home` | Recent signals, "scan new" CTA, wallet status |
| `Capture` | Camera view + paste input + gallery button |
| `Review` | Parsed signal with editable fields → "Verify" button |
| `Verification` | SMC report: rating, justification, TF breakdown, suggested size → "Approve" / "Reject" |
| `Confirm` | Final order summary → wallet sign → tx status |
| `History` | Past signals + executed trades with on-chain links |
| `Settings` | Wallet, risk, network, engine config |

### 3.8 State management

`zustand` for app state — minimal, no Redux ceremony. Core stores:
- `walletStore` — connected pubkey, MWA auth token
- `signalStore` — current signal flow state machine
- `settingsStore` — persisted to AsyncStorage
- `historyStore` — past signals + trades

## 4. Data flow: end-to-end signal lifecycle

```
1. User taps Capture → opens camera (or paste)
2. Image captured → URI passed to Parser Pipeline
3. ML Kit OCR runs on URI → raw text string
4. Regex tries known formats → success: ParsedSignal with confidence=high
   Otherwise: NuExtract-tiny with schema → ParsedSignal
   Otherwise: SmolLM2-1.7B with structured prompt → ParsedSignal
5. User reviews on Review screen, optionally corrects fields
6. User taps Verify → app:
   a. Fetches multi-TF candles for ParsedSignal.pair
   b. Runs SMC Analyzer per timeframe → TimeframeAnalysis[]
   c. Runs ConfluenceEngine → BiasResult + matrix
   d. Runs SignalScorer → rating, justification, multiplier
   e. Calculates suggested position size from settings
7. Verification screen shows SMC report
8. User taps Approve → app:
   a. Constructs Drift perp order via @drift-labs/sdk
   b. Builds unsigned versioned transaction
   c. Calls MWA → opens Phantom/Solflare → user signs
   d. Submits signed tx to Solana RPC
   e. Polls for confirmation → shows tx signature
9. Trade saved to history with on-chain link
```

## 5. Network dependencies

| Service | Purpose | Failure mode |
|---------|---------|-------------|
| Birdeye API | OHLCV candles (fallback) | Show error, prevent verify |
| Drift historical | OHLCV candles (primary) | Fall back to Birdeye |
| Solana RPC (Helius free tier or public) | Tx submission | Show error, allow retry |
| Drift program | Order execution | Tx-level failure surface |

No proprietary backend in MVP. Everything else is on-device.

## 6. Security model

- **Keys**: Never stored by app. MWA returns auth tokens which are scoped per-session by the user's wallet.
- **Transaction review**: Wallet shows full tx contents before signing. User has final visual confirmation.
- **Network calls**: All HTTPS. RPC endpoint configurable in settings (mainnet vs devnet).
- **Local storage**: Only non-sensitive data (settings, signal history hashes, cached candles). No secrets.
- **Model files**: SmolLM2 / NuExtract `.pte` files downloaded from HuggingFace at first run, integrity-verified by hash.

## 7. Phase 2 architecture additions

When Phase 2 lands (Telegram monitoring + multi-channel notifications):

```
┌──────────────────────┐
│  Telegram channel    │
│  (user-monitored)    │
└──────────┬───────────┘
           │ MTProto
           ▼
┌────────────────────────────────────┐
│  Cloudflare Worker / Tiny VPS      │
│  ────────────────────────────      │
│  • gramjs reads channel            │
│  • Calls SMC engine (HTTP, same    │
│    code as on-device, server mode) │
│  • Pushes to FCM + Telegram bot    │
│  • Optional: WhatsApp Cloud API    │
│    Discord webhook                 │
└──────────┬─────────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  User's phone (FCM push)        │
│  + Telegram bot DM              │
│  + WA / Discord (opt-in)        │
└─────────────────────────────────┘
```

The on-device app remains the source of truth for execution. Phase 2 is a notification layer.

## 8. Tech stack summary

| Layer | Choice |
|-------|--------|
| App framework | React Native (Expo with dev client) |
| Language | TypeScript (strict mode) |
| State | zustand |
| OCR | `@react-native-ml-kit/text-recognition` |
| On-device LLM | `react-native-executorch` (SmolLM2, NuExtract-tiny) |
| Camera | `react-native-vision-camera` |
| Wallet | `@solana-mobile/wallet-adapter-mobile` |
| Solana | `@solana/web3.js` v1 (or `@solana/kit` if Drift SDK supports) |
| Drift | `@drift-labs/sdk` |
| Validation | `zod` |
| Storage | `@react-native-async-storage/async-storage` |
| Tests | `vitest` (TS engine), Detox or Maestro (E2E mobile) |

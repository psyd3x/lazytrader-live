---
title: M3 Live Data Feed — Design
description: Replace LazyTrader's synthetic candle stub with a live OHLCV feed. Pyth Benchmarks primary (TradingView UDF shim, no auth), optional Birdeye fallback gated behind user-supplied API key stored in Android Keystore via expo-secure-store. Pair extracted from pasted signal text + normalized + validated against Pyth feed catalog.
type: design
project: lazytrader
phase: m3-live-data
status: approved
date: 2026-05-03
created: 2026-05-03
tags: [design, lazytrader, m3, data-feed, pyth, birdeye, secure-store]
---

# M3 Live Data Feed — Design

**Related**: [[PRD]] · [[ARCHITECTURE]] · [[IMPLEMENTATION-PLAN]] · [[2026-05-03-visual-layer-design]] · [[UI-DESIGN-SYSTEM]]

## 1. Goal

Replace `src/data/demoData.ts`'s hardcoded synthetic candles with a live OHLCV feed wired into the existing SMC engine. After this milestone, pasting a real Telegram signal produces a verdict reflecting actual current market state.

**Hackathon deadline**: 2026-05-11 (8 days). Estimate: ~9-10 hours of build.

## 2. Constraints (Dexter-locked)

1. **Functionality is locked** — the existing SMC engine output (7 scoring factors, OB/FVG tracking, bias calculation, multi-TF analysis) MUST NOT degrade. No factor may produce a different verdict because of the data source.
2. **No MEXC** — MEXC was M0 validation only. The product cannot ship with a CEX as primary data source.
3. **No CEX as fallback** — CEX may exist deep in the safety-net hierarchy but never as front-line fallback narrative.
4. **Secure credential storage** — any user-supplied API key MUST be stored in encrypted storage. No plaintext credentials anywhere on the device.
5. **Transparent UX** — secure storage internals are invisible to the user. They paste a key, app saves it.
6. **No backend** — everything runs on the phone. Direct fetch from public APIs only.

## 3. Locked decisions

| # | Decision | Why |
|---|----------|-----|
| Q1 | **Drift only — no MEXC** (locked, then revised after API verification) | Drift's REST candles API doesn't exist publicly today (`data.api.drift.trade` returns 404 on every path; `mainnet-beta.api.drift.trade` requires auth). PRD's "Drift API" was aspirational. |
| Q1' | **Primary: Pyth Benchmarks** (TradingView UDF shim) | Verified live via curl. Same on-chain Pyth oracle Drift trades against → narrative honest ("we read the same oracle Drift's perp marks come from"). No auth, public CDN, mobile-friendly, returns clean OHLCV. |
| Q2 | **Pair scope: any user-typed pair** (mode C from brainstorm) | Hackathon judges may paste any signal. Allowlist tied to Pyth feed catalog (~150 crypto feeds incl. Drift's full perp market list). |
| Q2' | **Pair input UX: explicit field now (M3), auto-fill from paste in M4** | Keeps M3 deterministic. Parser pipeline lands in M4. |
| Q3 | **Fallback: Birdeye (optional, user-supplied key)** | True upstream diversity. Disabled by default → app works with zero config. Power users + judges who care about resilience can BYO key. No CF Worker proxy needed because key is user's own, stored locally. |
| Q4 | **Secure storage: `expo-secure-store` (Android Keystore-backed)** | Hardware-backed AES on modern devices, same model Phantom uses. Native module — bundled into M3 dep install for one-shot EAS rebuild. |
| Q5 | **Android `allowBackup: false`** | Prevents Google Auto Backup from harvesting the encrypted blob. |

## 4. Architecture

```
src/
  data/
    pyth.ts              NEW — Pyth Benchmarks adapter (primary)
    birdeye.ts           NEW — Birdeye OHLCV adapter (optional fallback)
    feed.ts              NEW — unified fetchCandles() — orchestrates primary→fallback
    cache.ts             NEW — in-memory + AsyncStorage TTL cache (per pair × TF)
    pairs.ts             NEW — symbol normalizer + Pyth feed catalog mapper
    demoData.ts          KEEP for tests/dev only — flagged "not for runtime" in JSDoc
  storage/
    secureSettings.ts    NEW — typed wrapper around expo-secure-store (API keys)
                         (non-secret prefs wrapper deferred to M8 when settings
                          actually become editable)
  screens/
    SettingsScreen.tsx   MODIFY — add "Data Sources" card with Birdeye key input
    CaptureScreen.tsx    MODIFY — add Pair input row above signal-text textarea;
                          replace makeBtcDemo() with live fetch; show fetch errors
  components/
    PairInput.tsx        NEW — TextInput with onBlur normalization + Pyth-validation chip
    SecretInput.tsx      NEW — masked TextInput with reveal toggle, save+clear actions
  smc/                   UNCHANGED — engine consumes the new candles unchanged
```

**Component boundary rules** (same as visual layer):
- Each adapter (`pyth.ts`, `birdeye.ts`) returns the engine's existing `Candle[]` shape — never leaks vendor-specific types upward
- `feed.ts` is the only file that knows about fallback orchestration
- `pairs.ts` is the only file that knows about Pyth feed naming conventions
- `secureSettings.ts` is the only file that touches `expo-secure-store`

## 5. Data flow

```
User pastes signal text + types/edits pair
              │
              ▼
       PairInput.normalize(raw)
              │  e.g. "$BTC" → "BTCUSDT" → "Crypto.BTC/USD"
              ▼
       pairs.resolveToPythFeed(pair)
              │  validates against Pyth feed catalog
              │  → returns { pythFeedId, pythSymbol } | null
              ▼
       feed.fetchCandles({ pair, tfs: [...DEFAULT_TFS] })
              │
              ├── try cache (hit if not expired) → return
              │
              ├── try pyth.fetchOhlcv(pair, tf) for each TF
              │     │
              │     ├── 1W: paginate (1-year-per-request limit)
              │     └── others: single request
              │
              ├── on Pyth fail AND birdeyeKey present:
              │     try birdeye.fetchOhlcv(pair, tf)
              │
              ├── persist to cache
              │
              ▼ Record<TF, Candle[]>
              │
       generateSignalVerification({ signal, candleData, currentPrice, ... })
              │
              ▼
       SignalVerificationReport (existing engine output, unchanged)
```

## 6. Adapter contracts

### 6.1 `pyth.ts`

```ts
/** Fetch OHLCV from Pyth Benchmarks TradingView shim. Throws on network/HTTP error. */
export async function fetchPythCandles(opts: {
  pair: ResolvedPair;       // from pairs.ts
  tf: TfKey;                // "15m" | "1H" | "4H" | "1D" | "1W"
  fromUnix: number;         // seconds
  toUnix: number;           // seconds
}): Promise<Candle[]>;
```

- URL: `https://benchmarks.pyth.network/v1/shims/tradingview/history?symbol={pythSymbol}&resolution={tvRes}&from={from}&to={to}`
- Response: `{s, t[], o[], h[], l[], c[], v[]}` — verified live
- Pagination: when `1W` AND `(toUnix - fromUnix) > 31_536_000` (1 year), split into N sub-requests of ≤1 year each, concatenate results
- Volume `v` is always 0 from Pyth — engine doesn't use it today (verified: `calcVolumeState` is dead code in current pipeline)

### 6.2 `birdeye.ts`

```ts
/** Fetch OHLCV from Birdeye. Requires API key. Throws on network/HTTP/auth error. */
export async function fetchBirdeyeCandles(opts: {
  pair: ResolvedPair;       // requires birdeyeTokenAddress to be set
  tf: TfKey;
  fromUnix: number;
  toUnix: number;
  apiKey: string;           // injected from secureSettings
}): Promise<Candle[]>;
```

- URL: `https://public-api.birdeye.so/defi/ohlcv?address={tokenAddress}&type={birdeyeTf}&time_from={from}&time_to={to}`
- Header: `x-api-key: {apiKey}`, `x-chain: solana`
- Pair coverage limited — only Solana-native tokens have authentic prices; wrapped BTC/ETH may be illiquid (acceptable for fallback)
- 401 → throw `BirdeyeAuthError` (caller surfaces "key invalid" UI)
- 429 → throw `BirdeyeRateLimitError` (caller treats as fallback unavailable)

### 6.3 `feed.ts`

```ts
export async function fetchCandlesForEngine(opts: {
  pair: ResolvedPair;
  tfs?: readonly TfKey[];   // defaults to DEFAULT_ENABLED_TFS
}): Promise<Record<TfKey, Candle[]>>;
```

Orchestration:
1. For each requested TF, check cache. Cache hit → use it.
2. Cache miss → try Pyth. Success → cache + return.
3. Pyth failure → check `birdeyeApiKey` from secureSettings. If present → try Birdeye. Success → cache + return.
4. All sources failed → throw `NoCandlesError` (caller shows error UI).

Concurrency: fetch all TFs in parallel (`Promise.all`), each TF independently fails over.

## 7. Cache strategy (`cache.ts`)

Two-layer:
- **L1 in-memory** — `Map<cacheKey, { data, expiresAt }>` for the lifetime of the process
- **L2 AsyncStorage** — persisted across app restarts

`cacheKey = ${pair.pythSymbol}:${tf}` (e.g. `Crypto.BTC/USD:1H`)

TTL per TF (deterministic from candle period, no overrides):

| TF | TTL | Reason |
|----|-----|--------|
| 1m / 5m | 30s | Frequent updates, keep close to live |
| 15m | 60s | Balances freshness vs requests |
| 1H | 5min | New bar every hour, mid-bar tolerance OK |
| 4H | 15min | New bar every 4h, generous tolerance |
| 1D / 1W | 1h | Slow-moving HTFs, aggressive caching saves bandwidth |

Cache invalidation: when TTL expires OR user explicitly taps "Refresh" on Capture screen (deferred to M8 polish; not in M3 scope).

Storage budget: ~120 bars × 7 TFs × 50 bytes/bar ≈ 42KB per pair. Negligible. No eviction policy needed for MVP — when AsyncStorage usage exceeds 1MB (~24 pairs cached), evict oldest cacheKey.

## 8. Pair handling (`pairs.ts`)

### 8.1 Normalizer

```ts
/** Normalize free-form user input to canonical {base, quote} or null if unparseable. */
export function normalizePairInput(raw: string): { base: string; quote: string } | null;
```

Strip → uppercase → match against patterns:
- `$BTC`, `BTC` → base="BTC", quote="USD"
- `BTCUSDT`, `BTC/USDT`, `BTC-USDT` → base="BTC", quote="USDT"
- `BTC-PERP`, `BTC_USDT`, `BTCUSD` → handled
- Bases: 2-6 alphanumeric chars
- Quotes accepted: `USD`, `USDT`, `USDC`, `PERP` (treated as USD)

### 8.2 Pyth feed catalog

```ts
/** Maps normalized pair → Pyth feed metadata. */
export interface PythFeed {
  pythSymbol: string;       // e.g. "Crypto.BTC/USD"
  pythFeedId: string;       // hex id (for Hermes if ever needed)
}
export interface ResolvedPair {
  base: string;
  quote: string;
  pyth: PythFeed | null;    // null if base not on Pyth
  birdeyeTokenAddress?: string;  // Solana SPL mint, if mappable
}
export function resolveToPythFeed(input: string): ResolvedPair | null;
```

The catalog is a **bundled JSON file** (`src/data/pyth-feeds.json`) snapshotted at build time from Pyth's `/v2/price_feeds?asset_type=crypto`. Refresh manually before each build (one-off `pnpm exec ts-node scripts/refresh-pyth-feeds.ts`). Why bundled vs runtime fetch: catalog is ~150KB and changes rarely (~weekly when Pyth lists new feeds). Runtime fetch on every cold start would waste bandwidth + add 200ms latency to first verify.

If pair not in catalog → `resolveToPythFeed` returns null → PairInput shows "Unsupported pair" chip → Verify button disabled.

### 8.3 Birdeye token address mapping (deferred until first need)

For pairs Birdeye should cover (SOL-native), a small `birdeyeTokenAddress` field lives on `ResolvedPair`. Initially populated for the top ~10 Drift markets (SOL, JUP, BONK, JTO, WIF, PYTH, RNDR, JLP, ORCA, MNGO). Pairs without an address (like BTC) skip Birdeye fallback entirely — Pyth is the only source for them.

## 9. Settings UI (`SettingsScreen.tsx` modifications)

New "Data Sources" card, slotted **between Network and Risk** in the existing card stack:

```
┌─ Data Sources ─────────────────────────┐
│ Primary           Pyth Benchmarks  ●   │  (always-on, green dot, no input)
│ Birdeye fallback  ○ Disabled           │  (or ● Enabled)
│   API key         •••••••••••• [Reveal]│  (only shown when key set)
│   [Test connection]  [Save]  [Clear]   │
│   Get a key →                          │  (link → birdeye.so/developers in browser)
└────────────────────────────────────────┘
```

Behavior:
- Empty state: input field, "Get a key" link, no save button until input has content
- On Save tap: validate key by firing one Pyth-equivalent OHLCV ping to Birdeye for SOL token. 200 → save to secureSettings, show "Enabled" status. 401 → inline "Key invalid" error, don't save. 429 → save with warning ("Rate-limited on test, will retry on real fallback"). Network error → save with warning.
- Reveal toggle: shows full key in plain text (single tap to reveal, auto-hide on screen blur)
- Clear: deletes from secureSettings, status returns to "Disabled"

## 10. Secure storage (`secureSettings.ts`)

```ts
import * as SecureStore from "expo-secure-store";

const KEYS = { birdeyeApiKey: "birdeye_api_key" } as const;

export async function getBirdeyeApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.birdeyeApiKey);
}
export async function setBirdeyeApiKey(value: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.birdeyeApiKey, value);
}
export async function clearBirdeyeApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.birdeyeApiKey);
}
```

- Backed by Android Keystore on device
- Never log keys (enforced by code review + a `redact(value)` helper in any debug dump path)
- App.json: `expo.android.allowBackup: false` to exclude from Google Auto Backup
- Same module reused in M5 for wallet auth tokens

## 11. CaptureScreen modifications

Add `<PairInput />` row above the existing signal-text textarea. Default value: empty (M4 will autofill from paste).

Verify button gating:
- Disabled until pair resolves to a valid Pyth feed AND signal text is non-empty
- Loading state during fetch (~1-3s depending on TF count + network)
- Error states:
  - "Pair not supported" — pair didn't resolve to Pyth
  - "Couldn't fetch data — check connection" — network failure
  - "Pyth temporarily down — add a Birdeye key in Settings to enable fallback" — Pyth failed AND no fallback configured
  - "Both data sources failed — try again" — both failed

Engine call path stays identical:
```ts
const candleData = await fetchCandlesForEngine({ pair: resolvedPair });
const result = generateSignalVerification({
  signal: extractedSignal,    // M4 will improve; M3 uses placeholder built from pair + parsed signal text fields
  candleData,
  currentPrice: latestClose(candleData),  // helper: prefer 1m → 5m → 15m → first available TF
  accountBalance: 1000,       // hardcoded until Settings interactivity in M8
  riskRules: { maxRiskPct: 1.0, maxLeverage: 25 },
});
```

For `signal` (entry/SL/TPs), M3 keeps a stubbed signal builder (use `makeBtcDemo`-style hardcoded entry/SL/TPs but driven by the live pair+price). The full structured `ParsedSignal` lands in M4.

## 12. Dependency changes

```bash
pnpm exec expo install expo-secure-store
```

That's the only new native dep. AsyncStorage already installed. Triggers ONE EAS Cloud Build (~15 min) before iteration resumes on phone.

JS-only adds: none. All adapter/cache/pairs code uses built-in `fetch` + AsyncStorage.

## 13. Testing

- **Unit tests** (vitest, on Mac): `pairs.test.ts` covers normalizer (BTC, $BTC, BTCUSDT, BTC/USDT, BTC-PERP, lowercase, garbage input) — pure function, fast
- **Integration test** (vitest with mocked fetch): `feed.test.ts` covers Pyth happy path, Pyth failure → no-fallback error, Pyth failure → Birdeye fallback success, both failed
- **No live API tests in CI** — would be flaky and rate-limited. A separate manual `scripts/probe-pyth.ts` script for live verification.
- **Engine fixtures stay green** — `pnpm test` must still pass 27/27. Engine + demoData unchanged.
- **Phone hot-reload verification**: paste a real BTC signal, see verdict reflect real BTC market state. Compare engine output to a live screenshot of TradingView for sanity.

## 14. Out of scope (explicit)

- Auto-extracting pair from pasted signal text (lands in M4 parser pipeline)
- Auto-extracting entry/SL/TPs from pasted signal text (M4)
- Real currentPrice from a streaming source (use last candle close in M3)
- Live WebSocket subscriptions for real-time bar updates (post-M8)
- Multi-pair concurrent fetch UI (one pair at a time in M3)
- "Refresh" button to bypass cache (M8)
- Account balance + risk rules from Settings (M8)
- Drift SDK on-chain reads as a deeper fallback (out of scope for hackathon)
- Wallet auth token via secureSettings (M5 reuses the module — added there, not here)

## 15. Risks

| Risk | Mitigation |
|------|------------|
| Pyth Benchmarks shim has unannounced breaking change | Adapter wraps the response shape — easy to fix in one file. Manual probe script for early detection. |
| Pyth's 1-year-per-request limit blocks weekly fetch | Paginator handles it (~3 sequential requests, one-time on cold cache). Fallback: settle for ≤52 weekly bars from a single 1-year window. |
| User pastes a pair Pyth doesn't have | PairInput validation chip surfaces "Unsupported" before Verify; user picks supported pair. Allowlist tied to Pyth catalog. |
| Birdeye changes free-tier policy | Fallback is optional — base app keeps working with just Pyth. User can disable Birdeye in Settings. |
| `expo-secure-store` install breaks the EAS build | Commit dep change in its own commit, EAS rebuild → if fails, revert that one commit. |
| Cache key collision across users (e.g. multiple wallets in M5+) | Cache key ignores wallet — candles are public market data, sharing across users is correct. |
| Volume always 0 from Pyth degrades engine when volume scoring lands in future | Out-of-scope problem. When volume factor is wired, swap data source or add a separate volume adapter. Documented in `pyth.ts` JSDoc. |

## 16. Success criteria

- Pasting a real Telegram BTC signal + tapping Verify produces engine output reflecting current BTC market state (manual: cross-check vs TradingView at the same moment)
- Same flow works for ETH, SOL, JUP, BONK
- Cold fetch (cache empty, all 5 enabled TFs) completes in <5s on Dexter's phone over Starlink
- Warm fetch (cache hit) completes in <500ms
- All 27 SMC golden fixtures still pass (engine unchanged)
- `pnpm exec tsc --noEmit` exits 0
- App with NO Birdeye key works perfectly when Pyth is up
- App with valid Birdeye key transparently falls back when Pyth is down (force-test by pointing Pyth URL to invalid host temporarily)
- Birdeye API key set via Settings is not visible in any logs, AsyncStorage dump, or app backup
- Build remains pushable + cloneable (no untracked-foundation regression)

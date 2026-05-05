---
title: M5 — Jupiter Perps + Mobile Wallet Adapter integration
date: 2026-05-05
milestone: M5
status: design-locked
prior-milestones: [M3 live data feed, M4 parser pipeline]
related-specs:
  - 2026-05-03-m3-live-data-feed-design.md
  - 2026-05-04-m4-parser-pipeline-design.md
  - 2026-05-03-visual-layer-design.md
hackathon-deadline: 2026-05-11
---

# M5 — Jupiter Perps + Mobile Wallet Adapter

## 1. Why this milestone exists

M3 shipped live data. M4 shipped the parser. The end-to-end demo flow specified in PRD §8 still has two gaps:

1. **No wallet** — `WalletChip` is a stub, `Confirm trade` button is decorative
2. **No on-chain execution** — there's no order construction, signing, or submission

This milestone closes both gaps. It also handles the post-Drift-hack venue pivot: PRD §6.4 specified Drift as the execution venue, but Drift is no longer in business. The actual demo target is **Jupiter Perps on Solana mainnet**, integrated via Mobile Wallet Adapter (MWA) signing through Phantom or Solflare.

After M5 ships, the headline demo flow works: paste signal → engine rates → user taps Confirm → wallet signs once → 4 transactions submit (entry + SL + 2 TPs) → Jupiter keeper executes → position appears on Home tab with live PnL.

## 2. Scope

### 2.1 Tier 1 — must ship (demo flow works)

1. **MWA integration** — connect, SIWS authentication, disconnect, auth_token persistence in `expo-secure-store`
2. **USDC mainnet balance read** — wired into `WalletChip` and into M4's sizing math (replaces `accountBalance: 1000` stub when wallet connected; preserves stub fallback when disconnected)
3. **Jupiter Perps client** — IDL-fetched-and-checked-in, Anchor `Program` instance, market entry instruction builder for SOL-PERP only
4. **Confirm Trade modal** — review screen with full cost breakdown + execution screen with per-leg progress strip
5. **PRD updates** — §4.1 / §6.4 / §6.5 / §6.6 / §9 rewritten for the Drift-to-Jupiter pivot
6. **PairInput chip cosmetic fix** — carryover from M4 follow-up; chip renders on parser autofill, not just on user blur
7. **Pair coverage gate** — Confirm Trade button disabled with subtitle for non-Jupiter-supported pairs
8. **Demo signal fixtures** — 3 new SOL signals (templates A/B/D) so the demo paste targets a Jupiter-tradable market

### 2.2 Tier 2 — should ship (demo storytelling)

9. **TP and SL trigger orders** — additional `PositionRequest` writes batched into the same MWA prompt; one tx per trigger
10. **ETH-PERP and wBTC-PERP markets** — same code path as SOL-PERP, just custody account swap
11. **Position list on Home tab** — live PnL with borrow-fee deduction, pull-to-refresh + screen-focus refresh
12. **Position close** — bundled with #11 since a position list without a Close button is useless

### 2.3 Deferred to M6

13. **Limit entry orders** — parser already produces `entryRange`, but the executor needs an explicit limit/market mode toggle in the Confirm modal. Defer to avoid splitting focus.

### 2.4 Out of scope

- iOS support (PRD §4.1 — Android only for MVP)
- Camera / OCR / image-picker signal input (PRD §4.1 — defer to a later milestone)
- WebSocket subscription to Position account changes (Tier 2 #11 uses polling; subscription is a cosmetic upgrade for M6+)
- Auto-execution mode (PRD §11 explicitly non-goal for MVP)

## 3. Architecture overview

### 3.1 Module layout

```
src/
├── wallet/                       # NEW — MWA layer
│   ├── MwaProvider.tsx            # context provider, app-wide
│   ├── useConnect.ts              # connect + SIWS hook
│   ├── useUsdcBalance.ts          # USDC SPL balance hook (refresh-driven, no polling)
│   └── walletStore.ts             # extends M3 secureSettings — auth_token, address, label
│
├── jupiter/                      # NEW — Jupiter Perps integration
│   ├── idl/jupiter_perps.json     # fetched once via `anchor idl fetch PERPHjGB...`
│   ├── client.ts                  # makeJupiterClient + high-level openPosition / addTrigger / closePosition / listOpenPositions
│   ├── markets.ts                 # SOL/ETH/wBTC custody + Dove Oracle metadata + isJupiterSupported
│   ├── position.ts                # Position decoder + PnL math (with borrow-fee deduction)
│   └── rpc.ts                     # Configured Connection (Helius default, user-overridable in Settings)
│
├── components/
│   ├── ConfirmTradeModal.tsx      # NEW — review + sign + 4-leg progress strip
│   ├── PositionListItem.tsx       # NEW — open position row with live PnL
│   ├── WalletChip.tsx             # MODIFY — wire to MWA state instead of stub
│   └── PairInput.tsx              # MODIFY — useEffect resolves on value prop change
│
├── screens/
│   ├── HomeScreen.tsx             # MODIFY — Connect CTA when disconnected; Position list when connected
│   ├── CaptureScreen.tsx          # MODIFY — Confirm trade button opens ConfirmTradeModal
│   └── SettingsScreen.tsx         # MODIFY — add Wallet card + Network card with RPC override
│
└── smc/                          # M3/M4 untouched
```

### 3.2 Stack choice — Path B (`@coral-xyz/anchor` + `@solana/web3.js` v1)

The Jupiter module uses `@coral-xyz/anchor` and `@solana/web3.js` v1, **not** the kit-native Codama-generated path. Reasoning (in priority order):

1. **Hackathon clock favors known-paths.** Codama-gen + `@solana/kit` + RN polyfills + MWA bridge is the least-tested combo on RN; a runtime issue surfaced on Day 4 of a 6-day timeline becomes a project killer. Anchor + web3.js is dirt-paved with public examples.
2. **Dual-stack is acceptable here.** The Jupiter module is well-bounded — `src/jupiter/` shares no types with `src/data/` (M3's kit-based data layer). The split kit-for-data + web3.js-for-jupiter is domain layering, not technical debt.
3. **Demo storytelling unaffected** — judges see the phone, not the import statements.
4. **Migration to kit later is mechanical.** When Codama generates a Jupiter Perps client (or someone publishes one), `src/jupiter/` is the only refactor target.

### 3.3 Boundary types

| Layer | Type system | Notes |
|---|---|---|
| `src/data/` (M3) | `@solana/kit` | Untouched |
| `src/wallet/` (M5) | `@solana/web3.js` v1 (`PublicKey`, `Connection`) | MWA returns v1 types |
| `src/jupiter/` (M5) | `@coral-xyz/anchor` + `@solana/web3.js` v1 | Anchor `Program<JupiterPerps>` builds tx; `VersionedTransaction` flows to MWA |
| MWA boundary | `@solana-mobile/mobile-wallet-adapter-protocol-web3js` | Accepts v1 `VersionedTransaction[]` for `signAllTransactions` |

### 3.4 Confirm Trade transaction batch

Single MWA prompt covering up to 4 transactions:

```
[entryTx]    — createIncreasePositionRequest, market, ${margin} USDC collateral
[slTx]       — createDecreasePositionRequest, requestType: SL, triggerPrice: ${slPrice}
[tp1Tx]      — createDecreasePositionRequest, requestType: TP, triggerPrice: ${tp1Price}, sizeUsd: ${tp1Size}
[tp2Tx]      — createDecreasePositionRequest, requestType: TP, triggerPrice: ${tp2Price}, sizeUsd: ${tp2Size}
```

User taps **Sign all 4 transactions** once. Phantom shows ONE approval modal listing all 4. After approval, txs are submitted to RPC sequentially (so blockhash freshness is guaranteed for each). Jupiter keeper picks them up oracle-price-independent, typically within 1 second.

If the parsed signal has fewer TPs (e.g. AAVE Kapoor: TP1 + TP2; PENGU Langestrom: TP1 + Final), only that many TP transactions are batched. If the signal has no TPs (rare), only entry + SL go through. If the signal has more than 2 TPs (e.g. APT emoji with 6 TPs, ETH Nasdaq75 with 6 EXIT levels), the M5 cap is **first 2 TPs only** — Tier 3+ generalization deferred.

## 4. Wallet layer

### 4.1 `MwaProvider`

Mounted once at app root. Reads RPC endpoint from M3 `secureSettings`:

```tsx
<MobileWalletProvider
  chain="solana:mainnet"
  endpoint={settings.rpcEndpoint ?? "https://api.mainnet-beta.solana.com"}
  identity={{
    name: "LazyTrader",
    uri: "https://lazytrader.live",
    icon: "favicon.png",
  }}
>
  {children}
</MobileWalletProvider>
```

Default RPC = public Solana mainnet. User can paste a private RPC URL (Helius, QuickNode, Triton free tier) in Settings → Network → "RPC override" for stage demo reliability.

### 4.2 `useConnect`

Single SIWS prompt covers connect + sign-in (per MWA spec — `sign_in_payload` on `authorize` returns `sign_in_result` in the same response):

```ts
const { account, connect, disconnect, signIn } = useMobileWallet();

const connectAndSignIn = async () => {
  const result = await signIn({
    domain: "lazytrader.live",
    statement: "Sign in to LazyTrader",
    nonce: crypto.randomUUID(),
  });
  if (result?.auth_token) {
    await walletStore.save(result.auth_token, account!.publicKey.toBase58());
  }
  return result;
};
```

If the wallet doesn't support SIWS (rare — older Solflare versions), `@wallet-ui/react-native-web3js` falls back to `authorize` then `signMessage` transparently.

`disconnect()` calls wallet-side `deauthorize` (so the cached auth_token is invalidated wallet-side, not just on the phone) AND clears `walletStore`.

### 4.3 `useUsdcBalance`

USDC mainnet mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.

```ts
const refresh = async () => {
  const ata = await getAssociatedTokenAddress(USDC_MAINNET, owner);
  const account = await connection.getTokenAccountBalance(ata);
  setBalance(parseFloat(account.value.uiAmountString ?? "0"));
};
```

Refresh triggers (no background polling — battery-conscious):
- on connect (initial fetch)
- on every successful `Parse signal` (so M4 sizing math sees fresh balance)
- on `Confirm trade` resolution (so user sees post-trade deduction)

### 4.4 `walletStore` (extends M3 `secureSettings`)

Three new keys in `expo-secure-store` (Android Keystore, AES-256, hardware-backed):
- `mwa.auth_token` — silent reauth on subsequent signs
- `mwa.address` — the connected pubkey
- `mwa.wallet_label` — Phantom / Solflare / etc.

`walletStore.clear()` also `await`s wallet-side `deauthorize({ auth_token })` inside a `transact` block to invalidate the cached token wallet-side.

### 4.5 Sizing math integration

`src/smc/uiSizing.ts` `computeSizingPreview(parsed, rules)` already takes `accountBalance` as a `RiskRulesInput` field. M4 wires it to a hardcoded 1000 in `CaptureScreen.tsx`. M5 swaps that hardcoded value for `useUsdcBalance().balance` when the wallet is connected; falls back to 1000 stub when disconnected (preserves M4 demo flow on a disconnected device, e.g. for offline parser testing).

## 5. Jupiter Perps layer

### 5.1 IDL fetch (Day 1, one-shot)

```bash
anchor idl fetch PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu \
  --provider.cluster mainnet > src/jupiter/idl/jupiter_perps.json
git add src/jupiter/idl/jupiter_perps.json
```

The IDL is checked in. If Jupiter upgrades the program, we re-fetch consciously (and re-test). No `getIdl()` runtime calls.

The community-cited program ID `PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu` is verified Day 1 against the official IDL repo at `github.com/jup-ag/jupiter-perps-anchor-idl-parsing` README before any tx is built.

### 5.2 Anchor `Program` + MWA `Wallet` shim

```ts
function makeMwaWallet(authToken: string, publicKey: PublicKey): Wallet {
  return {
    publicKey,
    signTransaction: async (tx) => transact(async (w) => {
      await w.authorize({ chain: "solana:mainnet", auth_token: authToken, identity: APP_IDENTITY });
      const [signed] = await w.signTransactions({ transactions: [tx] });
      return signed;
    }),
    signAllTransactions: async (txs) => transact(async (w) => {
      await w.authorize({ chain: "solana:mainnet", auth_token: authToken, identity: APP_IDENTITY });
      return w.signTransactions({ transactions: txs });
    }),
  };
}

export function makeJupiterClient(authToken: string, publicKey: PublicKey, conn: Connection) {
  const wallet = makeMwaWallet(authToken, publicKey);
  const provider = new AnchorProvider(conn, wallet, { commitment: "confirmed" });
  return new Program(idl as Idl, PROGRAM_ID, provider);
}
```

For the Confirm Trade batch, `wallet.signAllTransactions(txs)` is called once → MWA shows ONE Phantom prompt with all 4 txs → submission via `connection.sendRawTransaction` is sequential (not via the Anchor provider, since we're already past the signing step).

### 5.3 `markets.ts`

```ts
export type JupiterMarket = "SOL-PERP" | "ETH-PERP" | "wBTC-PERP";

export interface MarketMetadata {
  market: JupiterMarket;
  custodyPda: PublicKey;            // long-side custody
  collateralCustodyPda: PublicKey;  // USDC-side custody (used by both longs and shorts)
  doveOraclePda: PublicKey;
  decimals: number;
  minPositionUsd: number;           // verified Day 3 against on-chain Pool account
}

export const MARKETS: Record<JupiterMarket, MarketMetadata>;

export function pairToMarket(pair: string): JupiterMarket | null;
export function isJupiterSupported(pair: string): boolean;
```

`pairToMarket` maps `"SOLUSDT"` / `"SOL/USD"` / `"$SOL"` style parser outputs to `"SOL-PERP"`. Same for ETH and wBTC. Anything else returns `null` and `isJupiterSupported` returns `false`.

Custody and oracle PDAs are derived once via `findProgramAddressSync` helpers and verified against on-chain Pool account on Day 3. Pool account also yields fee parameters (`increasePositionBps` = 6, `decreasePositionBps` = 6, `maxPositionUsd` cap).

### 5.4 `client.ts` — high-level API

```ts
client.openPosition({ market, direction, sizeUsd, leverage, collateralUsdc }): Promise<VersionedTransaction>
client.addTrigger({ position, requestType, triggerPrice, sizeUsdToClose }): Promise<VersionedTransaction>
client.closePosition({ position, sizePctToClose }): Promise<VersionedTransaction>
client.listOpenPositions(owner): Promise<DecodedPosition[]>
```

Each `Promise<VersionedTransaction>` returns an unsigned transaction ready for batch signing. The client does NOT sign or submit — that's the `ConfirmTradeModal`'s job. This separation keeps `client.ts` testable in isolation and lets the modal build the full 4-tx batch before triggering MWA.

### 5.5 `position.ts` — decoder + PnL math

```ts
export function decodePosition(raw: Buffer): DecodedPosition;
export function computePnl(
  pos: DecodedPosition,
  currentPrice: number,
  pool: PoolAccount,
): { unrealizedPnlUsd: number; borrowFeeUsd: number; netPnlUsd: number };
```

Borrow fee math (from Jupiter docs):

```
borrowFeeUsd =
  (pool.cumulativeInterestRate - position.cumulativeInterestSnapshot)
  × position.sizeUsd / 1e15
```

Unrealized PnL: `(currentPrice - entryPrice) × sizeUsd / entryPrice × directionMultiplier` (where directionMultiplier is +1 for long, -1 for short).

Net PnL = unrealized − borrow fee. Always shown to the user (no surprise borrow fees).

## 6. Confirm Trade flow

### 6.1 Review screen

Auto-renders when CaptureScreen has all of: parsed signal, computed sizing, Jupiter-supported pair, connected wallet. Any missing → fall back to existing M4 disabled-button states.

The review modal shows:
- Market + direction + score badge
- Margin, leverage, notional (from `computeSizingPreview`)
- Entry, SL, TPs (from M4's editable parsed card)
- Estimated fees: open 6 bps + close 6 bps + borrow rate per hour + rent (~0.04 SOL, recovered on close)
- Two CTAs: Cancel (back to CaptureScreen) and **Sign all N transactions**

### 6.2 Execution screen

Triggered when user taps Sign. Calls `client.openPosition(...)`, `client.addTrigger(SL)`, `client.addTrigger(TP1)`, `client.addTrigger(TP2)` to build the 4 unsigned transactions. Calls `wallet.signAllTransactions([all 4])`. Phantom shows one approval modal.

After signing, the modal switches to a 4-row progress strip. Each row goes through three phases:

| Phase | Detection | UI |
|---|---|---|
| Submitted | `sendRawTransaction` returned a sig + RPC confirmed | tx hash chip + green checkmark |
| Keeper picked | `PositionRequest` account `executionTimestamp` is set | "Keeper picked up" subtext |
| Armed / Open | For entry: `Position` account exists with `sizeUsd > 0`. For trigger: `PositionRequest` account closed (executed and disposed) | "Position open" / "Stop loss armed" / "TP armed" |

Per-row poll loop: every 1 second, 30-second timeout. If timeout hits → row turns yellow with "Keeper not responding — funds safely escrowed in PositionRequest. Retry or wait."

If a row fails permanently (RPC revert, Anchor error response): row turns red, error text shown, **Retry** button appears for that single leg only. User can retry without resigning the others.

### 6.3 Naked-position recovery

If entry succeeds but SL fails, the user has an open position with no stop loss. UI surfaces this loudly: red banner at top of the modal saying **"⚠️ Open position has NO STOP LOSS."** Two CTAs:
- Primary: **Retry stop loss**
- Secondary (smaller text link): **Close position now**

The modal stays open until the user resolves this — they can't dismiss it accidentally. This is the only "modal traps user" interaction in M5; everywhere else the user can back out.

Same logic applies to partial TP failures, but they're warning-yellow (not red) since a position with only an SL is risk-managed; missing a TP just means slightly worse exit timing.

## 7. Position list (Home tab)

When wallet connected, HomeScreen renders:
1. `WalletChip` (address + USDC balance)
2. **Open Positions** section — `client.listOpenPositions(owner)` results
3. Each position row (from `PositionListItem`):
   - `{pair} {direction} · {sizeUsd} @ {entryPrice}`
   - Current price (from M3 data feed)
   - PnL: `${netPnl} ({pnlPct}%)` — colored green/red based on sign
4. Tap a row → bottom sheet with full details + **Close position** button

Refresh strategy:
- Pull-to-refresh (manual)
- Auto-refresh on screen focus
- Auto-refresh on Confirm Trade resolution (so a freshly opened position appears within seconds)

Pool account fetched once per refresh cycle, applied to all rows for borrow-fee computation. Single RPC call covers any number of positions.

When wallet not connected, HomeScreen shows a "Connect Wallet to start trading" CTA that opens the same MWA flow as Settings → Wallet card.

## 8. Pair coverage gate

CaptureScreen reads `isJupiterSupported(parsed.pair)` when the parsed card renders. If true, the Confirm Trade button is enabled (subject to other gates: wallet connected, sizing computed, pair resolved). If false:

- Confirm Trade button **disabled** (not hidden — keeps layout consistent)
- Subtitle below the button: **"Jupiter Perps doesn't support {pair} yet — verification works but execution requires SOL, ETH, or wBTC."**

This is the visible-disabled pattern from M4 (PrimaryCTA's `opacity: 0.55`), upgraded with explanatory subtext so the user understands *why* the button is dim.

The parser still verifies non-Jupiter pairs (Engine analysis runs, ReportView renders). Only the execution leg is gated.

## 9. PairInput cosmetic fix (M4 carryover)

`src/components/PairInput.tsx` adds a `useEffect` that resolves whenever the `value` prop changes (covers parent-driven autofill, not just user-blur):

```tsx
useEffect(() => {
  if (!value.trim()) {
    setResolved(null);
    setTouched(false);
    return;
  }
  const r = resolveToPythFeed(value);
  setResolved(r);
  setTouched(true);
  onResolve(r);
}, [value]);
```

The M4 workaround in `CaptureScreen.onParse` (calling `setResolvedPair(resolveToPythFeed(...))` alongside `setPairText`) is reverted — the autofill returns to the clean two-line form (`setPairText(result.parsed.pair)` only). The `useEffect` is now the single source of resolve truth.

The chip ("BTC/USDT ✓") now renders on parser autofill, closing the M4 follow-up.

## 10. PRD updates

| Section | Change |
|---|---|
| §4.1 Phase 1 | Replace "Drift Protocol perp order construction (TypeScript SDK)" with "Jupiter Perps via Anchor IDL". Add: "Markets in MVP scope = SOL-PERP, ETH-PERP, wBTC-PERP (matches JLP pool)". Drop "On-chain trade execution on Drift devnet (mainnet if time permits)" — Jupiter is mainnet-only; replace with "On-chain trade execution on Solana mainnet via Jupiter Perps." |
| §6.4 Execution | Full rewrite: PositionRequest/keeper model, single MWA prompt covering 4 transactions via `signAllTransactions`, Jupiter keeper executes within ~1s, polling for keeper execution, naked-position recovery UX. Drop FR-EXEC-2 reference to `@drift-labs/sdk`. Drop FR-EXEC-6 "Drift devnet" — replace with "Solana mainnet only; no devnet path for Jupiter Perps." |
| §6.5 Settings | Add: wallet management (connect/disconnect, view address, view USDC balance), RPC endpoint override URL field, default = public mainnet RPC. |
| §6.6 Data feed | Drop FR-DATA-2 ("Drift historical API"). Promote Pyth Benchmarks (M3) to primary, Birdeye (M3) to fallback. Note Dove Oracle (Jupiter pool-internal) is the trigger reference — slight drift between Pyth and Dove is a documented quirk affecting trigger fire prices, not verification. |
| §9 Risks | Add: "JLP utilization spike causing keeper revert" (mitigation: off-peak demo timing + reserve USDC). Replace "Drift devnet down during demo" with "Solana mainnet RPC congestion" (mitigation: private RPC override for stage). Add: "Naked-position from partial batch failure" (mitigation: explicit retry/close UI in ConfirmTradeModal). |

The PRD is updated as part of M5 implementation, not as a separate doc.

## 11. Demo signal fixtures

`src/parser/__tests__/__fixtures__/rawSignals.ts` (M4) covers DOGE/APT/ETH/PENGU/AAVE/BTC across templates A-E. Jupiter only supports SOL/ETH/wBTC. The existing ETH (template C) and BTC (template multi-trade for LLM) fixtures already cover Jupiter-tradable pairs. Three new SOL fixtures are authored to cover the remaining templates the demo touches:

- 1× SOL Sheldon (template A) — synthetic, mimics the DOGE Sheldon style
- 1× SOL emoji (template B) — synthetic, mimics the APT emoji style
- 1× SOL Langestrom (template D) — synthetic, mimics the PENGU Langestrom style

Total: 3 new fixtures added to the existing array. These are **demo-ready** signals — they parse cleanly, hit Jupiter-tradable markets, and are the rotation Dexter pastes during stage practice and recorded demo.

## 12. New deps and EAS rebuild

### 12.1 `pnpm add`

```
@coral-xyz/anchor
@solana/web3.js
@wallet-ui/react-native-web3js
@solana-mobile/mobile-wallet-adapter-protocol-web3js
@solana-mobile/mobile-wallet-adapter-protocol
@solana/spl-token
react-native-quick-crypto
react-native-get-random-values
react-native-url-polyfill
@craftzdog/react-native-buffer
```

### 12.2 `index.ts` polyfills

Top of entry file (before any other imports):

```ts
import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import { Buffer } from "@craftzdog/react-native-buffer";
global.Buffer = Buffer;
```

### 12.3 EAS rebuild — Day 1 evening

`react-native-quick-crypto` and the MWA protocol packages add native modules. Autolinking at build time means a fresh EAS dev client APK is required. The M3 APK won't autolink the new deps and will crash on import.

Plan:
1. Day 1 evening: `pnpm add` all deps, edit `app.json` if needed, `eas build --profile development --platform android --non-interactive`
2. Wall time: ~25-40 minutes (free tier queue + build)
3. Day 2 morning: install fresh APK on phone, restart Metro with `--clear`, begin Wallet layer dev

## 13. Testing strategy

### 13.1 Pure-TS unit tests (vitest)

Existing M3/M4 vitest config (`src/smc/**`, `src/data/**`, `src/parser/**`) is extended to include `src/jupiter/**` and `src/wallet/__tests__/**`.

New tests:
- `src/jupiter/__tests__/markets.test.ts` — `pairToMarket` lookup table, `isJupiterSupported` coverage, `MARKETS` metadata schema validation
- `src/jupiter/__tests__/position.test.ts` — `decodePosition` against golden Position fixtures, `computePnl` against hand-computed expected values for long/short × winning/losing × with/without borrow accrual
- `src/wallet/__tests__/walletStore.test.ts` — secureSettings extension keys round-trip

The MWA layer (`MwaProvider`, `useConnect`, `useUsdcBalance`) and the Anchor-Provider-bound `client.ts` are NOT covered by vitest — they need RN runtime or real on-chain calls. Tested manually on phone (per M3/M4 pattern).

### 13.2 Manual mainnet integration test (Day 4-5)

Sequenced on phone, $100 USDC reserve, ~10 test positions expected:

1. **Connect flow:** install fresh APK → Connect Wallet → Phantom opens → SIWS prompt → confirm. WalletChip shows truncated address + USDC balance. Disconnect, reconnect — silent reauth via cached auth_token (no Phantom prompt).
2. **Open SOL position:** paste SOL Sheldon synthetic signal → Parse → ConfirmTradeModal → 4-tx prompt → all 4 succeed within 30s → position appears on Home tab within 5s of last leg. Tx signatures clickable to Solana Explorer.
3. **Trigger fires:** hand-edit TP1 to a price within ~0.5% of current → wait for keeper. Position closes, PnL realized, position list updates.
4. **Naked-position recovery:** mock SL leg failure (e.g. set triggerPrice=0 to force revert) → red banner appears → tap Retry SL → leg succeeds. Then tap Close position → position closes cleanly.
5. **Disconnect cleanly:** Settings → Wallet card → Disconnect → wallet-side `deauthorize` fires → walletStore cleared → next launch shows "Connect Wallet" CTA on Home.
6. **Pair coverage gate:** paste DOGE Sheldon (M4 fixture) → Parse → Confirm button is disabled with subtitle "Jupiter Perps doesn't support DOGEUSDT yet…". Verification still runs.

Burn rate estimate: ~$2-4 in Jupiter fees + ~0.05 SOL in tx fees and PDA rent across the 10 test positions. Rent recovered on close.

## 14. Time budget (6 days)

| Day | Tier 1 work | Tier 2 work |
|---|---|---|
| **Day 1 (today)** | Brainstorm + spec + plan; `pnpm add` deps; EAS build kicks off; verify Jupiter program ID via IDL repo | — |
| **Day 2** | Wallet layer (MwaProvider, useConnect, useUsdcBalance, walletStore); Settings Wallet card; HomeScreen Connect CTA | — |
| **Day 3** | Jupiter IDL fetched + checked in; `markets.ts` (PDAs verified against Pool); `client.openPosition` for SOL-PERP; first $50 mainnet open-position smoke test | — |
| **Day 4** | `ConfirmTradeModal` review + execution screens; 4-tx batch via signAllTransactions; per-leg progress polling; mainnet integration test #1 | TP/SL trigger orders (`client.addTrigger`) |
| **Day 5** | Naked-position recovery UX; pair coverage gate; PairInput cosmetic fix | ETH/wBTC market support; Position list (HomeScreen); `client.listOpenPositions` + `client.closePosition` |
| **Day 6** | PRD updates; demo fixture authoring; manual integration test full sweep; demo recording; buffer | — |

Critical-path days are 3 and 4. Day 3 surfaces any RN/Anchor/MWA runtime gotchas; Day 4 validates the 4-tx batch flow on real mainnet. If Day 4 slips, Tier 2 items contract from "should ship" toward "stretch."

## 15. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Mainnet RPC congestion at demo time | Medium | High — demo fails | Private RPC (Helius free tier) wired by user via Settings; fallback default to public RPC |
| JLP utilization spike causes keeper revert | Low-Medium | High | Demo at off-peak hours; keep $50 USDC reserve to retry |
| Naked position from partial batch failure | Low | Medium-High | Loud red-banner UI + retry/close CTAs; `auth_token` persists so retry doesn't need re-prompt |
| MWA SIWS unsupported on installed Phantom version | Low | Low | `@wallet-ui/react-native-web3js` falls back to authorize + signMessage transparently |
| Codama-gen runtime issue on RN (Path A) | N/A — chose Path B to avoid | — | — |
| EAS build queue delays Day 2 start | Low | Medium | Kick off Day 1 evening; Day 2 morning has buffer |
| Jupiter program upgrade breaks IDL during M5 | Low | Medium | Pin checked-in IDL; re-fetch Day 6 to verify before demo recording |
| User pastes wrong program ID (already happened once with Lend) | — | — | Spec hard-codes verified `PERPHjGB...` ID; cross-check against `github.com/jup-ag/jupiter-perps-anchor-idl-parsing` README on Day 1 |

## 16. Open questions

None at design-lock time. All scope, architecture, UX, and stack choices are locked per the brainstorm transcript.

Future-question parking lot for M6:
- Limit entry orders (parser `entryRange` + UI mode toggle)
- WebSocket Position-account subscription instead of polling
- Multi-position management on the same market (currently M5 assumes one open position per market per user)
- Switching from `@coral-xyz/anchor` + web3.js v1 to Codama-gen + `@solana/kit` once the kit-native ecosystem matures

## 17. Success criteria

M5 is shipped when ALL of these are true:
1. `pnpm test` is green (existing 195 + new tests for `src/jupiter/` and `src/wallet/`)
2. `pnpm exec tsc --noEmit` is clean
3. Manual integration test sequence (§13.2) all six steps pass on mainnet
4. PRD §4.1 / §6.4 / §6.5 / §6.6 / §9 reflect Jupiter, not Drift
5. PairInput chip renders on parser autofill (no blur required)
6. Demo recording (Day 6) shows the full flow: paste SOL signal → Parse → Confirm → 4 txs sign in one prompt → position appears on Home with live PnL → trigger fires → realized PnL shown
7. `git status` is clean and the milestone branches are pushed only after Dexter says "push it"

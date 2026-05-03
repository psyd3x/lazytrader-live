---
title: M3 Live Data Feed Implementation Plan
description: Bite-sized task-by-task plan to ship the M3 live data feed — replaces synthetic candles with Pyth Benchmarks (primary) + optional Birdeye fallback gated behind user-supplied API key in expo-secure-store. 18 tasks covering deps, foundation modules, adapters, UI, and phone verification.
type: implementation-plan
project: lazytrader
phase: m3-live-data
status: ready
date: 2026-05-03
created: 2026-05-03
tags: [plan, lazytrader, m3, data-feed, pyth, birdeye, secure-store, tdd]
---

# M3 Live Data Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Related**: [[2026-05-03-m3-live-data-feed-design]] · [[PRD]] · [[ARCHITECTURE]] · [[IMPLEMENTATION-PLAN]]

**Spec**: `docs/superpowers/specs/2026-05-03-m3-live-data-feed-design.md`

**Goal:** Replace LazyTrader's synthetic candle stub with a live OHLCV feed (Pyth Benchmarks primary, optional Birdeye fallback gated behind a user-supplied API key in Android Keystore). Engine output for any pasted real-market signal reflects current market state.

**Architecture:** New `src/data/{pyth,birdeye,feed,cache,pairs}.ts` modules feed engine via existing `Candle[]` interface. New `src/storage/secureSettings.ts` wraps `expo-secure-store`. New `src/components/{PairInput,SecretInput}.tsx`. SettingsScreen + CaptureScreen modified. Engine itself unchanged.

**Tech Stack:** React Native 0.81 + Expo SDK 54, TypeScript strict, vitest for unit tests, `expo-secure-store` (new), `@react-native-async-storage/async-storage` (already installed), `fetch` (built-in).

---

## Notes for the executor

**Engine integration facts (locked from spec investigation)**:
- `Candle.timestamp` is in **milliseconds** — Pyth returns `t` in seconds, multiply by 1000
- `Candle` shape: `{ timestamp, open, high, low, close, volume }` — see `src/smc/models.ts:38`
- Pyth volume is always 0; engine doesn't currently use it (`calcVolumeState` is dead code in scoring pipeline)
- Engine TF identifiers are `"1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W"` — see `src/smc/config.ts:17`
- Engine expects newest-last ordering; Pyth returns oldest-to-newest = same thing

**Testing approach**:
- TDD for `pairs.ts`, `cache.ts`, `pyth.ts`, `birdeye.ts`, `feed.ts` — all logic-heavy, all testable in node
- Use `vi.mock()` to mock `@react-native-async-storage/async-storage` and `global.fetch` in tests
- NO new tests for UI components — visual verification on phone (RN component test setup is out of scope, same call as visual-layer plan)
- Existing 27 SMC fixtures must stay green throughout
- `pnpm exec tsc --noEmit` must exit 0 after every commit

**Commit cadence**: one commit per task, conventional commits, trailer `Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>`. Never push without explicit user approval.

**Phone setup (current)**:
- Tailscale phone IP: `100.84.228.67`
- Wireless debugging port: cycles per session — get fresh from phone screen if reconnect needed
- Mac Tailscale: `100.88.202.3:8081` for Metro
- See `~/.claude/projects/-/memory/reference_lazytrader_phone_adb.md` for full ADB workflow

**Reference snapshots** (current state at start of M3):
- main = `f02d71a` (visual layer fully shipped, pushed)
- 27/27 tests green, tsc clean
- Metro running on Mac in background

---

## Task 1: Install expo-secure-store + disable Android backup

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (auto via `expo install`)
- Modify: `app.json`

**Why:** Secure storage is the foundation for any user-supplied secret (Birdeye key in M3, wallet auth token in M5). One install + one rebuild covers both. Disabling Android Auto Backup keeps the encrypted blob from being harvested by Google's backup pipeline.

- [ ] **Step 1: Install expo-secure-store**

```bash
cd ~/lazytrader-app
pnpm exec expo install expo-secure-store
```

Expected: package added to dependencies in `package.json`. Native module — will need EAS rebuild in Task 2.

- [ ] **Step 2: Disable Android Auto Backup in app.json**

Open `app.json` and add `allowBackup: false` to the `android` block. Example:

```json
{
  "expo": {
    "name": "lazytrader",
    "android": {
      "package": "live.lazytrader",
      "allowBackup": false
    }
  }
}
```

If the `android` block already exists, add `"allowBackup": false` to it. If `android` doesn't exist, create it (preserve any other Expo config).

- [ ] **Step 3: Verify install + tsc clean**

```bash
cd ~/lazytrader-app
grep '"expo-secure-store"' package.json
pnpm exec tsc --noEmit
echo "TSC=$?"
```

Expected: package line present, `TSC=0`.

- [ ] **Step 4: Commit**

```bash
cd ~/lazytrader-app
git add package.json pnpm-lock.yaml app.json
git commit -m "chore(deps): add expo-secure-store + disable Android Auto Backup

Foundational dep for storing user-supplied API keys (Birdeye in M3,
wallet auth tokens in M5) in Android Keystore — hardware-backed AES
on modern devices. Same security model Phantom uses.

Setting allowBackup:false prevents Google Auto Backup from harvesting
the encrypted secure-store blob in system backups.

Triggers one EAS Cloud Build before phone iteration resumes.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Trigger EAS Cloud Build

**Files:** none.

**Why:** `expo-secure-store` is a native module — needs to be linked into the dev APK before the new code can run on phone.

- [ ] **Step 1: Trigger build (background — ~15 min wait)**

```bash
cd ~/lazytrader-app
export PATH="$HOME/Library/pnpm:$PATH"
source ~/.expo-token.zsh
eas build --profile development --platform android --non-interactive
```

Expected: build queues, prints build ID + URL. Run in background or new terminal so other work can proceed.

- [ ] **Step 2: Wait for build to finish (~12-18 min total)**

Check status via `eas build:list --limit 1 --json` or watch the build URL. Status: `in queue` → `in progress` → `finished`. If `errored`, read EAS logs and fix before re-running.

- [ ] **Step 3: Capture APK URL**

```bash
export PATH="$HOME/Library/pnpm:$PATH"
source ~/.expo-token.zsh
eas build:list --limit 1 --json | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['artifacts']['applicationArchiveUrl'])"
```

Note the URL for Task 3.

No commit (build artifact lives on EAS).

---

## Task 3: Install fresh APK on phone

**Files:** none.

**Why:** Replaces existing APK on `fbi-van-42` with the one that has `expo-secure-store` registered. Otherwise `SecureStore.setItemAsync` will throw at runtime.

- [ ] **Step 1: Download APK locally**

```bash
cd /tmp
curl -L -o lazytrader-dev.apk "<URL from Task 2 Step 3>"
ls -lh lazytrader-dev.apk  # ~300MB
```

- [ ] **Step 2: Get fresh wireless debugging port**

Phone is paired but ports cycle per session. Open Wireless Debugging on phone — note the connect port at the top (5-digit). If never paired, follow the pair-port dance from `reference_lazytrader_phone_adb.md`.

- [ ] **Step 3: Connect + install**

```bash
adb connect 100.84.228.67:<port>
adb devices  # confirm "device", not "offline"
adb -s 100.84.228.67:<port> install -r /tmp/lazytrader-dev.apk
```

Expected: `Performing Streamed Install ... Success`. Takes ~10-15 min over Tailscale on Starlink.

- [ ] **Step 4: Restart Metro with --clear**

After native deps change, Metro's resolver cache must be cleared.

```bash
# Kill any existing Metro:
lsof -iTCP:8081 -sTCP:LISTEN | awk 'NR>1 {print $2}' | xargs -r kill
# Restart fresh:
cd ~/lazytrader-app
REACT_NATIVE_PACKAGER_HOSTNAME=100.88.202.3 pnpm exec expo start --dev-client --clear
# Run in background — leave the Metro process up for the rest of the plan
```

- [ ] **Step 5: Confirm app loads**

Open `live.lazytrader` on phone, dev client connects to Metro. App should render the visual-layer screens unchanged. If you get a bundle error mentioning `expo-secure-store`, that's expected until later tasks import it (we haven't yet).

- [ ] **Step 6: Clean up downloaded APK**

```bash
rm /tmp/lazytrader-dev.apk
```

No commit.

---

## Task 4: Pair normalizer (pure function, TDD)

**Files:**
- Create: `src/data/pairs.ts`
- Create: `src/data/__tests__/pairs.test.ts`

**Why:** Free-form user input ("$BTC", "BTCUSDT", "btc/usdt", "BTC-PERP") must collapse to a canonical `{base, quote}` shape before any catalog lookup. Pure function — fully testable in node, no RN deps.

- [ ] **Step 1: Write the failing tests**

Create `src/data/__tests__/pairs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizePairInput } from "../pairs";

describe("normalizePairInput", () => {
  it("treats bare ticker as USD-quoted", () => {
    expect(normalizePairInput("BTC")).toEqual({ base: "BTC", quote: "USD" });
  });
  it("strips $ prefix", () => {
    expect(normalizePairInput("$BTC")).toEqual({ base: "BTC", quote: "USD" });
  });
  it("uppercases lowercase input", () => {
    expect(normalizePairInput("btc")).toEqual({ base: "BTC", quote: "USD" });
  });
  it("parses concatenated USDT pair", () => {
    expect(normalizePairInput("BTCUSDT")).toEqual({ base: "BTC", quote: "USDT" });
  });
  it("parses slash-separated pair", () => {
    expect(normalizePairInput("BTC/USDT")).toEqual({ base: "BTC", quote: "USDT" });
  });
  it("parses dash-separated pair", () => {
    expect(normalizePairInput("BTC-USDT")).toEqual({ base: "BTC", quote: "USDT" });
  });
  it("parses underscore-separated pair", () => {
    expect(normalizePairInput("BTC_USDT")).toEqual({ base: "BTC", quote: "USDT" });
  });
  it("parses USDC quote", () => {
    expect(normalizePairInput("SOLUSDC")).toEqual({ base: "SOL", quote: "USDC" });
  });
  it("treats PERP suffix as USD quote", () => {
    expect(normalizePairInput("BTC-PERP")).toEqual({ base: "BTC", quote: "USD" });
  });
  it("treats USD suffix correctly", () => {
    expect(normalizePairInput("BTCUSD")).toEqual({ base: "BTC", quote: "USD" });
  });
  it("handles 4-char base (e.g. BONK)", () => {
    expect(normalizePairInput("BONKUSDT")).toEqual({ base: "BONK", quote: "USDT" });
  });
  it("trims whitespace", () => {
    expect(normalizePairInput("  btc  ")).toEqual({ base: "BTC", quote: "USD" });
  });
  it("returns null for empty string", () => {
    expect(normalizePairInput("")).toBeNull();
  });
  it("returns null for whitespace only", () => {
    expect(normalizePairInput("   ")).toBeNull();
  });
  it("returns null for unparseable garbage", () => {
    expect(normalizePairInput("!!!@#$")).toBeNull();
  });
  it("returns null for too-short base (1 char)", () => {
    expect(normalizePairInput("X")).toBeNull();
  });
  it("returns null for too-long base (>6 chars)", () => {
    expect(normalizePairInput("TOOLONGBASE")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10
```

Expected: failure with "Cannot find module '../pairs'" or equivalent.

- [ ] **Step 3: Write minimal implementation**

Create `src/data/pairs.ts`:

```ts
/**
 * Pair normalization + Pyth feed catalog lookup.
 *
 * `normalizePairInput` is a pure function — converts free-form user input
 * to `{base, quote}` or null. `resolveToPythFeed` (Task 6) layers the
 * Pyth feed catalog on top of the normalizer.
 */

export interface NormalizedPair {
  base: string;
  quote: string;
}

const QUOTES = ["USDT", "USDC", "USD"] as const;
const BASE_RE = /^[A-Z0-9]{2,6}$/;

/** Normalize free-form user input to canonical {base, quote} or null. */
export function normalizePairInput(raw: string): NormalizedPair | null {
  if (!raw) return null;
  let s = raw.trim().toUpperCase();
  if (!s) return null;
  if (s.startsWith("$")) s = s.slice(1);

  // PERP suffix → USD quote
  if (s.endsWith("-PERP") || s.endsWith("PERP")) {
    const base = s.replace(/-?PERP$/, "");
    if (BASE_RE.test(base)) return { base, quote: "USD" };
    return null;
  }

  // Try slash / dash / underscore separators first (unambiguous)
  for (const sep of ["/", "-", "_"]) {
    if (s.includes(sep)) {
      const [base, quote] = s.split(sep);
      if (BASE_RE.test(base) && (QUOTES as readonly string[]).includes(quote)) {
        return { base, quote };
      }
      return null;
    }
  }

  // Concatenated form — try each quote suffix longest-first
  for (const quote of QUOTES) {
    if (s.endsWith(quote) && s.length > quote.length) {
      const base = s.slice(0, -quote.length);
      if (BASE_RE.test(base)) return { base, quote };
    }
  }

  // Bare ticker → USD-quoted
  if (BASE_RE.test(s)) return { base: s, quote: "USD" };
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10
```

Expected: 27 + 17 = 44 tests passing.

- [ ] **Step 5: tsc check**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: `TSC=OK`.

- [ ] **Step 6: Commit**

```bash
cd ~/lazytrader-app
git add src/data/pairs.ts src/data/__tests__/pairs.test.ts
git commit -m "feat(data): add pair input normalizer

Pure function collapsing free-form pair input (\$BTC, BTCUSDT, BTC/USDT,
BTC-PERP, etc) to canonical {base, quote}. 17 vitest cases covering
separator variants, quote suffixes, bare tickers, PERP handling, and
rejection paths.

Catalog lookup layer (resolveToPythFeed) lands in Task 6 once the Pyth
feed snapshot exists.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Pyth feed catalog snapshot script + bundled JSON

**Files:**
- Create: `scripts/refresh-pyth-feeds.ts`
- Create: `src/data/pyth-feeds.json`

**Why:** The catalog of supported pairs must live on-device — runtime fetch on every cold start would cost ~150KB + ~200ms per launch. Snapshot from Pyth's `/v2/price_feeds?asset_type=crypto` endpoint at build time. Re-run the script before each release to refresh.

- [ ] **Step 1: Write the snapshot script**

Create `scripts/refresh-pyth-feeds.ts`:

```ts
/**
 * One-shot script: fetch the full crypto feed catalog from Pyth and write
 * a trimmed snapshot to src/data/pyth-feeds.json.
 *
 * Run: `pnpm exec tsx scripts/refresh-pyth-feeds.ts` (or `node --import tsx ...`).
 * Output is committed — runtime never re-fetches.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

interface PythApiFeed {
  id: string;
  attributes: {
    asset_type: string;
    base?: string;
    quote_currency?: string;
    symbol: string;          // e.g. "Crypto.BTC/USD"
    display_symbol?: string;
    generic_symbol?: string;
  };
}

interface SnapshotEntry {
  base: string;
  quote: string;
  pythSymbol: string;
  pythFeedId: string;
}

const URL = "https://hermes.pyth.network/v2/price_feeds?asset_type=crypto";

async function main() {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Pyth API ${res.status}: ${await res.text()}`);
  const feeds = (await res.json()) as PythApiFeed[];

  const out: SnapshotEntry[] = [];
  for (const f of feeds) {
    const sym = f.attributes.symbol;
    if (!sym.startsWith("Crypto.")) continue;
    // "Crypto.BTC/USD" → ["BTC","USD"]
    const tail = sym.slice("Crypto.".length);
    const slash = tail.indexOf("/");
    if (slash <= 0) continue;
    const base = tail.slice(0, slash).toUpperCase();
    const quote = tail.slice(slash + 1).toUpperCase();
    if (!base || !quote) continue;
    out.push({ base, quote, pythSymbol: sym, pythFeedId: f.id });
  }

  // Stable order so diffs are reviewable
  out.sort((a, b) =>
    a.base.localeCompare(b.base) || a.quote.localeCompare(b.quote),
  );

  const dest = join(process.cwd(), "src/data/pyth-feeds.json");
  writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${out.length} feeds to ${dest}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Install tsx (dev-only)**

```bash
cd ~/lazytrader-app && pnpm add -D tsx
```

Expected: tsx added to `devDependencies`.

- [ ] **Step 3: Run the script**

```bash
cd ~/lazytrader-app && pnpm exec tsx scripts/refresh-pyth-feeds.ts
```

Expected: prints `Wrote NNN feeds to .../src/data/pyth-feeds.json` (NNN ~150-200). Network failure here means Pyth Hermes is down — retry; this is a one-off so flakiness OK.

- [ ] **Step 4: Sanity check the snapshot**

```bash
cd ~/lazytrader-app
head -20 src/data/pyth-feeds.json
echo "---ENTRIES---"
node -e "console.log(require('./src/data/pyth-feeds.json').length)"
echo "---HAS BTC?---"
node -e "console.log(require('./src/data/pyth-feeds.json').filter(f => f.base==='BTC' && f.quote==='USD'))"
```

Expected: BTC/USD entry present with a non-empty `pythFeedId`.

- [ ] **Step 5: tsc check**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: `TSC=OK`. Script is excluded from `tsconfig.json` "include" — verify before commit; if tsc complains, add `"exclude": ["scripts/**"]` to tsconfig.json.

- [ ] **Step 6: Commit**

```bash
cd ~/lazytrader-app
git add scripts/refresh-pyth-feeds.ts src/data/pyth-feeds.json package.json pnpm-lock.yaml
# tsconfig.json only if you had to edit it in step 5
git diff --cached --stat
git commit -m "feat(data): add Pyth feed catalog snapshot + refresh script

Bundles ~150 crypto feeds from Pyth Hermes /v2/price_feeds at build
time. Runtime never refetches — saves ~150KB and ~200ms on cold start.
Re-run scripts/refresh-pyth-feeds.ts before each release if catalog
changed (Pyth lists new feeds ~weekly).

Catalog drives pair allowlist via resolveToPythFeed (Task 6).

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Catalog lookup `resolveToPythFeed` + Birdeye token map (TDD)

**Files:**
- Modify: `src/data/pairs.ts`
- Modify: `src/data/__tests__/pairs.test.ts`

**Why:** Layers the bundled Pyth catalog on top of `normalizePairInput`. Returns a `ResolvedPair` carrying both the Pyth feed metadata and (when available) a Solana SPL mint for Birdeye fallback.

- [ ] **Step 1: Append failing tests**

Append to `src/data/__tests__/pairs.test.ts` (keep existing tests):

```ts
import { resolveToPythFeed } from "../pairs";

describe("resolveToPythFeed", () => {
  it("resolves BTC to Crypto.BTC/USD", () => {
    const r = resolveToPythFeed("BTC");
    expect(r).not.toBeNull();
    expect(r!.base).toBe("BTC");
    expect(r!.pyth).not.toBeNull();
    expect(r!.pyth!.pythSymbol).toBe("Crypto.BTC/USD");
    expect(r!.pyth!.pythFeedId).toMatch(/^[0-9a-fx]+$/i);
  });
  it("resolves $BTC same as BTC", () => {
    const a = resolveToPythFeed("$BTC");
    const b = resolveToPythFeed("BTC");
    expect(a?.pyth?.pythSymbol).toBe(b?.pyth?.pythSymbol);
  });
  it("collapses USDT/USDC quote to USD-quoted Pyth feed", () => {
    const r = resolveToPythFeed("BTCUSDT");
    expect(r?.pyth?.pythSymbol).toBe("Crypto.BTC/USD");
  });
  it("attaches birdeyeTokenAddress for SOL", () => {
    const r = resolveToPythFeed("SOL");
    expect(r?.birdeyeTokenAddress).toBe("So11111111111111111111111111111111111111112");
  });
  it("leaves birdeyeTokenAddress undefined for BTC (no SPL mint)", () => {
    const r = resolveToPythFeed("BTC");
    expect(r?.birdeyeTokenAddress).toBeUndefined();
  });
  it("returns null when normalizer fails", () => {
    expect(resolveToPythFeed("!!!")).toBeNull();
  });
  it("returns ResolvedPair with pyth=null when base not in catalog", () => {
    const r = resolveToPythFeed("ZZZNOTAREALCOINPLZ");
    // Normalizer rejects >6 chars, so this is null
    expect(r).toBeNull();
  });
  it("returns ResolvedPair with pyth=null for valid-shape but unknown base", () => {
    // 4-char base passes normalizer but unlikely to be on Pyth
    const r = resolveToPythFeed("ZZZZ");
    expect(r).not.toBeNull();
    expect(r!.pyth).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10
```

Expected: failures referencing `resolveToPythFeed` not exported.

- [ ] **Step 3: Extend `src/data/pairs.ts`**

Append below the existing `normalizePairInput`:

```ts
import pythFeedsRaw from "./pyth-feeds.json";

interface PythFeedRow {
  base: string;
  quote: string;
  pythSymbol: string;
  pythFeedId: string;
}

const PYTH_FEEDS = pythFeedsRaw as readonly PythFeedRow[];

export interface PythFeed {
  pythSymbol: string;
  pythFeedId: string;
}

export interface ResolvedPair {
  base: string;
  quote: string;
  pyth: PythFeed | null;
  /** Solana SPL mint — only set when Birdeye coverage exists. */
  birdeyeTokenAddress?: string;
}

/**
 * Top-10 Drift markets that map to a SOL-native SPL mint. BTC/ETH wrappers
 * exist but tend to be illiquid on Birdeye — better to return null and let
 * Birdeye fallback skip those pairs rather than serve bad prices.
 */
const BIRDEYE_MINTS: Readonly<Record<string, string>> = {
  SOL: "So11111111111111111111111111111111111111112",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  JTO: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
  WIF: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  PYTH: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
  RNDR: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",
  JLP: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4",
  ORCA: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
  MNGO: "MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac",
};

/** Lookup the Pyth feed for a normalized pair. USDT/USDC quotes fold to USD. */
function lookupPythFeed(base: string, quote: string): PythFeed | null {
  const targetQuote = quote === "USDT" || quote === "USDC" ? "USD" : quote;
  const hit = PYTH_FEEDS.find((f) => f.base === base && f.quote === targetQuote);
  if (!hit) return null;
  return { pythSymbol: hit.pythSymbol, pythFeedId: hit.pythFeedId };
}

/** Normalize → catalog lookup → ResolvedPair (or null on bad input). */
export function resolveToPythFeed(input: string): ResolvedPair | null {
  const norm = normalizePairInput(input);
  if (!norm) return null;
  const pyth = lookupPythFeed(norm.base, norm.quote);
  const birdeyeTokenAddress = BIRDEYE_MINTS[norm.base];
  return {
    base: norm.base,
    quote: norm.quote,
    pyth,
    ...(birdeyeTokenAddress ? { birdeyeTokenAddress } : {}),
  };
}
```

- [ ] **Step 4: Verify tsconfig allows JSON import**

```bash
cd ~/lazytrader-app && grep -E "resolveJsonModule|esModuleInterop" tsconfig.json
```

Expected: `"resolveJsonModule": true` present. If missing, add it inside `"compilerOptions"` and re-run tsc.

- [ ] **Step 5: Run tests**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10 && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: 27 + 17 + 8 = 52 tests passing, TSC=OK.

- [ ] **Step 6: Commit**

```bash
cd ~/lazytrader-app
git add src/data/pairs.ts src/data/__tests__/pairs.test.ts tsconfig.json 2>/dev/null
git diff --cached --stat
git commit -m "feat(data): add Pyth catalog lookup + Birdeye mint map

resolveToPythFeed layers the bundled feed snapshot on top of the
normalizer, folding USDT/USDC quotes to USD (Pyth's quote convention).
ResolvedPair also carries optional birdeyeTokenAddress for the top-10
SOL-native Drift markets — pairs without an SPL mint (BTC, ETH) skip
Birdeye fallback by design.

8 new vitest cases.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Two-layer cache (L1 in-memory + L2 AsyncStorage) — TDD

**Files:**
- Create: `src/data/cache.ts`
- Create: `src/data/__tests__/cache.test.ts`

**Why:** Engine cold-fetch hits 5 TFs × 1 network round-trip each ≈ 3-5s on Starlink. Warm fetch (cache hit) must be <500ms per spec §16. Per-TF TTLs balance freshness against bandwidth.

- [ ] **Step 1: Write failing tests**

Create `src/data/__tests__/cache.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory shim for AsyncStorage. Reset before each test.
const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    setItem: vi.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve();
    }),
    removeItem: vi.fn((k: string) => {
      store.delete(k);
      return Promise.resolve();
    }),
    getAllKeys: vi.fn(() => Promise.resolve([...store.keys()])),
  },
}));

import { CandleCache, ttlForTf } from "../cache";
import type { Candle } from "../../smc";

const sampleCandles: Candle[] = [
  { timestamp: 1_000_000, open: 100, high: 110, low: 95, close: 105, volume: 0 },
];

describe("ttlForTf", () => {
  it("returns 30s for 1m and 5m", () => {
    expect(ttlForTf("1m")).toBe(30_000);
    expect(ttlForTf("5m")).toBe(30_000);
  });
  it("returns 60s for 15m", () => {
    expect(ttlForTf("15m")).toBe(60_000);
  });
  it("returns 5min for 1H", () => {
    expect(ttlForTf("1H")).toBe(5 * 60_000);
  });
  it("returns 15min for 4H", () => {
    expect(ttlForTf("4H")).toBe(15 * 60_000);
  });
  it("returns 1h for 1D and 1W", () => {
    expect(ttlForTf("1D")).toBe(60 * 60_000);
    expect(ttlForTf("1W")).toBe(60 * 60_000);
  });
});

describe("CandleCache", () => {
  beforeEach(() => {
    store.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-03T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null on miss", async () => {
    const c = new CandleCache();
    expect(await c.get("Crypto.BTC/USD", "1H")).toBeNull();
  });

  it("returns hit from L1 within TTL", async () => {
    const c = new CandleCache();
    await c.set("Crypto.BTC/USD", "1H", sampleCandles);
    const hit = await c.get("Crypto.BTC/USD", "1H");
    expect(hit).toEqual(sampleCandles);
  });

  it("returns null after TTL expires", async () => {
    const c = new CandleCache();
    await c.set("Crypto.BTC/USD", "1H", sampleCandles);
    vi.advanceTimersByTime(6 * 60_000); // 6min > 5min TTL for 1H
    expect(await c.get("Crypto.BTC/USD", "1H")).toBeNull();
  });

  it("falls back to L2 when L1 missed but L2 fresh (new instance)", async () => {
    const c1 = new CandleCache();
    await c1.set("Crypto.BTC/USD", "1H", sampleCandles);
    // Simulate process restart — new instance, L1 empty, L2 persisted
    const c2 = new CandleCache();
    expect(await c2.get("Crypto.BTC/USD", "1H")).toEqual(sampleCandles);
  });

  it("ignores L2 entry past TTL", async () => {
    const c1 = new CandleCache();
    await c1.set("Crypto.BTC/USD", "1H", sampleCandles);
    vi.advanceTimersByTime(6 * 60_000);
    const c2 = new CandleCache();
    expect(await c2.get("Crypto.BTC/USD", "1H")).toBeNull();
  });

  it("keys by symbol AND tf — no cross-TF leak", async () => {
    const c = new CandleCache();
    await c.set("Crypto.BTC/USD", "1H", sampleCandles);
    expect(await c.get("Crypto.BTC/USD", "4H")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10
```

Expected: failure with "Cannot find module '../cache'".

- [ ] **Step 3: Implement `src/data/cache.ts`**

```ts
/**
 * Two-layer OHLCV cache:
 *   L1 — in-memory Map for the lifetime of the process (instant, JS-side)
 *   L2 — AsyncStorage for persistence across app restarts
 *
 * Both layers honor a per-TF TTL. Engine consumers never see expired data.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Candle } from "../smc";

export type TfKey = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";

const TTL_MS: Readonly<Record<TfKey, number>> = {
  "1m": 30_000,
  "5m": 30_000,
  "15m": 60_000,
  "1H": 5 * 60_000,
  "4H": 15 * 60_000,
  "1D": 60 * 60_000,
  "1W": 60 * 60_000,
};

export function ttlForTf(tf: TfKey): number {
  return TTL_MS[tf];
}

interface Entry {
  data: Candle[];
  expiresAt: number;
}

const PREFIX = "lt:cache:v1:";

function makeKey(symbol: string, tf: TfKey): string {
  return `${PREFIX}${symbol}:${tf}`;
}

export class CandleCache {
  private l1 = new Map<string, Entry>();

  async get(symbol: string, tf: TfKey): Promise<Candle[] | null> {
    const key = makeKey(symbol, tf);
    const now = Date.now();

    // L1
    const hit = this.l1.get(key);
    if (hit && hit.expiresAt > now) return hit.data;
    if (hit) this.l1.delete(key);

    // L2
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Entry;
      if (parsed.expiresAt > now) {
        this.l1.set(key, parsed); // promote to L1
        return parsed.data;
      }
      // Stale — clean up
      await AsyncStorage.removeItem(key);
      return null;
    } catch {
      // Corrupt entry — drop it
      await AsyncStorage.removeItem(key);
      return null;
    }
  }

  async set(symbol: string, tf: TfKey, data: Candle[]): Promise<void> {
    const key = makeKey(symbol, tf);
    const entry: Entry = { data, expiresAt: Date.now() + ttlForTf(tf) };
    this.l1.set(key, entry);
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  }
}

/** Module-level singleton — share one cache across all feed.ts callers. */
export const candleCache = new CandleCache();
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10 && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: 27 + 17 + 8 + 6 + 6 = 64 tests passing, TSC=OK.

- [ ] **Step 5: Commit**

```bash
cd ~/lazytrader-app
git add src/data/cache.ts src/data/__tests__/cache.test.ts
git commit -m "feat(data): add two-layer candle cache with per-TF TTL

L1 in-memory Map + L2 AsyncStorage, deterministic TTL per timeframe
(30s for 1m/5m up to 1h for 1D/1W). New instance reads L2 to survive
process restart; expired L2 entries are dropped on read. Module-level
singleton candleCache shared across feed.ts callers.

12 vitest cases cover hit/miss, TTL expiry, L2 fallback, and key isolation.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Secure settings wrapper (`secureSettings.ts`)

**Files:**
- Create: `src/storage/secureSettings.ts`

**Why:** Single chokepoint for all secret reads/writes. Means no other module ever imports `expo-secure-store` directly — easier to audit, easier to mock in future tests, and M5 (wallet auth tokens) can extend the same module without touching consumers.

- [ ] **Step 1: Create the directory**

```bash
cd ~/lazytrader-app && mkdir -p src/storage
```

- [ ] **Step 2: Write the wrapper**

Create `src/storage/secureSettings.ts`:

```ts
/**
 * Secure key-value store backed by expo-secure-store (Android Keystore /
 * iOS Keychain). The ONLY module in the app that imports SecureStore.
 *
 * - Returns null on miss (never throws for "not found")
 * - Throws on platform-level failures (caller decides how to surface)
 * - Never logs values; debug paths must use redact() helper
 *
 * M3 stores: birdeye API key.
 * M5 will extend with: wallet auth token / session jwt.
 */

import * as SecureStore from "expo-secure-store";

const KEYS = {
  birdeyeApiKey: "birdeye_api_key",
} as const;

export async function getBirdeyeApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.birdeyeApiKey);
}

export async function setBirdeyeApiKey(value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    await clearBirdeyeApiKey();
    return;
  }
  await SecureStore.setItemAsync(KEYS.birdeyeApiKey, trimmed);
}

export async function clearBirdeyeApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.birdeyeApiKey);
}

/** Redact a secret value for logging. Returns "•••••" + last 4 chars. */
export function redact(value: string | null | undefined): string {
  if (!value) return "(empty)";
  if (value.length <= 4) return "•••••";
  return "•••••" + value.slice(-4);
}
```

- [ ] **Step 3: tsc check**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: `TSC=OK`. (No tests — module is a thin wrapper around a native API; behavior verification happens on phone in T18.)

- [ ] **Step 4: Commit**

```bash
cd ~/lazytrader-app
git add src/storage/secureSettings.ts
git commit -m "feat(storage): add secureSettings wrapper around expo-secure-store

Single chokepoint for all secret reads/writes — no other module imports
SecureStore directly. M3 uses it for the Birdeye API key; M5 will extend
with wallet auth tokens. redact() helper for any future debug logging.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Pyth adapter — single-TF fetch (TDD)

**Files:**
- Create: `src/data/pyth.ts`
- Create: `src/data/__tests__/pyth.test.ts`

**Why:** Primary data source. Encapsulates Pyth Benchmarks TradingView UDF shim — wrong response shape, HTTP errors, status="no_data" all funneled through one adapter so the engine never sees vendor-specific concerns.

- [ ] **Step 1: Write failing tests**

Create `src/data/__tests__/pyth.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPythCandles, tfToPythResolution } from "../pyth";
import type { ResolvedPair } from "../pairs";

const btcPair: ResolvedPair = {
  base: "BTC",
  quote: "USD",
  pyth: { pythSymbol: "Crypto.BTC/USD", pythFeedId: "0xdeadbeef" },
};

describe("tfToPythResolution", () => {
  it.each([
    ["1m", "1"],
    ["5m", "5"],
    ["15m", "15"],
    ["1H", "60"],
    ["4H", "240"],
    ["1D", "1D"],
    ["1W", "1W"],
  ])("maps %s → %s", (tf, expected) => {
    expect(tfToPythResolution(tf as never)).toBe(expected);
  });
});

describe("fetchPythCandles", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns empty array on status='no_data'", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ s: "no_data" }),
    });
    const out = await fetchPythCandles({ pair: btcPair, tf: "1H", fromUnix: 100, toUnix: 200 });
    expect(out).toEqual([]);
  });

  it("converts response arrays to Candle[] with ms timestamps", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        s: "ok",
        t: [1000, 2000],
        o: [100, 105],
        h: [110, 115],
        l: [95, 100],
        c: [105, 110],
        v: [0, 0],
      }),
    });
    const out = await fetchPythCandles({ pair: btcPair, tf: "1H", fromUnix: 100, toUnix: 2000 });
    expect(out).toEqual([
      { timestamp: 1_000_000, open: 100, high: 110, low: 95, close: 105, volume: 0 },
      { timestamp: 2_000_000, open: 105, high: 115, low: 100, close: 110, volume: 0 },
    ]);
  });

  it("hits the correct URL with resolution + bounds", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ s: "no_data" }),
    });
    vi.stubGlobal("fetch", mock);
    await fetchPythCandles({ pair: btcPair, tf: "4H", fromUnix: 100, toUnix: 200 });
    const url = mock.mock.calls[0][0] as string;
    expect(url).toContain("symbol=Crypto.BTC%2FUSD");
    expect(url).toContain("resolution=240");
    expect(url).toContain("from=100");
    expect(url).toContain("to=200");
  });

  it("throws PythError on HTTP failure", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: () => Promise.resolve("upstream down"),
    });
    await expect(
      fetchPythCandles({ pair: btcPair, tf: "1H", fromUnix: 100, toUnix: 200 }),
    ).rejects.toThrow(/Pyth/);
  });

  it("throws when pair has no Pyth feed", async () => {
    const noPyth: ResolvedPair = { base: "ZZZZ", quote: "USD", pyth: null };
    await expect(
      fetchPythCandles({ pair: noPyth, tf: "1H", fromUnix: 100, toUnix: 200 }),
    ).rejects.toThrow(/no Pyth feed/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10
```

Expected: failure with "Cannot find module '../pyth'".

- [ ] **Step 3: Implement `src/data/pyth.ts` (no pagination yet — Task 10)**

```ts
/**
 * Pyth Benchmarks TradingView UDF shim adapter — primary OHLCV source.
 *
 * Endpoint: https://benchmarks.pyth.network/v1/shims/tradingview/history
 * No auth, public CDN, returns clean OHLCV. Volume is always 0 — engine
 * doesn't currently use volume in scoring (calcVolumeState is dead code).
 *
 * Pagination for 1W (1-year-per-request limit) lands in Task 10.
 */

import type { Candle } from "../smc";
import type { ResolvedPair } from "./pairs";
import type { TfKey } from "./cache";

const BASE = "https://benchmarks.pyth.network/v1/shims/tradingview/history";

export class PythError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "PythError";
  }
}

const TF_TO_RES: Readonly<Record<TfKey, string>> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1H": "60",
  "4H": "240",
  "1D": "1D",
  "1W": "1W",
};

export function tfToPythResolution(tf: TfKey): string {
  return TF_TO_RES[tf];
}

interface PythResponse {
  s: "ok" | "no_data" | "error";
  t?: number[];
  o?: number[];
  h?: number[];
  l?: number[];
  c?: number[];
  v?: number[];
  errmsg?: string;
}

export interface FetchPythOpts {
  pair: ResolvedPair;
  tf: TfKey;
  fromUnix: number;
  toUnix: number;
}

/** Fetch OHLCV from Pyth for a single TF + time window. */
export async function fetchPythCandles(opts: FetchPythOpts): Promise<Candle[]> {
  const { pair, tf, fromUnix, toUnix } = opts;
  if (!pair.pyth) throw new PythError(`no Pyth feed for ${pair.base}/${pair.quote}`);

  const url =
    `${BASE}?symbol=${encodeURIComponent(pair.pyth.pythSymbol)}` +
    `&resolution=${tfToPythResolution(tf)}` +
    `&from=${fromUnix}&to=${toUnix}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new PythError(`Pyth network error: ${(e as Error).message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new PythError(`Pyth HTTP ${res.status}: ${body.slice(0, 200)}`, res.status);
  }

  const json = (await res.json()) as PythResponse;
  if (json.s === "no_data") return [];
  if (json.s !== "ok") throw new PythError(`Pyth status=${json.s}: ${json.errmsg ?? ""}`);

  const t = json.t ?? [];
  const o = json.o ?? [];
  const h = json.h ?? [];
  const l = json.l ?? [];
  const c = json.c ?? [];
  const v = json.v ?? [];
  if (![o.length, h.length, l.length, c.length].every((n) => n === t.length)) {
    throw new PythError(`Pyth response shape mismatch (lengths)`);
  }

  const out: Candle[] = new Array(t.length);
  for (let i = 0; i < t.length; i++) {
    out[i] = {
      timestamp: t[i] * 1000, // sec → ms (Candle.timestamp is ms)
      open: o[i],
      high: h[i],
      low: l[i],
      close: c[i],
      volume: v[i] ?? 0,
    };
  }
  return out;
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10 && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: 12 new tests pass, TSC=OK.

- [ ] **Step 5: Commit**

```bash
cd ~/lazytrader-app
git add src/data/pyth.ts src/data/__tests__/pyth.test.ts
git commit -m "feat(data): add Pyth Benchmarks adapter (single-TF fetch)

Wraps Pyth's TradingView UDF shim. Status='no_data' returns [], HTTP
errors throw PythError (with status). Volume coerced to 0 — engine
doesn't use it in current scoring. tfToPythResolution maps engine TF
ids to Pyth resolutions (1m→'1', ..., 1W→'1W').

Pagination for 1W (1-year per-request limit) lands in Task 10.

12 vitest cases with mocked fetch.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Pyth pagination for 1W (TDD)

**Files:**
- Modify: `src/data/pyth.ts`
- Modify: `src/data/__tests__/pyth.test.ts`

**Why:** Pyth caps each request to 1 year of bars. For 1W TF, the engine wants ~120 bars ≈ 2.3 years — needs 3 sequential sub-requests. Other TFs fit in a single request.

- [ ] **Step 1: Append failing tests**

Append to `src/data/__tests__/pyth.test.ts`:

```ts
describe("fetchPythCandles pagination", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("makes a single request for 1H even over 1-year span", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ s: "no_data" }),
    });
    vi.stubGlobal("fetch", mock);
    const from = 0;
    const to = 2 * 365 * 24 * 3600; // 2 years
    await fetchPythCandles({ pair: btcPair, tf: "1H", fromUnix: from, toUnix: to });
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("paginates 1W in 1-year chunks when span > 1 year", async () => {
    const mock = vi.fn();
    // span = ~2.5 years → 3 chunks
    mock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({
      s: "ok", t: [100], o: [1], h: [1], l: [1], c: [1], v: [0],
    }) });
    mock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({
      s: "ok", t: [200], o: [2], h: [2], l: [2], c: [2], v: [0],
    }) });
    mock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({
      s: "ok", t: [300], o: [3], h: [3], l: [3], c: [3], v: [0],
    }) });
    vi.stubGlobal("fetch", mock);

    const from = 0;
    const to = Math.floor(2.5 * 365 * 24 * 3600);
    const out = await fetchPythCandles({ pair: btcPair, tf: "1W", fromUnix: from, toUnix: to });
    expect(mock).toHaveBeenCalledTimes(3);
    expect(out.map((c) => c.close)).toEqual([1, 2, 3]);
  });

  it("does not paginate 1W when span <= 1 year", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ s: "no_data" }),
    });
    vi.stubGlobal("fetch", mock);
    await fetchPythCandles({
      pair: btcPair, tf: "1W", fromUnix: 0, toUnix: 365 * 24 * 3600 - 1,
    });
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/lazytrader-app && pnpm test src/data/__tests__/pyth.test.ts 2>&1 | tail -10
```

Expected: pagination tests fail (only 1 fetch call vs expected 3).

- [ ] **Step 3: Refactor `src/data/pyth.ts` to add pagination**

In `src/data/pyth.ts`, rename the existing fetch logic to a private `fetchOneWindow` and replace the public `fetchPythCandles` with a paginating wrapper:

```ts
const ONE_YEAR_SEC = 365 * 24 * 3600;

/** Internal: fetch a single window without pagination logic. */
async function fetchOneWindow(opts: FetchPythOpts): Promise<Candle[]> {
  const { pair, tf, fromUnix, toUnix } = opts;
  if (!pair.pyth) throw new PythError(`no Pyth feed for ${pair.base}/${pair.quote}`);

  const url =
    `${BASE}?symbol=${encodeURIComponent(pair.pyth.pythSymbol)}` +
    `&resolution=${tfToPythResolution(tf)}` +
    `&from=${fromUnix}&to=${toUnix}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new PythError(`Pyth network error: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new PythError(`Pyth HTTP ${res.status}: ${body.slice(0, 200)}`, res.status);
  }
  const json = (await res.json()) as PythResponse;
  if (json.s === "no_data") return [];
  if (json.s !== "ok") throw new PythError(`Pyth status=${json.s}: ${json.errmsg ?? ""}`);

  const t = json.t ?? [];
  const o = json.o ?? [];
  const h = json.h ?? [];
  const l = json.l ?? [];
  const c = json.c ?? [];
  const v = json.v ?? [];
  if (![o.length, h.length, l.length, c.length].every((n) => n === t.length)) {
    throw new PythError(`Pyth response shape mismatch (lengths)`);
  }

  const out: Candle[] = new Array(t.length);
  for (let i = 0; i < t.length; i++) {
    out[i] = {
      timestamp: t[i] * 1000,
      open: o[i],
      high: h[i],
      low: l[i],
      close: c[i],
      volume: v[i] ?? 0,
    };
  }
  return out;
}

/** Public: fetch OHLCV with automatic 1-year pagination for 1W. */
export async function fetchPythCandles(opts: FetchPythOpts): Promise<Candle[]> {
  const { fromUnix, toUnix, tf } = opts;
  const span = toUnix - fromUnix;

  // Only 1W needs pagination — other TFs fit in a single 1-year window even
  // for 120-bar history.
  if (tf !== "1W" || span <= ONE_YEAR_SEC) {
    return fetchOneWindow(opts);
  }

  const all: Candle[] = [];
  let cursor = fromUnix;
  while (cursor < toUnix) {
    const next = Math.min(cursor + ONE_YEAR_SEC, toUnix);
    const chunk = await fetchOneWindow({ ...opts, fromUnix: cursor, toUnix: next });
    all.push(...chunk);
    cursor = next;
  }
  return all;
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10 && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: all 15 pyth tests pass (12 + 3 new), TSC=OK.

- [ ] **Step 5: Commit**

```bash
cd ~/lazytrader-app
git add src/data/pyth.ts src/data/__tests__/pyth.test.ts
git commit -m "feat(data): paginate Pyth 1W requests across 1-year chunks

Pyth caps each request to 1 year. For 1W (~120 bars = 2.3 years), split
into N sequential sub-requests, concatenate results. Other TFs untouched
— their 120-bar windows fit in a single year.

3 vitest cases cover: single-request for 1H even at 2-year span,
3-chunk split for 2.5-year 1W span, and no-pagination at exactly 1 year.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Birdeye adapter (TDD)

**Files:**
- Create: `src/data/birdeye.ts`
- Create: `src/data/__tests__/birdeye.test.ts`

**Why:** Optional fallback when Pyth is down. Gated behind a user-supplied API key (no CF Worker proxy needed because the key is the user's own — they bear the rate-limit cost). Same `Candle[]` output shape as Pyth so `feed.ts` can swap sources transparently.

- [ ] **Step 1: Write failing tests**

Create `src/data/__tests__/birdeye.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BirdeyeAuthError,
  BirdeyeError,
  BirdeyeRateLimitError,
  fetchBirdeyeCandles,
  tfToBirdeyeType,
} from "../birdeye";
import type { ResolvedPair } from "../pairs";

const solPair: ResolvedPair = {
  base: "SOL",
  quote: "USD",
  pyth: { pythSymbol: "Crypto.SOL/USD", pythFeedId: "0xabc" },
  birdeyeTokenAddress: "So11111111111111111111111111111111111111112",
};

describe("tfToBirdeyeType", () => {
  it.each([
    ["1m", "1m"],
    ["5m", "5m"],
    ["15m", "15m"],
    ["1H", "1H"],
    ["4H", "4H"],
    ["1D", "1D"],
    ["1W", "1W"],
  ])("maps %s → %s", (tf, expected) => {
    expect(tfToBirdeyeType(tf as never)).toBe(expected);
  });
});

describe("fetchBirdeyeCandles", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("converts response items to Candle[] with ms timestamps", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        data: {
          items: [
            { unixTime: 1000, o: 100, h: 110, l: 95, c: 105, v: 12345 },
            { unixTime: 2000, o: 105, h: 115, l: 100, c: 110, v: 23456 },
          ],
        },
      }),
    });
    const out = await fetchBirdeyeCandles({
      pair: solPair, tf: "1H", fromUnix: 100, toUnix: 2000, apiKey: "k",
    });
    expect(out).toEqual([
      { timestamp: 1_000_000, open: 100, high: 110, low: 95, close: 105, volume: 12345 },
      { timestamp: 2_000_000, open: 105, high: 115, low: 100, close: 110, volume: 23456 },
    ]);
  });

  it("sends x-api-key + x-chain headers", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: { items: [] } }),
    });
    vi.stubGlobal("fetch", mock);
    await fetchBirdeyeCandles({
      pair: solPair, tf: "1H", fromUnix: 0, toUnix: 1000, apiKey: "secret-key",
    });
    const init = mock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("secret-key");
    expect(headers["x-chain"]).toBe("solana");
  });

  it("throws BirdeyeAuthError on 401", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 401, text: () => Promise.resolve("invalid key"),
    });
    await expect(
      fetchBirdeyeCandles({ pair: solPair, tf: "1H", fromUnix: 0, toUnix: 1, apiKey: "bad" }),
    ).rejects.toBeInstanceOf(BirdeyeAuthError);
  });

  it("throws BirdeyeRateLimitError on 429", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 429, text: () => Promise.resolve("rate limited"),
    });
    await expect(
      fetchBirdeyeCandles({ pair: solPair, tf: "1H", fromUnix: 0, toUnix: 1, apiKey: "k" }),
    ).rejects.toBeInstanceOf(BirdeyeRateLimitError);
  });

  it("throws BirdeyeError on other HTTP failure", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 503, text: () => Promise.resolve("upstream"),
    });
    await expect(
      fetchBirdeyeCandles({ pair: solPair, tf: "1H", fromUnix: 0, toUnix: 1, apiKey: "k" }),
    ).rejects.toBeInstanceOf(BirdeyeError);
  });

  it("throws BirdeyeError when pair has no birdeyeTokenAddress", async () => {
    const btcPair: ResolvedPair = {
      base: "BTC", quote: "USD",
      pyth: { pythSymbol: "Crypto.BTC/USD", pythFeedId: "0x1" },
    };
    await expect(
      fetchBirdeyeCandles({ pair: btcPair, tf: "1H", fromUnix: 0, toUnix: 1, apiKey: "k" }),
    ).rejects.toThrow(/no Birdeye/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10
```

Expected: failure with "Cannot find module '../birdeye'".

- [ ] **Step 3: Implement `src/data/birdeye.ts`**

```ts
/**
 * Birdeye OHLCV adapter — optional fallback when Pyth fails.
 *
 * Requires a user-supplied API key (read from secureSettings, injected
 * by feed.ts at call time — adapter never touches storage).
 *
 * Pair coverage limited to SOL-native tokens (see BIRDEYE_MINTS in
 * pairs.ts). Pairs without a token address must be filtered upstream.
 */

import type { Candle } from "../smc";
import type { ResolvedPair } from "./pairs";
import type { TfKey } from "./cache";

const BASE = "https://public-api.birdeye.so/defi/ohlcv";

export class BirdeyeError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "BirdeyeError";
  }
}
export class BirdeyeAuthError extends BirdeyeError {
  constructor(message: string) { super(message, 401); this.name = "BirdeyeAuthError"; }
}
export class BirdeyeRateLimitError extends BirdeyeError {
  constructor(message: string) { super(message, 429); this.name = "BirdeyeRateLimitError"; }
}

const TF_TO_TYPE: Readonly<Record<TfKey, string>> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1H": "1H",
  "4H": "4H",
  "1D": "1D",
  "1W": "1W",
};

export function tfToBirdeyeType(tf: TfKey): string {
  return TF_TO_TYPE[tf];
}

interface BirdeyeItem {
  unixTime: number;
  o: number; h: number; l: number; c: number; v: number;
}
interface BirdeyeResponse {
  success: boolean;
  data?: { items?: BirdeyeItem[] };
  message?: string;
}

export interface FetchBirdeyeOpts {
  pair: ResolvedPair;
  tf: TfKey;
  fromUnix: number;
  toUnix: number;
  apiKey: string;
}

export async function fetchBirdeyeCandles(opts: FetchBirdeyeOpts): Promise<Candle[]> {
  const { pair, tf, fromUnix, toUnix, apiKey } = opts;
  if (!pair.birdeyeTokenAddress) {
    throw new BirdeyeError(`no Birdeye token address for ${pair.base}/${pair.quote}`);
  }

  const url =
    `${BASE}?address=${pair.birdeyeTokenAddress}` +
    `&type=${tfToBirdeyeType(tf)}` +
    `&time_from=${fromUnix}&time_to=${toUnix}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "x-api-key": apiKey, "x-chain": "solana" },
    });
  } catch (e) {
    throw new BirdeyeError(`Birdeye network error: ${(e as Error).message}`);
  }

  if (res.status === 401) {
    throw new BirdeyeAuthError("Birdeye API key invalid (HTTP 401)");
  }
  if (res.status === 429) {
    throw new BirdeyeRateLimitError("Birdeye rate-limited (HTTP 429)");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new BirdeyeError(`Birdeye HTTP ${res.status}: ${body.slice(0, 200)}`, res.status);
  }

  const json = (await res.json()) as BirdeyeResponse;
  if (!json.success) {
    throw new BirdeyeError(`Birdeye success=false: ${json.message ?? ""}`);
  }
  const items = json.data?.items ?? [];
  return items.map((it) => ({
    timestamp: it.unixTime * 1000,
    open: it.o, high: it.h, low: it.l, close: it.c,
    volume: it.v ?? 0,
  }));
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10 && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: 13 new birdeye tests pass, TSC=OK.

- [ ] **Step 5: Commit**

```bash
cd ~/lazytrader-app
git add src/data/birdeye.ts src/data/__tests__/birdeye.test.ts
git commit -m "feat(data): add Birdeye OHLCV adapter (optional fallback)

Wraps Birdeye /defi/ohlcv with x-api-key + x-chain:solana headers.
Discriminates errors: BirdeyeAuthError (401) for invalid key,
BirdeyeRateLimitError (429) for throttle, BirdeyeError otherwise.
Pairs without birdeyeTokenAddress (BTC, ETH wrappers) throw early.

13 vitest cases cover happy path, header injection, all error classes,
and missing token address.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Feed orchestrator with primary→fallback (TDD)

**Files:**
- Create: `src/data/feed.ts`
- Create: `src/data/__tests__/feed.test.ts`

**Why:** Single entry point for the engine. Owns the cache/Pyth/Birdeye decision tree. Concurrency: all TFs fetched in parallel, each TF independently fails over.

- [ ] **Step 1: Write failing tests**

Create `src/data/__tests__/feed.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    setItem: vi.fn((k: string, v: string) => { store.set(k, v); return Promise.resolve(); }),
    removeItem: vi.fn((k: string) => { store.delete(k); return Promise.resolve(); }),
    getAllKeys: vi.fn(() => Promise.resolve([...store.keys()])),
  },
}));

vi.mock("../pyth", () => ({
  fetchPythCandles: vi.fn(),
  PythError: class PythError extends Error {},
}));
vi.mock("../birdeye", () => ({
  fetchBirdeyeCandles: vi.fn(),
  BirdeyeError: class BirdeyeError extends Error {},
  BirdeyeAuthError: class BirdeyeAuthError extends Error {},
  BirdeyeRateLimitError: class BirdeyeRateLimitError extends Error {},
}));
vi.mock("../../storage/secureSettings", () => ({
  getBirdeyeApiKey: vi.fn(),
}));

import { fetchPythCandles } from "../pyth";
import { fetchBirdeyeCandles } from "../birdeye";
import { getBirdeyeApiKey } from "../../storage/secureSettings";
import { fetchCandlesForEngine, NoCandlesError } from "../feed";
import type { ResolvedPair } from "../pairs";

const solPair: ResolvedPair = {
  base: "SOL", quote: "USD",
  pyth: { pythSymbol: "Crypto.SOL/USD", pythFeedId: "0xabc" },
  birdeyeTokenAddress: "So11111111111111111111111111111111111111112",
};

const btcPair: ResolvedPair = {
  base: "BTC", quote: "USD",
  pyth: { pythSymbol: "Crypto.BTC/USD", pythFeedId: "0xbtc" },
};

const sample = [{ timestamp: 1000, open: 1, high: 1, low: 1, close: 1, volume: 0 }];

describe("fetchCandlesForEngine", () => {
  beforeEach(() => {
    store.clear();
    vi.mocked(fetchPythCandles).mockReset();
    vi.mocked(fetchBirdeyeCandles).mockReset();
    vi.mocked(getBirdeyeApiKey).mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns Pyth data on happy path for all enabled TFs", async () => {
    vi.mocked(fetchPythCandles).mockResolvedValue(sample);
    const out = await fetchCandlesForEngine({ pair: solPair });
    expect(Object.keys(out).sort()).toEqual(["15m", "1D", "1H", "1W", "4H"].sort());
    for (const tf of Object.keys(out)) expect(out[tf]).toEqual(sample);
  });

  it("falls back to Birdeye on Pyth failure when key present", async () => {
    vi.mocked(fetchPythCandles).mockRejectedValue(new Error("Pyth down"));
    vi.mocked(getBirdeyeApiKey).mockResolvedValue("user-key");
    vi.mocked(fetchBirdeyeCandles).mockResolvedValue(sample);
    const out = await fetchCandlesForEngine({ pair: solPair, tfs: ["1H"] });
    expect(out["1H"]).toEqual(sample);
    expect(fetchBirdeyeCandles).toHaveBeenCalled();
  });

  it("throws NoCandlesError when Pyth fails and no Birdeye key", async () => {
    vi.mocked(fetchPythCandles).mockRejectedValue(new Error("Pyth down"));
    vi.mocked(getBirdeyeApiKey).mockResolvedValue(null);
    await expect(fetchCandlesForEngine({ pair: solPair, tfs: ["1H"] }))
      .rejects.toBeInstanceOf(NoCandlesError);
  });

  it("throws NoCandlesError when both sources fail", async () => {
    vi.mocked(fetchPythCandles).mockRejectedValue(new Error("Pyth down"));
    vi.mocked(getBirdeyeApiKey).mockResolvedValue("user-key");
    vi.mocked(fetchBirdeyeCandles).mockRejectedValue(new Error("Birdeye down"));
    await expect(fetchCandlesForEngine({ pair: solPair, tfs: ["1H"] }))
      .rejects.toBeInstanceOf(NoCandlesError);
  });

  it("skips Birdeye when pair has no token address (BTC)", async () => {
    vi.mocked(fetchPythCandles).mockRejectedValue(new Error("Pyth down"));
    vi.mocked(getBirdeyeApiKey).mockResolvedValue("user-key");
    await expect(fetchCandlesForEngine({ pair: btcPair, tfs: ["1H"] }))
      .rejects.toBeInstanceOf(NoCandlesError);
    expect(fetchBirdeyeCandles).not.toHaveBeenCalled();
  });

  it("uses cache on second call within TTL (single Pyth call)", async () => {
    vi.mocked(fetchPythCandles).mockResolvedValue(sample);
    await fetchCandlesForEngine({ pair: solPair, tfs: ["1H"] });
    await fetchCandlesForEngine({ pair: solPair, tfs: ["1H"] });
    expect(fetchPythCandles).toHaveBeenCalledTimes(1);
  });

  it("fetches all TFs in parallel (Promise.all)", async () => {
    let inFlight = 0;
    let maxConcurrent = 0;
    vi.mocked(fetchPythCandles).mockImplementation(async () => {
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return sample;
    });
    await fetchCandlesForEngine({ pair: solPair });
    expect(maxConcurrent).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10
```

Expected: failure with "Cannot find module '../feed'".

- [ ] **Step 3: Implement `src/data/feed.ts`**

```ts
/**
 * Feed orchestrator — single entry point the engine calls.
 *
 * Per TF: cache → Pyth → (if Pyth fails AND user has Birdeye key AND pair
 * has token address) → Birdeye → cache result. All TFs run in parallel,
 * each TF fails over independently.
 */

import type { Candle } from "../smc";
import type { ResolvedPair } from "./pairs";
import { candleCache, type TfKey } from "./cache";
import { fetchPythCandles } from "./pyth";
import { fetchBirdeyeCandles } from "./birdeye";
import { getBirdeyeApiKey } from "../storage/secureSettings";

export class NoCandlesError extends Error {
  constructor(public readonly tf: TfKey, public readonly causes: Error[]) {
    super(`no candles available for ${tf} (${causes.length} source(s) failed)`);
    this.name = "NoCandlesError";
  }
}

/** Engine-default TFs (mirrors DEFAULT_TIMEFRAMES enabled flags in src/smc/config.ts). */
export const DEFAULT_ENABLED_TFS: readonly TfKey[] = ["15m", "1H", "4H", "1D", "1W"];

/** How many bars per TF the engine wants. Used to size the time window. */
const BAR_COUNT_PER_TF = 120;

const TF_BAR_SECONDS: Readonly<Record<TfKey, number>> = {
  "1m": 60,
  "5m": 5 * 60,
  "15m": 15 * 60,
  "1H": 60 * 60,
  "4H": 4 * 60 * 60,
  "1D": 24 * 60 * 60,
  "1W": 7 * 24 * 60 * 60,
};

function windowFor(tf: TfKey): { fromUnix: number; toUnix: number } {
  const toUnix = Math.floor(Date.now() / 1000);
  const fromUnix = toUnix - TF_BAR_SECONDS[tf] * BAR_COUNT_PER_TF;
  return { fromUnix, toUnix };
}

export interface FetchEngineOpts {
  pair: ResolvedPair;
  tfs?: readonly TfKey[];
}

async function fetchOneTf(pair: ResolvedPair, tf: TfKey): Promise<Candle[]> {
  if (!pair.pyth) throw new NoCandlesError(tf, [new Error(`no Pyth feed for ${pair.base}`)]);

  const cached = await candleCache.get(pair.pyth.pythSymbol, tf);
  if (cached) return cached;

  const window = windowFor(tf);
  const causes: Error[] = [];

  // Try Pyth
  try {
    const out = await fetchPythCandles({ pair, tf, ...window });
    await candleCache.set(pair.pyth.pythSymbol, tf, out);
    return out;
  } catch (e) {
    causes.push(e as Error);
  }

  // Try Birdeye if key present + pair eligible
  if (pair.birdeyeTokenAddress) {
    const apiKey = await getBirdeyeApiKey();
    if (apiKey) {
      try {
        const out = await fetchBirdeyeCandles({ pair, tf, ...window, apiKey });
        await candleCache.set(pair.pyth.pythSymbol, tf, out);
        return out;
      } catch (e) {
        causes.push(e as Error);
      }
    }
  }

  throw new NoCandlesError(tf, causes);
}

export async function fetchCandlesForEngine(
  opts: FetchEngineOpts,
): Promise<Record<string, Candle[]>> {
  const tfs = opts.tfs ?? DEFAULT_ENABLED_TFS;
  const pairs = await Promise.all(
    tfs.map(async (tf) => [tf, await fetchOneTf(opts.pair, tf)] as const),
  );
  const out: Record<string, Candle[]> = {};
  for (const [tf, candles] of pairs) out[tf] = candles;
  return out;
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10 && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: 7 new feed tests pass, TSC=OK.

- [ ] **Step 5: Commit**

```bash
cd ~/lazytrader-app
git add src/data/feed.ts src/data/__tests__/feed.test.ts
git commit -m "feat(data): add feed orchestrator with primary→fallback

Engine entry point. Per TF: cache → Pyth → (Birdeye if key+token) →
NoCandlesError. All TFs fetched in parallel via Promise.all. Window
sized to ~120 bars per TF. Cache writes happen on the success path
only — no negative caching.

7 vitest cases cover happy path, fallback success, no-key error, both-
fail error, BTC-skip-Birdeye, cache reuse, parallel fan-out.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: `latestClose` helper (small, TDD)

**Files:**
- Modify: `src/data/feed.ts`
- Create: `src/data/__tests__/latestClose.test.ts`

**Why:** CaptureScreen needs `currentPrice` from the candle bundle. Engine spec §11 says: "prefer 1m → 5m → 15m → first available TF". One small pure helper, kept beside `feed.ts` so the engine call site stays clean.

- [ ] **Step 1: Write failing tests**

Create `src/data/__tests__/latestClose.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { latestClose } from "../feed";
import type { Candle } from "../../smc";

const c = (close: number): Candle => ({
  timestamp: 1000, open: close, high: close, low: close, close, volume: 0,
});

describe("latestClose", () => {
  it("prefers 1m last candle", () => {
    expect(latestClose({ "1m": [c(101)], "1H": [c(200)] })).toBe(101);
  });
  it("falls back to 5m when no 1m", () => {
    expect(latestClose({ "5m": [c(102)], "1H": [c(200)] })).toBe(102);
  });
  it("falls back to 15m when no 1m or 5m", () => {
    expect(latestClose({ "15m": [c(103)], "1H": [c(200)] })).toBe(103);
  });
  it("falls back to any TF when no preferred TF available", () => {
    expect(latestClose({ "4H": [c(104)] })).toBe(104);
  });
  it("returns last candle, not first", () => {
    expect(latestClose({ "1H": [c(100), c(110), c(120)] })).toBe(120);
  });
  it("returns null on empty bundle", () => {
    expect(latestClose({})).toBeNull();
  });
  it("skips empty TF arrays", () => {
    expect(latestClose({ "1m": [], "1H": [c(200)] })).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10
```

Expected: failure with "latestClose is not exported".

- [ ] **Step 3: Add `latestClose` to `src/data/feed.ts`**

Append to `src/data/feed.ts`:

```ts
const PREFERRED_TFS_FOR_PRICE: readonly string[] = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];

/** Return the most-recent close from the lowest-TF non-empty array, or null. */
export function latestClose(bundle: Record<string, Candle[]>): number | null {
  for (const tf of PREFERRED_TFS_FOR_PRICE) {
    const arr = bundle[tf];
    if (arr && arr.length > 0) return arr[arr.length - 1].close;
  }
  // Fallback — any non-empty TF
  for (const arr of Object.values(bundle)) {
    if (arr && arr.length > 0) return arr[arr.length - 1].close;
  }
  return null;
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10 && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: 7 new tests pass, TSC=OK.

- [ ] **Step 5: Commit**

```bash
cd ~/lazytrader-app
git add src/data/feed.ts src/data/__tests__/latestClose.test.ts
git commit -m "feat(data): add latestClose helper for currentPrice extraction

Prefers low-TF (1m/5m/15m) for freshness, falls back to higher TFs.
Returns null on empty bundle. CaptureScreen uses this to feed the
engine's currentPrice param.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: `SecretInput` component

**Files:**
- Create: `src/components/SecretInput.tsx`

**Why:** Reusable masked input for any secret (Birdeye key in M3, RPC URL with token in M8, etc). Keeps reveal/save/clear logic out of the screen.

- [ ] **Step 1: Create the component**

Create `src/components/SecretInput.tsx`:

```tsx
// src/components/SecretInput.tsx
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

export interface SecretInputProps {
  /** Current value (controlled). Empty string means no secret stored. */
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  /** Optional sub-label below input (e.g. status text). */
  helperText?: string;
  /** Called when user taps "Save". */
  onSave?: () => void;
  /** Called when user taps "Clear". Should clear value via onChangeText("") too. */
  onClear?: () => void;
  /** Whether Save button should show a busy state. */
  saving?: boolean;
  /** Disables Save button (e.g. when value unchanged from saved). */
  saveDisabled?: boolean;
}

export function SecretInput(props: SecretInputProps) {
  const {
    value, onChangeText, placeholder, helperText,
    onSave, onClear, saving = false, saveDisabled = false,
  } = props;
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? "Paste API key"}
          placeholderTextColor={`${colors.muted}80`}
          secureTextEntry={!revealed}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          onPress={() => setRevealed((r) => !r)}
          style={styles.revealBtn}
          hitSlop={8}
        >
          <Text style={styles.revealText}>{revealed ? "Hide" : "Reveal"}</Text>
        </Pressable>
      </View>
      {helperText !== undefined && <Text style={styles.helper}>{helperText}</Text>}
      <View style={styles.actions}>
        {onSave !== undefined && (
          <Pressable
            onPress={onSave}
            disabled={saveDisabled || saving}
            style={[styles.btn, (saveDisabled || saving) && styles.btnDisabled]}
          >
            <Text style={styles.btnText}>{saving ? "Saving…" : "Save"}</Text>
          </Pressable>
        )}
        {onClear !== undefined && value.length > 0 && (
          <Pressable onPress={onClear} style={[styles.btn, styles.btnSecondary]}>
            <Text style={[styles.btnText, styles.btnTextSecondary]}>Clear</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingRight: space.sm,
  },
  input: {
    flex: 1, padding: space.sm, color: colors.text,
    fontFamily: fonts.mono, fontSize: fontSize.sm,
  },
  revealBtn: { paddingHorizontal: space.sm, paddingVertical: 4 },
  revealText: {
    color: colors.muted, fontSize: fontSize.xs - 1,
    textTransform: "uppercase", letterSpacing: 1, fontWeight: fontWeight.semibold,
  },
  helper: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fonts.mono },
  actions: { flexDirection: "row", gap: space.sm },
  btn: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  btnDisabled: { opacity: 0.4 },
  btnSecondary: { backgroundColor: "transparent" },
  btnText: { color: colors.text, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  btnTextSecondary: { color: colors.muted },
});
```

- [ ] **Step 2: tsc check**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: `TSC=OK`. (No tests — RN component, visual verification on phone in T18.)

- [ ] **Step 3: Commit**

```bash
cd ~/lazytrader-app
git add src/components/SecretInput.tsx
git commit -m "feat(ui): add SecretInput component (masked + reveal/save/clear)

Reusable masked TextInput with reveal toggle, save+clear buttons. Used
by SettingsScreen for the Birdeye key input in M3; will be reused in
M8 for any secret-bearing setting.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: `PairInput` component with normalize-on-blur + validation chip

**Files:**
- Create: `src/components/PairInput.tsx`

**Why:** UX rule: user types free-form ("$btc", "BTCUSDT"); on blur it normalizes and validates against the Pyth catalog, showing a green chip ("BTC ready") or red chip ("Unsupported pair"). Self-contained — owns its own state for the chip.

- [ ] **Step 1: Create the component**

Create `src/components/PairInput.tsx`:

```tsx
// src/components/PairInput.tsx
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { resolveToPythFeed, type ResolvedPair } from "../data/pairs";
import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

export interface PairInputProps {
  /** Raw text the user has typed. Parent owns this state. */
  value: string;
  onChangeText: (next: string) => void;
  /** Called when validation completes (on blur). null = invalid. */
  onResolve: (pair: ResolvedPair | null) => void;
}

export function PairInput({ value, onChangeText, onResolve }: PairInputProps) {
  const [resolved, setResolved] = useState<ResolvedPair | null>(null);
  const [touched, setTouched] = useState(false);

  const handleBlur = () => {
    setTouched(true);
    const r = resolveToPythFeed(value);
    setResolved(r);
    onResolve(r);
  };

  const chip = (() => {
    if (!touched || !value.trim()) return null;
    if (resolved && resolved.pyth) {
      return { text: `${resolved.base}/${resolved.quote} ✓`, ok: true };
    }
    return { text: "Unsupported pair", ok: false };
  })();

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Pair</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(t) => {
            onChangeText(t);
            if (touched) {
              // Live re-validate while editing after first blur
              const r = resolveToPythFeed(t);
              setResolved(r);
              onResolve(r);
            }
          }}
          onBlur={handleBlur}
          placeholder="$BTC, BTCUSDT, SOL/USD…"
          placeholderTextColor={`${colors.muted}80`}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {chip !== null && (
          <View style={[styles.chip, chip.ok ? styles.chipOk : styles.chipBad]}>
            <Text style={[styles.chipText, chip.ok ? styles.chipTextOk : styles.chipTextBad]}>
              {chip.text}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  label: {
    fontSize: fontSize.xs - 1, color: colors.muted, letterSpacing: 1,
    textTransform: "uppercase", fontWeight: fontWeight.semibold,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: space.sm,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingRight: space.sm,
  },
  input: {
    flex: 1, padding: space.sm, color: colors.text,
    fontFamily: fonts.mono, fontSize: fontSize.sm,
  },
  chip: {
    paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipOk: { backgroundColor: colors.successBg ?? "rgba(16,185,129,0.1)", borderColor: colors.success ?? "#10B981" },
  chipBad: { backgroundColor: colors.dangerBg, borderColor: colors.danger },
  chipText: { fontSize: fontSize.xs - 1, fontWeight: fontWeight.semibold },
  chipTextOk: { color: colors.success ?? "#10B981" },
  chipTextBad: { color: colors.danger },
});
```

- [ ] **Step 2: Verify theme exports — fix if `successBg`/`success` missing**

```bash
cd ~/lazytrader-app && grep -n "success" src/theme/*.ts || echo "NO success colors"
```

If the grep returns nothing, the component already has a literal-color fallback baked in (`?? "#10B981"`, `?? "rgba(...)"`). That's intentional — keeps this task self-contained. If you'd prefer to add proper theme tokens instead, edit `src/theme/colors.ts` to add `success: "#10B981"` and `successBg: "rgba(16,185,129,0.1)"`, then strip the `??` fallbacks.

- [ ] **Step 3: tsc check**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: `TSC=OK`.

- [ ] **Step 4: Commit**

```bash
cd ~/lazytrader-app
git add src/components/PairInput.tsx src/theme/colors.ts 2>/dev/null
git diff --cached --stat
git commit -m "feat(ui): add PairInput with blur-validate + Pyth catalog chip

Free-form text input that normalizes + resolves against the Pyth
catalog on blur, then surfaces a green/red chip. After first blur,
re-validates live on every keystroke so users see feedback as they
type. Parent owns the text state and receives ResolvedPair|null
via onResolve.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: SettingsScreen — Data Sources card with Birdeye key flow

**Files:**
- Modify: `src/screens/SettingsScreen.tsx`

**Why:** UI for the only user-facing M3 setting (Birdeye API key). Wire SecretInput + secureSettings + a test-connection ping. Spec §9 layout.

- [ ] **Step 1: Refactor `SettingsScreen.tsx` to add the Data Sources card**

Edit `src/screens/SettingsScreen.tsx`. Inside the function `SettingsScreen`, convert it from a plain functional component into one that loads the saved key + tracks UI state. Replace the entire component body. The new file:

```tsx
// src/screens/SettingsScreen.tsx
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { NetBadge } from "../components/NetBadge";
import { ScreenBackdrop } from "../components/ScreenBackdrop";
import { SecretInput } from "../components/SecretInput";
import { WalletChip } from "../components/WalletChip";
import { fetchBirdeyeCandles, BirdeyeAuthError } from "../data/birdeye";
import {
  clearBirdeyeApiKey, getBirdeyeApiKey, setBirdeyeApiKey,
} from "../storage/secureSettings";
import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

const SOL_TEST_PAIR = {
  base: "SOL", quote: "USD",
  pyth: { pythSymbol: "Crypto.SOL/USD", pythFeedId: "" },
  birdeyeTokenAddress: "So11111111111111111111111111111111111111112",
};

export function SettingsScreen() {
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const k = await getBirdeyeApiKey();
      setSavedKey(k);
      setDraftKey(k ?? "");
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setStatus("Testing key…");
    try {
      // Validate by hitting Birdeye OHLCV for SOL (smallest meaningful request).
      const now = Math.floor(Date.now() / 1000);
      await fetchBirdeyeCandles({
        pair: SOL_TEST_PAIR,
        tf: "1H",
        fromUnix: now - 3600,
        toUnix: now,
        apiKey: draftKey.trim(),
      });
      await setBirdeyeApiKey(draftKey);
      setSavedKey(draftKey.trim());
      setStatus("Saved · key valid");
    } catch (e) {
      if (e instanceof BirdeyeAuthError) {
        setStatus("Key invalid — not saved");
      } else {
        // Network/rate-limit — save anyway with a warning. Spec §9.
        await setBirdeyeApiKey(draftKey);
        setSavedKey(draftKey.trim());
        setStatus(`Saved · couldn't verify (${(e as Error).message.slice(0, 60)})`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    await clearBirdeyeApiKey();
    setSavedKey(null);
    setDraftKey("");
    setStatus("Cleared");
  };

  const fallbackEnabled = savedKey !== null && savedKey.length > 0;

  return (
    <ScreenBackdrop>
      <View style={styles.topbar}>
        <WalletChip state="disconnected" />
        <NetBadge network="devnet" />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.h1}>Settings</Text>

        <Section title="Wallet">
          <Row label="Status" right={<Badge text="Disconnected" />} />
          <Row label="Connect Phantom" right={<Text style={styles.muted}>—</Text>} />
        </Section>

        <Section title="Network">
          <Row label="Cluster" right={<Badge text="Devnet" warn />} />
          <Row label="RPC" right={<Text style={styles.mono}>api.devnet.solana.com</Text>} />
        </Section>

        <Section title="Data Sources">
          <Row label="Primary" right={<Badge text="Pyth Benchmarks ●" />} />
          <Row
            label="Birdeye fallback"
            right={<Badge text={fallbackEnabled ? "● Enabled" : "○ Disabled"} />}
          />
          <View style={styles.cardBody}>
            <SecretInput
              value={draftKey}
              onChangeText={setDraftKey}
              placeholder="Birdeye API key"
              helperText={status ?? (fallbackEnabled ? "Key saved" : "Get a key at birdeye.so/developers")}
              onSave={handleSave}
              onClear={handleClear}
              saving={saving}
              saveDisabled={draftKey.trim() === (savedKey ?? "")}
            />
          </View>
        </Section>

        <Section title="Risk">
          <Row label="Max risk per trade" right={<Text style={styles.mono}>1.0%</Text>} />
          <Row label="Max leverage" right={<Text style={styles.mono}>25×</Text>} />
          <Row label="Account balance" right={<Text style={styles.mono}>$1,000</Text>} />
        </Section>

        <Section title="Engine">
          <Row label="Version" right={<Text style={styles.mono}>smc · 1.0.0</Text>} />
          <Row label="Golden fixtures" right={<Text style={styles.mono}>27 / 27 ✓</Text>} />
        </Section>

        <Text style={styles.foot}>Editable risk settings land in M8.</Text>
      </ScrollView>
    </ScreenBackdrop>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, right }: { label: string; right: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View>{right}</View>
    </View>
  );
}

function Badge({ text, warn = false }: { text: string; warn?: boolean }) {
  return (
    <View style={[styles.badge, warn ? { backgroundColor: colors.warningBg } : { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }]}>
      <Text style={[styles.badgeText, warn && { color: colors.warning }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xs },
  body: { padding: space.md, paddingBottom: 80, gap: space.md },
  h1: { fontSize: 22, fontWeight: fontWeight.bold, color: colors.text, marginVertical: space.sm },
  section: {
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden",
  },
  sectionTitle: {
    paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: 4,
    fontSize: fontSize.xs - 1, color: colors.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: fontWeight.semibold,
  },
  row: {
    paddingHorizontal: space.md, paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(143,161,179,0.06)",
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  cardBody: {
    paddingHorizontal: space.md, paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(143,161,179,0.06)",
  },
  rowLabel: { color: colors.text, fontSize: fontSize.body },
  mono: { fontFamily: fonts.mono, fontSize: fontSize.xs, color: colors.muted },
  muted: { color: colors.muted, fontSize: fontSize.sm },
  badge: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontSize: fontSize.xs - 1, color: colors.muted },
  foot: { color: colors.muted, fontSize: fontSize.xs, textAlign: "center", paddingVertical: space.lg },
});
```

- [ ] **Step 2: tsc check**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: `TSC=OK`.

- [ ] **Step 3: Commit**

```bash
cd ~/lazytrader-app
git add src/screens/SettingsScreen.tsx
git commit -m "feat(settings): add Data Sources card with Birdeye key flow

New card between Network and Risk. Always-on Pyth Benchmarks badge,
Birdeye fallback enabled/disabled indicator driven by secureSettings.
SecretInput drives save+clear; Save validates the key by firing one
Birdeye OHLCV ping for SOL (401 → don't save, network error → save
with warning per spec §9).

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: CaptureScreen — wire PairInput + live fetch

**Files:**
- Modify: `src/screens/CaptureScreen.tsx`

**Why:** Replaces `makeBtcDemo()` with the live feed pipeline. Adds PairInput row above the signal textarea. Signal entry/SL/TPs stay stubbed (live parser ships in M4) but driven by the real pair + current price.

- [ ] **Step 1: Replace `CaptureScreen.tsx`**

Rewrite `src/screens/CaptureScreen.tsx`:

```tsx
// src/screens/CaptureScreen.tsx
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { DetailsAccordion, type DetailFactor } from "../components/DetailsAccordion";
import { FactorChips, type FactorChip, type FactorSeverity } from "../components/FactorChips";
import { MultiTimeframeDashboard, type DashboardRow } from "../components/MultiTimeframeDashboard";
import { NetBadge } from "../components/NetBadge";
import { PairInput } from "../components/PairInput";
import { PrimaryCTA } from "../components/PrimaryCTA";
import { RatingHeroCard } from "../components/RatingHeroCard";
import { ScreenBackdrop } from "../components/ScreenBackdrop";
import { SizingStrip } from "../components/SizingStrip";
import { UploadScreenshotButton } from "../components/UploadScreenshotButton";
import { WalletChip } from "../components/WalletChip";
import { fetchCandlesForEngine, latestClose, NoCandlesError } from "../data/feed";
import type { ResolvedPair } from "../data/pairs";
import { generateSignalVerification } from "../smc";
import type { SignalInput, SignalVerificationReport } from "../smc";
import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

/**
 * Capture screen — paste/upload signal → SMC engine → branded verify view.
 *
 * M3: live OHLCV via fetchCandlesForEngine (Pyth primary, optional Birdeye
 * fallback). Pair from PairInput. Signal entry/SL/TPs still stubbed —
 * structured parser lands in M4.
 */
export function CaptureScreen() {
  const [pairText, setPairText] = useState("");
  const [resolvedPair, setResolvedPair] = useState<ResolvedPair | null>(null);
  const [signalText, setSignalText] = useState("");
  const [report, setReport] = useState<SignalVerificationReport | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const verifyDisabled =
    analyzing ||
    resolvedPair === null ||
    resolvedPair.pyth === null ||
    signalText.trim().length === 0;

  const verify = async () => {
    if (resolvedPair === null || resolvedPair.pyth === null) return;
    setAnalyzing(true);
    setErrorMsg(null);
    setReport(null);
    try {
      const candleData = await fetchCandlesForEngine({ pair: resolvedPair });
      const currentPrice = latestClose(candleData);
      if (currentPrice === null) {
        setErrorMsg("Couldn't compute current price — no candles returned.");
        return;
      }
      const stub: SignalInput = makeStubbedSignal(resolvedPair, currentPrice);
      const result = generateSignalVerification({
        signal: stub,
        candleData,
        currentPrice,
        accountBalance: 1000,
        riskRules: { maxRiskPct: 1.0, maxLeverage: 25 },
      });
      setReport(result);
    } catch (e) {
      setErrorMsg(toErrorMessage(e));
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <ScreenBackdrop>
      <View style={styles.topbar}>
        <WalletChip state="disconnected" />
        <NetBadge network="devnet" />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {report === null && (
          <>
            <Text style={styles.h1}>Capture</Text>
            <Text style={styles.subtitle}>
              Type a pair, paste a signal. SMC engine rates it against live Pyth data.
            </Text>

            <View style={styles.inputCard}>
              <PairInput value={pairText} onChangeText={setPairText} onResolve={setResolvedPair} />
              <View style={styles.spacer} />
              <Text style={styles.inputLabel}>Signal text</Text>
              <TextInput
                style={styles.input}
                multiline
                value={signalText}
                onChangeText={setSignalText}
                placeholder="$BTC LONG&#10;Entry: 67,500&#10;SL: 67,050&#10;TP1: 68,200"
                placeholderTextColor={`${colors.muted}80`}
              />
            </View>

            <UploadScreenshotButton onText={setSignalText} />

            {errorMsg !== null && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>Engine error</Text>
                <Text style={styles.errorBody}>{errorMsg}</Text>
              </View>
            )}

            <PrimaryCTA
              label={analyzing ? "Fetching candles…" : "Verify with SMC engine"}
              onPress={verify}
              loading={analyzing}
              disabled={verifyDisabled}
            />
          </>
        )}

        {report !== null && <ReportView report={report} onReset={() => setReport(null)} />}
      </ScrollView>
    </ScreenBackdrop>
  );
}

/** Stubbed signal — entry/SL/TPs derived from live price. M4 replaces with parser. */
function makeStubbedSignal(pair: ResolvedPair, currentPrice: number): SignalInput {
  return {
    pair: `${pair.base}${pair.quote}`,
    direction: "long",
    entry: currentPrice * 0.998,
    stopLoss: currentPrice * 0.985,
    takeProfits: [currentPrice * 1.012, currentPrice * 1.028, currentPrice * 1.05],
    leverage: 5,
  };
}

function toErrorMessage(e: unknown): string {
  if (e instanceof NoCandlesError) {
    return "Couldn't fetch data — Pyth failed and no Birdeye fallback configured. Add a Birdeye key in Settings to enable fallback.";
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

function ReportView({ report, onReset }: { report: SignalVerificationReport; onReset: () => void }) {
  const heroProps = toHeroProps(report);
  const rows = toDashboardRows(report);
  const chips = toFactorChips(report);
  const sizing = toSizingStats(report);
  const detailFactors = toDetailFactors(report);

  return (
    <View style={{ gap: space.md }}>
      <RatingHeroCard {...heroProps} />
      <MultiTimeframeDashboard rows={rows} pair={report.signal.pair} />
      <FactorChips chips={chips} />
      {sizing !== null && <SizingStrip {...sizing} />}
      <DetailsAccordion justification={report.scoring.justification} factors={detailFactors} />
      <PrimaryCTA label="Confirm trade →" onPress={() => { /* wired in M5/M6 */ }} />
      <PrimaryCTA label="Verify another signal" variant="secondary" onPress={onReset} />
    </View>
  );
}

// ─── Engine → component adapters (unchanged from prior visual-layer pass) ──

function toHeroProps(r: SignalVerificationReport) {
  const ltfAnalysis = r.timeframeAnalyses["1m"] ?? r.timeframeAnalyses["5m"] ?? null;
  const obHint = ltfAnalysis?.nearestOb?.isInside === true ? "OB" : null;
  const tag = obHint !== null ? `INSIDE · ${obHint}` : undefined;
  return {
    rating: r.scoring.rating,
    scorePct: r.scoring.score,
    verdict: r.scoring.justification,
    side: (r.signal.direction === "long" ? "LONG" : "SHORT") as "LONG" | "SHORT",
    sizeMult: r.scoring.scoreMultiplier,
    sessionTag: tag,
  };
}

function toDashboardRows(r: SignalVerificationReport): DashboardRow[] {
  return Object.entries(r.timeframeAnalyses).map(([tf, a]) => ({
    tf,
    struct: a.structure.bias,
    structStrong: a.structure.bias !== 0 && (a.structure.labels.length >= 2),
    ob: a.nearestOb?.direction ?? 0,
    fvg: a.nearestFvg?.direction ?? 0,
    ema: a.ema.direction,
  }));
}

function toFactorChips(r: SignalVerificationReport): FactorChip[] {
  const labels: Record<string, string> = {
    timeframe_alignment: "TF",
    entry_quality: "entry",
    structure: "struct",
    risk_reward_quality: "R:R",
    htf_trend: "HTF",
    swing_position: "swing",
    zone_confluence: "zone",
  };
  return Object.entries(r.scoring.factors).map(([name, f]) => {
    const score = Math.round(f.score * 100);
    const sev: FactorSeverity = score >= 75 ? "good" : score >= 50 ? "ok" : "bad";
    return { label: labels[name] ?? name, score, severity: sev };
  });
}

function toSizingStats(r: SignalVerificationReport) {
  const ps = r.positionSizing;
  if (ps === null) return null;
  return {
    size: ps.positionSize, risk: ps.riskAmount, riskPct: ps.riskPct, slPct: ps.slDistancePct,
  };
}

function toDetailFactors(r: SignalVerificationReport): DetailFactor[] {
  return Object.entries(r.scoring.factors).map(([name, f]) => ({
    name: name.replace(/_/g, " "),
    score: Math.round(f.score * 100),
    detail: f.detail,
  }));
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xs },
  body: { padding: space.md, paddingBottom: 80, gap: space.md },
  h1: { fontSize: 22, fontWeight: fontWeight.bold, color: colors.text, letterSpacing: -0.4 },
  subtitle: { color: colors.muted, fontSize: fontSize.sm, lineHeight: 18 },
  spacer: { height: space.md },
  inputCard: {
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, padding: space.md,
  },
  inputLabel: {
    fontSize: fontSize.xs - 1, color: colors.muted, letterSpacing: 1,
    textTransform: "uppercase", fontWeight: fontWeight.semibold, marginBottom: space.sm,
  },
  input: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: space.sm, minHeight: 110, color: colors.text,
    fontFamily: fonts.mono, fontSize: fontSize.sm, lineHeight: 18,
    textAlignVertical: "top",
  },
  errorBox: {
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.danger,
    backgroundColor: colors.dangerBg, padding: space.md,
  },
  errorTitle: { fontWeight: fontWeight.bold, color: colors.danger, marginBottom: 4 },
  errorBody: { color: colors.danger, fontFamily: fonts.mono, fontSize: fontSize.sm },
});
```

- [ ] **Step 2: Verify PrimaryCTA accepts `disabled`**

```bash
cd ~/lazytrader-app && grep -n "disabled" src/components/PrimaryCTA.tsx || echo "ADD DISABLED PROP"
```

If grep returns nothing, open `src/components/PrimaryCTA.tsx` and add an optional `disabled?: boolean` prop, plumb it to the underlying `Pressable`'s `disabled` and add a `0.4` opacity style when true. Keep the change minimal — one prop, one style branch.

- [ ] **Step 3: tsc check**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: `TSC=OK`.

- [ ] **Step 4: Engine fixtures still green**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10
```

Expected: all 27 SMC fixtures + all M3 unit tests still passing.

- [ ] **Step 5: Commit**

```bash
cd ~/lazytrader-app
git add src/screens/CaptureScreen.tsx src/components/PrimaryCTA.tsx 2>/dev/null
git diff --cached --stat
git commit -m "feat(capture): wire PairInput + live data feed

Replaces makeBtcDemo() with fetchCandlesForEngine(). PairInput row above
signal textarea, blur-validated against the Pyth catalog. Verify button
disabled until pair resolves AND signal text is non-empty. Stubbed
SignalInput (entry/SL/TPs derived from live price) until M4 ships the
parser. NoCandlesError surfaces a Settings nudge to add Birdeye key.

Engine call path identical — generateSignalVerification gets the same
shape, just with real candles and real currentPrice.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: Phone hot-reload verification + final sweep + cleanup

**Files:** none (verification only).

**Why:** All previous tasks went through tsc + vitest. T18 is the human-in-the-loop check that the live wire actually behaves on phone. Also the cleanup pass (per global feedback memory: "Clean Up After Yourself").

- [ ] **Step 1: Confirm Metro is running on Mac**

```bash
lsof -iTCP:8081 -sTCP:LISTEN | awk 'NR>1' || echo "METRO DOWN"
```

If down, restart from Task 3 Step 4.

- [ ] **Step 2: Reconnect phone if needed**

Get current connect port from phone's Wireless Debugging screen, then:

```bash
adb connect 100.84.228.67:<port>
adb devices  # should show "device", not "offline"
```

If "offline" — wake phone, retry. If still offline — re-pair (see `~/.claude/projects/-/memory/reference_lazytrader_phone_adb.md`).

- [ ] **Step 3: Open app + manual verification matrix**

Walk through these scenarios on phone (open `live.lazytrader`):

1. **No-key Pyth happy path (BTC)**:
   - Settings → confirm Birdeye fallback shows "○ Disabled"
   - Capture → Pair = "BTC", paste any plausible signal text → Verify
   - **Expected:** loading state ~1-3s → report renders with current BTC price visible in MTF dashboard. Cross-check rating against TradingView BTC at the same moment.

2. **Pair validation chip**:
   - Capture → Pair = "ZZZNOTREAL" → blur → red "Unsupported pair" chip
   - Verify button disabled

3. **No-key Pyth happy path (SOL)**:
   - Capture → Pair = "SOL" → Verify → report with live SOL price

4. **Birdeye key save flow**:
   - Settings → paste fake key (e.g. `test_invalid_key_123`) → Save → "Key invalid — not saved" status
   - Settings → paste real Birdeye key (Dexter has one or skip this step) → Save → "Saved · key valid"
   - Birdeye fallback badge → "● Enabled"

5. **Cache hit**:
   - Capture → verify SOL signal twice in quick succession → second one returns near-instantly

6. **Engine fixtures (sanity)**:
   ```bash
   cd ~/lazytrader-app && pnpm test 2>&1 | tail -5
   ```
   Expected: 27 SMC golden fixtures + all M3 tests still green.

- [ ] **Step 4: Final tsc + test sweep**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit && echo "TSC=OK" && pnpm test 2>&1 | tail -5
```

Expected: TSC=OK, all tests passing.

- [ ] **Step 5: Cleanup pass**

```bash
# Remove any stray APK from /tmp:
rm -f /tmp/lazytrader-dev.apk /tmp/lazytrader-*.apk
# Confirm no untracked junk in repo:
cd ~/lazytrader-app && git status --short
```

Expected: `git status --short` empty (all task commits in, no leftovers).

- [ ] **Step 6: Update session-resume memory**

Update `~/.claude/projects/-/memory/project_lazytrader_session_resume.md` with:
- New top commit SHA + summary of M3 commits
- Milestone state row: **M3 Live data feed** → ✅ done
- Phone state (last APK installed, Metro still running)
- Any unfinished items as explicit follow-ups

Commit-cadence reminder: never push without Dexter's explicit "push it". M3 is done locally; he'll decide when to push.

- [ ] **Step 7: Report back to user**

Summary template:

```
M3 done.
- 15 task commits, all green (tsc, 27 SMC fixtures, ~50 new vitest cases)
- Phone verified: BTC/SOL Pyth happy path, validation chip, cache reuse
- Birdeye flow: [tested with key | not yet — Dexter to paste real key]
- Working tree clean. Awaiting "push it" before pushing to origin.
```

---

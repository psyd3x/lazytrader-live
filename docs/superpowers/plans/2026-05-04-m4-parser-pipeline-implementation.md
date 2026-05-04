---
title: M4 Parser Pipeline Implementation Plan
description: Bite-sized task-by-task plan to ship the M4 parser — replaces M3's makeStubbedSignal with regex (5 templates) + cloud-LLM fallback (Claude Haiku OR OpenAI gpt-4o-mini, BYO key). 12 tasks covering schema, normalization helpers, regex templates, secureSettings extension, LLM adapters, pipeline orchestrator, ParsedSignalCard component, SettingsScreen + CaptureScreen wiring, and phone verification.
type: implementation-plan
project: lazytrader
phase: m4-parser
status: ready
date: 2026-05-04
created: 2026-05-04
tags: [plan, lazytrader, m4, parser, regex, llm, claude, openai, tdd]
---

# M4 Parser Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Related**: [[2026-05-04-m4-parser-pipeline-design]] · [[PRD]] · [[ARCHITECTURE]] · [[IMPLEMENTATION-PLAN]] · [[2026-05-03-m3-live-data-feed-design]]

**Spec**: `docs/superpowers/specs/2026-05-04-m4-parser-pipeline-design.md`

**Goal:** Replace M3's hardcoded `makeStubbedSignal` with a real two-tier parser (regex against 5 distinct templates, cloud-LLM fallback for novel formats). Pasted/OCR'd signal text → ParsedSignal → editable ParsedSignalCard → Verify.

**Architecture:** New `src/parser/{schema,normalize,regex,llm,claudeAdapter,openaiAdapter,pipeline}.ts` modules. New `src/components/ParsedSignalCard.tsx`. `src/storage/secureSettings.ts` extended with `llmProvider` + `claudeApiKey` + `openaiApiKey`. `SettingsScreen.tsx` adds AI Fallback card. `CaptureScreen.tsx` adds Parse button + state machine. Engine (`src/smc/*`) and data layer (`src/data/*`) unchanged.

**Tech Stack:** React Native 0.81 + Expo SDK 54, TypeScript strict, vitest for unit tests, `zod` for schema validation (NEW dep — JS-only, no native module, no EAS rebuild needed), `expo-secure-store` (already installed M3), `fetch` (built-in).

---

## Notes for the executor

**Engine integration facts (locked from M3 + spec investigation):**
- `SignalInput` shape (in `src/smc/models.ts:273`): `{ pair: string; direction: "long"|"short"; entry: number; stopLoss: number; takeProfits: number[]; leverage: number | null }`
- `ParsedSignal` extends `SignalInput`-compatible fields with display metadata (see Task 1)
- Engine call path in CaptureScreen unchanged: `generateSignalVerification({ signal, candleData, currentPrice, accountBalance, riskRules })` — only `signal` source changes (M3 stub → M4 parsed)
- Engine derives leverage internally from `riskRules.maxLeverage` + SL distance + maxRiskPct; signal.leverage is informational and may be ignored

**Testing approach:**
- TDD for `schema.ts`, `normalize.ts`, `regex.ts`, `pipeline.ts`, `claudeAdapter.ts`, `openaiAdapter.ts` — all logic-heavy, all node-testable
- Use `vi.stubGlobal("fetch", vi.fn())` to mock fetch in adapter tests (same pattern as M3 pyth/birdeye tests)
- Use `vi.mock("../regex")` and `vi.mock("../llm")` in pipeline tests
- NO new tests for UI components (ParsedSignalCard) — visual verification on phone in T12
- All 105 prior vitest cases must stay green
- `pnpm exec tsc --noEmit` must exit 0 after every commit

**Commit cadence:** one commit per task, conventional commits, trailer `Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>`. Never push without explicit user approval.

**No new native deps:** zod is pure JS. No EAS rebuild needed. Existing dev APK from M3 (installed 2026-05-04 01:11) works for the entire M4 cycle.

**Vitest config:** M3 already widened `vitest.config.ts` to glob `src/smc/**/*.test.ts` AND `src/data/**/*.test.ts`. Task 1 adds `src/parser/**/*.test.ts` to that include list (one-line edit).

**Reference snapshots (current state at start of M4):**
- main = `43e198b docs(m4): add parser pipeline design spec`
- 105/105 vitest cases green, tsc clean
- Working tree clean
- Phone has the M3 dev APK (live.lazytrader@1.0.0 with expo-secure-store linked)

---

## Task 1: ParsedSignal schema + Zod (TDD)

**Files:**
- Create: `src/parser/schema.ts`
- Create: `src/parser/__tests__/schema.test.ts`
- Modify: `vitest.config.ts` (add `src/parser/**/*.test.ts` to include glob)
- Modify: `package.json` + `pnpm-lock.yaml` (add `zod` dep via `pnpm add zod`)

**Why:** Single source of truth for the ParsedSignal shape. All later tasks (regex, LLM adapters, pipeline, ParsedSignalCard) import from here. Zod gives runtime validation for LLM responses on top of TS types.

- [ ] **Step 1: Install zod**

```bash
cd ~/lazytrader-app && pnpm add zod
```

Expected: zod added to dependencies. Pure-JS, no native module.

- [ ] **Step 2: Widen vitest.config.ts to include parser tests**

Open `vitest.config.ts`. Update the `include` array from:
```ts
include: ["src/smc/**/*.test.ts", "src/data/**/*.test.ts"],
```
to:
```ts
include: ["src/smc/**/*.test.ts", "src/data/**/*.test.ts", "src/parser/**/*.test.ts"],
```
Update the comment block at the top of the file accordingly.

- [ ] **Step 3: Write the failing tests**

Create `src/parser/__tests__/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ParsedSignalSchema } from "../schema";

const validBase = {
  pair: "BTCUSDT",
  direction: "long" as const,
  entry: 70000,
  stopLoss: 69000,
  takeProfits: [71000, 72000, 73000],
  leverage: 10,
  source: "regex" as const,
  rawText: "raw signal text here",
  multipleTrades: false,
  notes: null,
  entryRange: null,
};

describe("ParsedSignalSchema", () => {
  it("accepts a well-formed long signal", () => {
    expect(() => ParsedSignalSchema.parse(validBase)).not.toThrow();
  });
  it("accepts source = claude", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, source: "claude" })).not.toThrow();
  });
  it("accepts source = gpt-4o-mini", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, source: "gpt-4o-mini" })).not.toThrow();
  });
  it("accepts leverage = null", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, leverage: null })).not.toThrow();
  });
  it("accepts notes string", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, notes: "MARKET entry; SL-BE at TP1" })).not.toThrow();
  });
  it("accepts entryRange tuple", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, entryRange: [69900, 70100] })).not.toThrow();
  });
  it("accepts multipleTrades = true", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, multipleTrades: true })).not.toThrow();
  });
  it("rejects negative entry", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, entry: -1 })).toThrow();
  });
  it("rejects negative stopLoss", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, stopLoss: 0 })).toThrow();
  });
  it("rejects empty takeProfits", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, takeProfits: [] })).toThrow();
  });
  it("rejects more than 10 takeProfits", () => {
    expect(() =>
      ParsedSignalSchema.parse({ ...validBase, takeProfits: Array(11).fill(71000) }),
    ).toThrow();
  });
  it("rejects invalid direction", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, direction: "buy" })).toThrow();
  });
  it("rejects invalid source", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, source: "regex-v2" })).toThrow();
  });
  it("rejects pair too short", () => {
    expect(() => ParsedSignalSchema.parse({ ...validBase, pair: "B" })).toThrow();
  });
  it("rejects missing required field", () => {
    const { stopLoss: _omit, ...partial } = validBase;
    expect(() => ParsedSignalSchema.parse(partial)).toThrow();
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10
```

Expected: failure with `Cannot find module '../schema'`.

- [ ] **Step 5: Write the schema**

Create `src/parser/schema.ts`:

```ts
/**
 * ParsedSignal — single source of truth for the parser output shape.
 *
 * Extends SignalInput-compatible fields (consumed by the engine via
 * generateSignalVerification) with M4 display metadata that drives
 * ParsedSignalCard. Zod schema gives runtime validation for LLM responses
 * before they reach the UI.
 */

import { z } from "zod";

export const ParsedSignalSchema = z.object({
  // SignalInput-compatible fields:
  pair: z.string().min(2).max(20),
  direction: z.enum(["long", "short"]),
  entry: z.number().positive(),
  stopLoss: z.number().positive(),
  takeProfits: z.array(z.number().positive()).min(1).max(10),
  leverage: z.number().positive().nullable(),

  // M4 display metadata:
  source: z.enum(["regex", "claude", "gpt-4o-mini"]),
  rawText: z.string(),
  multipleTrades: z.boolean(),
  notes: z.string().nullable(),
  entryRange: z.tuple([z.number(), z.number()]).nullable(),
});

export type ParsedSignal = z.infer<typeof ParsedSignalSchema>;
```

- [ ] **Step 6: Run tests + tsc**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10 && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: 105 + 15 = 120 tests passing, TSC=OK.

- [ ] **Step 7: Commit**

```bash
cd ~/lazytrader-app
git add src/parser/schema.ts src/parser/__tests__/schema.test.ts vitest.config.ts package.json pnpm-lock.yaml
git diff --cached --stat
git commit -m "feat(parser): add ParsedSignal Zod schema + types

Single source of truth for the parser output shape. Extends
SignalInput-compatible fields (pair, direction, entry, stopLoss,
takeProfits, leverage) with M4 display metadata (source, rawText,
multipleTrades, notes, entryRange).

Zod validates at runtime — used to gate LLM responses before they
reach the UI. Pure-JS dep, no EAS rebuild needed.

Vitest config widened to include src/parser/**/*.test.ts.

15 vitest cases cover accept/reject paths.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Normalization helpers (TDD)

**Files:**
- Create: `src/parser/normalize.ts`
- Create: `src/parser/__tests__/normalize.test.ts`

**Why:** Pure-function helpers used by both regex.ts and (defensively) by pipeline.ts on LLM output. Centralizes range-collapse rules so all parser code agrees on midpoint/closer-to-entry semantics.

- [ ] **Step 1: Write the failing tests**

Create `src/parser/__tests__/normalize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  closerToEntry,
  expandPair,
  inferDirection,
  midpoint,
  parseDollarsAmount,
} from "../normalize";

describe("parseDollarsAmount", () => {
  it("parses bare integer", () => {
    expect(parseDollarsAmount("1234")).toBe(1234);
  });
  it("strips $ prefix", () => {
    expect(parseDollarsAmount("$1234")).toBe(1234);
  });
  it("strips comma thousands separators", () => {
    expect(parseDollarsAmount("$71,600")).toBe(71600);
  });
  it("parses decimal with $", () => {
    expect(parseDollarsAmount("$0.0001")).toBe(0.0001);
  });
  it("trims whitespace", () => {
    expect(parseDollarsAmount("  $42.5  ")).toBe(42.5);
  });
  it("returns null on garbage", () => {
    expect(parseDollarsAmount("not a number")).toBeNull();
  });
  it("returns null on empty", () => {
    expect(parseDollarsAmount("")).toBeNull();
  });
});

describe("inferDirection", () => {
  it("returns long when SL below entry", () => {
    expect(inferDirection({ entry: 100, stopLoss: 99 })).toBe("long");
  });
  it("returns short when SL above entry", () => {
    expect(inferDirection({ entry: 100, stopLoss: 101 })).toBe("short");
  });
  it("throws when SL equals entry", () => {
    expect(() => inferDirection({ entry: 100, stopLoss: 100 })).toThrow();
  });
});

describe("expandPair", () => {
  it("appends USDT when no quote given", () => {
    expect(expandPair("BTC")).toBe("BTCUSDT");
  });
  it("uppercases the base", () => {
    expect(expandPair("btc")).toBe("BTCUSDT");
  });
  it("uses provided quote", () => {
    expect(expandPair("BTC", "USD")).toBe("BTCUSD");
  });
  it("trims whitespace", () => {
    expect(expandPair("  BTC  ")).toBe("BTCUSDT");
  });
});

describe("midpoint", () => {
  it("computes (a+b)/2", () => {
    expect(midpoint(10, 20)).toBe(15);
  });
  it("works for floats", () => {
    expect(midpoint(0.9966, 0.9941)).toBeCloseTo(0.99535, 5);
  });
  it("works regardless of order", () => {
    expect(midpoint(20, 10)).toBe(15);
  });
});

describe("closerToEntry", () => {
  // Long side
  it("long SL: picks higher of {low, high} (closer to entry from below)", () => {
    // entry 100, SL range 95-99 → closer to entry = 99
    expect(closerToEntry(95, 99, 100, "long", "sl")).toBe(99);
  });
  it("long TP: picks lower of {low, high} (closer to entry from above)", () => {
    // entry 100, TP range 110-115 → closer to entry = 110
    expect(closerToEntry(110, 115, 100, "long", "tp")).toBe(110);
  });
  // Short side
  it("short SL: picks lower of {low, high} (closer to entry from above)", () => {
    // entry 100, SL range 101-105 → closer to entry = 101
    expect(closerToEntry(101, 105, 100, "short", "sl")).toBe(101);
  });
  it("short TP: picks higher of {low, high} (closer to entry from below)", () => {
    // entry 100, TP range 90-95 → closer to entry = 95
    expect(closerToEntry(90, 95, 100, "short", "tp")).toBe(95);
  });
  it("works regardless of input order", () => {
    expect(closerToEntry(99, 95, 100, "long", "sl")).toBe(99);
    expect(closerToEntry(115, 110, 100, "long", "tp")).toBe(110);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10
```

Expected: failure with `Cannot find module '../normalize'`.

- [ ] **Step 3: Write the helpers**

Create `src/parser/normalize.ts`:

```ts
/**
 * Pure helpers shared across parser modules. Range-collapse rules,
 * direction inference, dollar-amount parsing, pair expansion.
 */

/** Strip $, commas, whitespace; parseFloat. Returns null on failure. */
export function parseDollarsAmount(s: string): number | null {
  if (!s) return null;
  const cleaned = s.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** SL < entry → "long"; SL > entry → "short". Throws if equal. */
export function inferDirection(opts: { entry: number; stopLoss: number }): "long" | "short" {
  if (opts.stopLoss === opts.entry) {
    throw new Error("inferDirection: stopLoss equals entry — cannot infer side");
  }
  return opts.stopLoss < opts.entry ? "long" : "short";
}

/** Append "USDT" if no quote; uppercase + trim. */
export function expandPair(base: string, quote?: string): string {
  return base.trim().toUpperCase() + (quote?.toUpperCase() ?? "USDT");
}

/** (a + b) / 2. */
export function midpoint(a: number, b: number): number {
  return (a + b) / 2;
}

/**
 * Pick the bound of a range that's CLOSER to entry.
 *
 * For SL: closer = tighter stop, less drawdown tolerance.
 * For TP: closer = lock profit early, more conservative.
 *
 * Long side: SL is below entry, TP is above → closer-to-entry SL is the higher bound,
 *   closer-to-entry TP is the lower bound.
 * Short side: SL is above entry, TP is below → mirrored.
 */
export function closerToEntry(
  low: number,
  high: number,
  entry: number,
  side: "long" | "short",
  kind: "sl" | "tp",
): number {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  if (side === "long" && kind === "sl") return hi;     // SL below entry, closer = higher
  if (side === "long" && kind === "tp") return lo;     // TP above entry, closer = lower
  if (side === "short" && kind === "sl") return lo;    // SL above entry, closer = lower
  return hi;                                            // short tp: TP below entry, closer = higher
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10 && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: 120 + 22 = 142 tests passing, TSC=OK.

- [ ] **Step 5: Commit**

```bash
cd ~/lazytrader-app
git add src/parser/normalize.ts src/parser/__tests__/normalize.test.ts
git commit -m "feat(parser): add normalization helpers

Pure functions shared across parser modules: parseDollarsAmount
(strip \$ + commas), inferDirection (SL-vs-entry), expandPair
(append USDT default), midpoint, closerToEntry (range-collapse rule
for SL/TP per long/short side, per spec §8.7).

22 vitest cases.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Regex templates + 18-fixture replay (TDD)

**Files:**
- Create: `src/parser/regex.ts`
- Create: `src/parser/__tests__/__fixtures__/rawSignals.ts` (18 verbatim signals + expected outputs)
- Create: `src/parser/__tests__/regex.test.ts`

**Why:** Hot path of the parser. Five templates A-E cover 15 of 18 collected fixtures (~83%). Three fixtures (#6, #7, #11) are LLM-only — they fall through; test asserts they DO fall through. Fixtures double as the LLM ground-truth set for T8.

- [ ] **Step 1: Create the fixtures file**

Create `src/parser/__tests__/__fixtures__/rawSignals.ts`:

```ts
/**
 * 18 unique trade signals collected from real Telegram channels during M4
 * brainstorming (2026-05-04). 15 should parse via regex templates A-E;
 * 3 (#6, #7, #11) are LLM-only edge cases.
 *
 * Each entry: { id, rawText, regexShouldHit, expectedTemplate, parsed }
 * - parsed is the field-level expected output (for both regex and LLM ground truth)
 * - regexShouldHit indicates whether the 5-template regex pass should fill all
 *   required fields; LLM-only entries set this false
 */

export interface RawSignalFixture {
  id: string;
  rawText: string;
  regexShouldHit: boolean;
  expectedTemplate: "A" | "B" | "C" | "D" | "E" | null;
  parsed: {
    pair: string;
    direction: "long" | "short";
    entry: number;
    stopLoss: number;
    takeProfits: number[];
    leverage: number | null;
    multipleTrades: boolean;
  };
}

export const RAW_SIGNALS: RawSignalFixture[] = [
  // ─── Template A — Sheldon narrative ─────────────────────────
  {
    id: "1-doge-sheldon-1d",
    rawText: `Chart #2 – Dogecoin (DOGEUSDT) 1-Day
Chartist: Sheldon

Chart for DOGE
(For the chart screenshot, click here)

The price of DOGE has been very bullish over the last week, and I am looking for the price to break the overhead resistance, where I will then enter a long spot trade.

Trade Levels:

Entry: Enter a long spot trade at the break and retest of the $0.103 level.

Stop Loss: Just below $0.095

Take Profit Levels (TP):

TP1: $0.12 - $0.125 (17% - 21%)

TP2: $0.135 - $0.155 (31% - 50%)`,
    regexShouldHit: true,
    expectedTemplate: "A",
    parsed: {
      pair: "DOGEUSDT",
      direction: "long",
      entry: 0.103,
      stopLoss: 0.095,
      takeProfits: [0.12, 0.135], // closerToEntry of each range (long → lower bound)
      leverage: null,
      multipleTrades: false,
    },
  },
  {
    id: "4-algo-sheldon-1d",
    rawText: `Chart #4 – Algorand (ALGOUSDT) 1-Day
Chartist: Sheldon

Chart for ALGO
(For the chart screenshot, click here)

Over the last 3 days, the price of ALGO has been in a retrace, and it is getting close to the next major level of support, where I will be looking at entering a long spot trade.

Trade Levels:

Entry: Enter a long spot trade at around $0.11

Stop Loss: Just below $0.103

Take Profit Levels (TP):

TP1: $0.126 - $0.147 (15% - 34%)

TP2: $0.175 - $0.20 (59% - 82%)`,
    regexShouldHit: true,
    expectedTemplate: "A",
    parsed: {
      pair: "ALGOUSDT",
      direction: "long",
      entry: 0.11,
      stopLoss: 0.103,
      takeProfits: [0.126, 0.175],
      leverage: null,
      multipleTrades: false,
    },
  },
  {
    id: "16-coin-sheldon-1d",
    rawText: `Chart #5 – Coinbase (COIN) 1-Day
Chartist: Sheldon

Chart for COIN
(For the chart screenshot, click here)

(COIN refers to the stock of Coinbase and not a cryptocurrency.)

I am keeping a close eye on the price of Coinbase going into tonight's FOMC meeting, as I do think there is a possibility of another move up in the price of BTC that could lift the rest of the Crypto Market, and also Coinbase.

Trade Levels:

Entry: Enter a long spot trade at the current $192 level of support.

Stop Loss: Just below $175

Take Profit Levels (TP):

TP1: $224 - $260 (17% - 35%)

TP2: $290 - $340 (51% - 77%)`,
    regexShouldHit: true,
    expectedTemplate: "A",
    parsed: {
      pair: "COIN", // stock — engine's resolveToPythFeed will reject as unsupported, that's correct behavior
      direction: "long",
      entry: 192,
      stopLoss: 175,
      takeProfits: [224, 290],
      leverage: null,
      multipleTrades: false,
    },
  },

  // ─── Template B — emoji USDT bot ──────────────────────────
  {
    id: "2-apt-emoji",
    rawText: `Pairs:  APT/USDT

 👉 Trade Type = LONG 🟢

 👉 Leverage :- 20x

⚡️ Entry = [ 0.9966 TO 0.9941 ]

❌ StopLoss :- 0.9626

✅ Take profit = [ 1.0131, 1.0234, 1.0346, 1.0524, 1.0631, 1.0837`,
    regexShouldHit: true,
    expectedTemplate: "B",
    parsed: {
      pair: "APTUSDT",
      direction: "long",
      entry: 0.99535, // midpoint
      stopLoss: 0.9626,
      takeProfits: [1.0131, 1.0234, 1.0346, 1.0524, 1.0631, 1.0837],
      leverage: 20,
      multipleTrades: false,
    },
  },
  {
    id: "3-avax-emoji",
    rawText: `Pairs:  AVAX/USDT

 👉 Trade Type = LONG 🟢

 👉 Leverage :- 20x

⚡️ Entry = [ 9.172 TO 9.149 ]

❌ StopLoss :- 8.876

✅ Take profit = [ 9.320, 9.433, 9.536, 9.663, 9.812, 9.974 ]`,
    regexShouldHit: true,
    expectedTemplate: "B",
    parsed: {
      pair: "AVAXUSDT",
      direction: "long",
      entry: 9.1605,
      stopLoss: 8.876,
      takeProfits: [9.32, 9.433, 9.536, 9.663, 9.812, 9.974],
      leverage: 20,
      multipleTrades: false,
    },
  },
  {
    id: "15-trx-emoji",
    rawText: `Pairs:  TRX/USDT

 👉 Trade Type = LONG 🟢

 👉 Leverage :- 20x

⚡️ Entry = [ 0.3252 TO 0.3244 ]

❌ StopLoss :- 0.3131

✅ Take profit = [ 0.3305, 0.3337, 0.3383, 0.3417, 0.3483, 0.3513 ]`,
    regexShouldHit: true,
    expectedTemplate: "B",
    parsed: {
      pair: "TRXUSDT",
      direction: "long",
      entry: 0.3248,
      stopLoss: 0.3131,
      takeProfits: [0.3305, 0.3337, 0.3383, 0.3417, 0.3483, 0.3513],
      leverage: 20,
      multipleTrades: false,
    },
  },

  // ─── Template C — Nasdaq75 Blofin ──────────────────────────
  {
    id: "5-eth-nasdaq75",
    rawText: `Nasdaq75 [Prime] [CHPR], Role icon, Technical Analyst — 4/29/26, 8:14 AM
#ETH (Blofin) @Crypto Signal
SHORT: 5-10x
ENTRY: 2370-2325
EXIT: 2317/2307/2290/2270/2230/2150
SL: 2410
THIS IS A SHORT-TERM TRADE 
@Crypto Signal`,
    regexShouldHit: true,
    expectedTemplate: "C",
    parsed: {
      pair: "ETHUSDT",
      direction: "short",
      entry: 2347.5, // midpoint
      stopLoss: 2410,
      takeProfits: [2317, 2307, 2290, 2270, 2230, 2150],
      leverage: 8, // Math.round(midpoint(5, 10)) = Math.round(7.5) = 8
      multipleTrades: false,
    },
  },
  {
    id: "12-lit-nasdaq75",
    rawText: `Nasdaq75 [Prime] [CHPR], Role icon, Technical Analyst — 4/15/26, 9:18 PM
#LIT (Blofin) @Crypto Signal
SHORT: 5-10x
ENTRY: 1.0850-1.0560
EXIT: 1.0510/1.0440/1.0370/1.0270/1.00/0.97
SL: 1.10
THIS IS A SHORT-TERM TRADE`,
    regexShouldHit: true,
    expectedTemplate: "C",
    parsed: {
      pair: "LITUSDT",
      direction: "short",
      entry: 1.0705,
      stopLoss: 1.1,
      takeProfits: [1.051, 1.044, 1.037, 1.027, 1.0, 0.97],
      leverage: 8,
      multipleTrades: false,
    },
  },
  {
    id: "13-zen-nasdaq75-a",
    rawText: `Nasdaq75 [Prime] [CHPR], Role icon, Technical Analyst — 4/14/26, 11:02 PM
#ZEN (Blofin) @Crypto Signal
SHORT: 5-10x
ENTRY: 5.80-5.64
EXIT: 5.62/5.60/5.56/5.48/5.36/5.20
SL: 5.88
THIS IS A SHORT-TERM TRADE`,
    regexShouldHit: true,
    expectedTemplate: "C",
    parsed: {
      pair: "ZENUSDT",
      direction: "short",
      entry: 5.72,
      stopLoss: 5.88,
      takeProfits: [5.62, 5.6, 5.56, 5.48, 5.36, 5.2],
      leverage: 8,
      multipleTrades: false,
    },
  },
  {
    id: "14-zen-nasdaq75-b",
    rawText: `Nasdaq75 [Prime] [CHPR], Role icon, Technical Analyst — 4/27/26, 11:33 PM
#ZEN (Blofin) @Free Crypto Signals
SHORT: 5-10x
ENTRY: 6.02-5.94
EXIT: 5.92/5.89/5.85/5.80/5.72/5.64
SL: 6.10
THIS IS A SHORT-TERM TRADE`,
    regexShouldHit: true,
    expectedTemplate: "C",
    parsed: {
      pair: "ZENUSDT",
      direction: "short",
      entry: 5.98,
      stopLoss: 6.1,
      takeProfits: [5.92, 5.89, 5.85, 5.8, 5.72, 5.64],
      leverage: 8,
      multipleTrades: false,
    },
  },

  // ─── Template D — Langestrom ────────────────────────────────
  {
    id: "8-pengu-langestrom",
    rawText: `Type: LONG
Asset: PENGU
Entry Price: $0.008410 - MARKET
Stop Loss: $0.007960
First TP & SL-BE: $0.008661
Final Take Profit: $0.010107
Recommended Leverage: 30-50x`,
    regexShouldHit: true,
    expectedTemplate: "D",
    parsed: {
      pair: "PENGUUSDT",
      direction: "long",
      entry: 0.00841,
      stopLoss: 0.00796,
      takeProfits: [0.008661, 0.010107],
      leverage: 40, // midpoint of 30-50
      multipleTrades: false,
    },
  },
  {
    id: "9-ordi-langestrom",
    rawText: `Langestrom [Prime] [CHPR], Role icon, Technical Analyst — 4/16/26, 3:59 PM
LANGESTROM SWING CALL

Type: SHORT
Asset: ORDI
Entry Price: $8.551
Stop Loss: $9.447
First TP & SL-BE: $7.5
Final Take Profit: $5.842
Recommended Leverage: 20x`,
    regexShouldHit: true,
    expectedTemplate: "D",
    parsed: {
      pair: "ORDIUSDT",
      direction: "short",
      entry: 8.551,
      stopLoss: 9.447,
      takeProfits: [7.5, 5.842],
      leverage: 20,
      multipleTrades: false,
    },
  },
  {
    id: "10-rave-langestrom",
    rawText: `LANGESTROM SCALP CALL

Type: SHORT
Asset: RAVE
Entry Price: $14.353
Stop Loss: $16.88
First TP & SL-BE: $12.74
Final Take Profit: $8.1
Recommended Leverage: 10-15x`,
    regexShouldHit: true,
    expectedTemplate: "D",
    parsed: {
      pair: "RAVEUSDT",
      direction: "short",
      entry: 14.353,
      stopLoss: 16.88,
      takeProfits: [12.74, 8.1],
      leverage: 13, // midpoint of 10-15, rounded
      multipleTrades: false,
    },
  },

  // ─── Template E — Kapoor clean ──────────────────────────────
  {
    id: "17-aave-kapoor-8h",
    rawText: `Chart #1 – Aave (AAVEUSDT) 8-Hour
Chartist: Kapoor

Chart for AAVE
(For the chart screenshot, click here)

Aave is showing strength after taking support from \$90. If it reclaims \$98, continuation toward the next resistance is likely.

Trade Levels:

Entry: \$98.7

Stop Loss: \$95.73

Take Profit Levels (TP):

TP1: \$105.8

TP2: \$114.02`,
    regexShouldHit: true,
    expectedTemplate: "E",
    parsed: {
      pair: "AAVEUSDT",
      direction: "long", // inferred from SL < entry
      entry: 98.7,
      stopLoss: 95.73,
      takeProfits: [105.8, 114.02],
      leverage: null,
      multipleTrades: false,
    },
  },
  {
    id: "18-btc-kapoor-8h",
    rawText: `Chart #2 – Bitcoin (BTCUSDT) 8-Hour
Chartist: Kapoor

Chart for BTC
With Trump speaking today at 1PM ET, we are facing a key trigger event. Any de-escalation tone could push BTC through resistance, in which case I am looking for a breakout and retest for entry.

Trade Levels:

Entry: \$71,600

Stop Loss: \$70,200

Take Profit Levels (TP):

TP1: \$73,900

TP2: \$76,100`,
    regexShouldHit: true,
    expectedTemplate: "E",
    parsed: {
      pair: "BTCUSDT",
      direction: "long",
      entry: 71600,
      stopLoss: 70200,
      takeProfits: [73900, 76100],
      leverage: null,
      multipleTrades: false,
    },
  },

  // ─── LLM-only edge cases ───────────────────────────────────
  {
    id: "6-btc-prime-charter-limit",
    rawText: `Prime Charter [Rúnír] [CHPR], Role icon, Technical Analyst — 4/19/26, 5:54 AM
BTCUSDT.P – LIMIT ORDER | BUY https://www.tradingview.com/x/YKSCC3lg/
Bitunix Price Data

Entry range 73,715 – 74,470

Potential wick entry: 72,390 ⚡ 
→ Acts as invalidation / de-risk level
→ If 4H closes below, reduce or close — don't wait for full SL

🛡️ Stop Loss
70,500

🏁 Target
 80,050 - 80,280`,
    regexShouldHit: false,
    expectedTemplate: null,
    parsed: {
      pair: "BTCUSDT",
      direction: "long",
      entry: 74092.5, // midpoint
      stopLoss: 70500,
      takeProfits: [80050],
      leverage: null,
      multipleTrades: false,
    },
  },
  {
    id: "7-btc-multi-trade",
    rawText: `Prime Charter [Rúnír] [CHPR], Role icon, Technical Analyst — 4/18/26, 10:32 PM
⁠🚨｜crypto-signals⁠

Found one of my old crypto signals from Mar 16 — looks like unfinished business on BTC.

I'm taking a wild shot here.

SELL zone - 80,050 – 80,250 🔻 
Wick entry around 80,321 (HTF wicks for me) https://www.tradingview.com/x/aYDceDcG/
@Crypto Signal 
SL will depend on your risk. Different styles here — some may wait for price to tap the level first before confirming and executing (scalp / intraday / swing).

Trade ideas 

• Sell 80,276
SL: 81,276 (-1,000)
TP: 50,276 (+30,000)
~1:30 RR (take profits along the way)

• Sell 80,050
SL: 80,350
TP: 74,350 (~1:19 RR)

• Sell 80,250
SL: 80,350
TP: 79,350 (~1:9 RR)
I know most of you think I'm always bearish.`,
    regexShouldHit: false,
    expectedTemplate: null,
    parsed: {
      pair: "BTCUSDT",
      direction: "short",
      entry: 80276, // first trade
      stopLoss: 81276,
      takeProfits: [50276],
      leverage: null,
      multipleTrades: true,
    },
  },
  {
    id: "11-hype-prime-charter",
    rawText: `Prime Charter [Rúnír] [CHPR], Role icon, Technical Analyst — 4/21/26, 8:41 AM
HYPEUSDT.P - Bitunix Price data https://www.tradingview.com/x/uDaEAK5l/ 
High probability Sell
41.930 - 42.106

IF you have deep pocket and can endure the SL 42.9, you can sell now

Final Target (Swing) - 34.45 - You can hold for lower targets  @Crypto Signal`,
    regexShouldHit: false,
    expectedTemplate: null,
    parsed: {
      pair: "HYPEUSDT",
      direction: "short",
      entry: 42.018, // midpoint
      stopLoss: 42.9,
      takeProfits: [34.45],
      leverage: null,
      multipleTrades: false,
    },
  },
];
```

- [ ] **Step 2: Write the failing tests**

Create `src/parser/__tests__/regex.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseWithRegex, type RegexResult } from "../regex";
import { RAW_SIGNALS } from "./__fixtures__/rawSignals";

describe("parseWithRegex (per-fixture replay)", () => {
  for (const fixture of RAW_SIGNALS) {
    if (fixture.regexShouldHit) {
      it(`${fixture.id} → template ${fixture.expectedTemplate}, fields match`, () => {
        const result = parseWithRegex(fixture.rawText);
        expect(result.complete).toBe(true);
        expect(result.template).toBe(fixture.expectedTemplate);
        expect(result.fields.pair).toBe(fixture.parsed.pair);
        expect(result.fields.direction).toBe(fixture.parsed.direction);
        expect(result.fields.entry).toBeCloseTo(fixture.parsed.entry, 5);
        expect(result.fields.stopLoss).toBeCloseTo(fixture.parsed.stopLoss, 5);
        expect(result.fields.takeProfits).toHaveLength(fixture.parsed.takeProfits.length);
        for (let i = 0; i < fixture.parsed.takeProfits.length; i++) {
          expect(result.fields.takeProfits![i]).toBeCloseTo(fixture.parsed.takeProfits[i], 5);
        }
        expect(result.fields.leverage).toBe(fixture.parsed.leverage);
      });
    } else {
      it(`${fixture.id} → regex falls through (LLM-only edge case)`, () => {
        const result = parseWithRegex(fixture.rawText);
        expect(result.complete).toBe(false);
      });
    }
  }
});

describe("parseWithRegex (degenerate inputs)", () => {
  it("returns incomplete on empty string", () => {
    const r = parseWithRegex("");
    expect(r.complete).toBe(false);
    expect(r.template).toBeNull();
  });
  it("returns incomplete on garbage", () => {
    const r = parseWithRegex("not a signal at all just random text");
    expect(r.complete).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10
```

Expected: failure with `Cannot find module '../regex'`.

- [ ] **Step 4: Write the regex module**

Create `src/parser/regex.ts`:

```ts
/**
 * Per-template regex extractors. Five templates A-E cover 15 of 18 collected
 * signal fixtures (~83%). Each template has a discriminator regex that gates
 * the per-field extraction. Order of attempt: E → A → B → C → D.
 *
 * Templates from spec §8:
 *   A — Sheldon narrative (Chart #N + Chartist: Sheldon + fuzzy phrasing)
 *   B — Emoji USDT bot (Pairs:/Trade Type/Leverage/Entry [X TO Y]/StopLoss/Take profit)
 *   C — Nasdaq75 Blofin (#TICKER (Blofin) + SHORT|LONG: Nx + ENTRY:range + EXIT:slash + SL)
 *   D — Langestrom (Type:/Asset:/Entry Price:/Stop Loss:/First TP & SL-BE:/Final Take Profit:)
 *   E — Kapoor clean (Chart #N + Chartist: Kapoor + Trade Levels: + clean numerics)
 */

import {
  closerToEntry,
  expandPair,
  inferDirection,
  midpoint,
  parseDollarsAmount,
} from "./normalize";

export type TemplateId = "A" | "B" | "C" | "D" | "E";

export interface RegexFields {
  pair?: string;
  direction?: "long" | "short";
  entry?: number;
  stopLoss?: number;
  takeProfits?: number[];
  leverage?: number | null;
  notes?: string | null;
  entryRange?: [number, number] | null;
}

export interface RegexResult {
  template: TemplateId | null;
  fields: RegexFields;
  complete: boolean; // all 5 required fields filled
}

const REQUIRED: (keyof RegexFields)[] = ["pair", "direction", "entry", "stopLoss", "takeProfits"];

function isComplete(fields: RegexFields): boolean {
  for (const k of REQUIRED) {
    const v = fields[k];
    if (v === undefined || v === null) return false;
    if (k === "takeProfits" && (v as number[]).length === 0) return false;
  }
  return true;
}

// ─── Template E — Kapoor clean (tried first; cheapest discriminator) ────
function tryKapoor(raw: string): RegexFields | null {
  if (!/Chartist:\s*Kapoor/i.test(raw)) return null;
  const pairMatch = raw.match(/Chart\s*#\d+\s*[–-]\s*[A-Za-z]+\s*\(([A-Z0-9]+)\)/);
  const entryMatch = raw.match(/Entry:\s*\$?([\d,]+\.?\d*)/);
  const slMatch = raw.match(/Stop\s*Loss:\s*\$?([\d,]+\.?\d*)/);
  const tpMatches = [...raw.matchAll(/TP\d+:\s*\$?([\d,]+\.?\d*)/g)];
  if (!pairMatch || !entryMatch || !slMatch || tpMatches.length === 0) return null;
  const entry = parseDollarsAmount(entryMatch[1]);
  const stopLoss = parseDollarsAmount(slMatch[1]);
  if (entry === null || stopLoss === null) return null;
  const takeProfits = tpMatches
    .map((m) => parseDollarsAmount(m[1]))
    .filter((n): n is number => n !== null);
  if (takeProfits.length === 0) return null;
  let direction: "long" | "short";
  try {
    direction = inferDirection({ entry, stopLoss });
  } catch {
    return null;
  }
  return { pair: pairMatch[1], direction, entry, stopLoss, takeProfits, leverage: null };
}

// ─── Template A — Sheldon narrative ──────────────────────────────────
function trySheldon(raw: string): RegexFields | null {
  if (!/Chartist:\s*Sheldon/i.test(raw)) return null;
  const pairMatch = raw.match(/Chart\s*#\d+\s*[–-]\s*[A-Za-z]+\s*\(([A-Z0-9]+)\)/);
  if (!pairMatch) return null;
  const dirMatch = raw.match(/(long|short)\s+spot\s+trade/i);
  if (!dirMatch) return null;
  const direction = dirMatch[1].toLowerCase() as "long" | "short";

  // Entry: extract first $-amount on the "Entry:" line
  const entryLineMatch = raw.match(/Entry:\s*([^\n]+)/);
  if (!entryLineMatch) return null;
  const entryDollarMatch = entryLineMatch[1].match(/\$?([\d,]+\.?\d*)/);
  if (!entryDollarMatch) return null;
  const entry = parseDollarsAmount(entryDollarMatch[1]);
  if (entry === null) return null;

  // Stop loss: extract first $-amount on the "Stop Loss:" line
  const slLineMatch = raw.match(/Stop\s*Loss:\s*([^\n]+)/);
  if (!slLineMatch) return null;
  const slDollarMatch = slLineMatch[1].match(/\$?([\d,]+\.?\d*)/);
  if (!slDollarMatch) return null;
  const stopLoss = parseDollarsAmount(slDollarMatch[1]);
  if (stopLoss === null) return null;

  // TPs: TP\d+: $A - $B (X% - Y%) — capture both bounds, apply closerToEntry
  const tpRegex = /TP\d+:\s*\$?([\d,.]+)(?:\s*[-–]\s*\$?([\d,.]+))?(?:\s*\([^)]*\))?/g;
  const tpMatches = [...raw.matchAll(tpRegex)];
  if (tpMatches.length === 0) return null;
  const takeProfits: number[] = [];
  for (const m of tpMatches) {
    const lo = parseDollarsAmount(m[1]);
    if (lo === null) continue;
    if (m[2]) {
      const hi = parseDollarsAmount(m[2]);
      if (hi !== null) {
        takeProfits.push(closerToEntry(lo, hi, entry, direction, "tp"));
        continue;
      }
    }
    takeProfits.push(lo);
  }
  if (takeProfits.length === 0) return null;
  return { pair: pairMatch[1], direction, entry, stopLoss, takeProfits, leverage: null };
}

// ─── Template B — emoji USDT bot ─────────────────────────────────────
function tryEmojiUsdt(raw: string): RegexFields | null {
  const pairMatch = raw.match(/Pairs?:\s*([A-Z]+)\s*\/\s*([A-Z]+)/);
  const dirMatch = raw.match(/Trade\s*Type\s*=\s*(LONG|SHORT)/i);
  const entryRangeMatch = raw.match(/Entry\s*=\s*\[\s*([\d.]+)\s*TO\s*([\d.]+)\s*\]/i);
  const slMatch = raw.match(/StopLoss\s*:?-?\s*([\d.]+)/i);
  const tpBlockMatch = raw.match(/Take\s*profit\s*=\s*\[([^\]]+)\]?/i);
  if (!pairMatch || !dirMatch || !entryRangeMatch || !slMatch || !tpBlockMatch) return null;
  const lev = raw.match(/Leverage\s*:?-?\s*(\d+)x/i);
  const lo = parseFloat(entryRangeMatch[1]);
  const hi = parseFloat(entryRangeMatch[2]);
  const stopLoss = parseFloat(slMatch[1]);
  const takeProfits = tpBlockMatch[1]
    .split(",")
    .map((s) => parseFloat(s.trim()))
    .filter((n) => Number.isFinite(n));
  if (takeProfits.length === 0) return null;
  return {
    pair: expandPair(pairMatch[1], pairMatch[2]),
    direction: dirMatch[1].toLowerCase() as "long" | "short",
    entry: midpoint(lo, hi),
    stopLoss,
    takeProfits,
    leverage: lev ? parseInt(lev[1], 10) : null,
  };
}

// ─── Template C — Nasdaq75 Blofin ────────────────────────────────────
function tryNasdaq75(raw: string): RegexFields | null {
  const pairMatch = raw.match(/#([A-Z]+)\s*\(Blofin\)/i);
  const dirLevMatch = raw.match(/(SHORT|LONG):\s*(\d+)(?:-(\d+))?x/i);
  const entryRangeMatch = raw.match(/ENTRY:\s*([\d.]+)\s*[-–]\s*([\d.]+)/i);
  const exitListMatch = raw.match(/EXIT:\s*([\d./]+)/i);
  const slMatch = raw.match(/SL:\s*([\d.]+)/i);
  if (!pairMatch || !dirLevMatch || !entryRangeMatch || !exitListMatch || !slMatch) return null;
  const lo = parseFloat(entryRangeMatch[1]);
  const hi = parseFloat(entryRangeMatch[2]);
  const takeProfits = exitListMatch[1]
    .split("/")
    .map((s) => parseFloat(s.trim()))
    .filter((n) => Number.isFinite(n));
  if (takeProfits.length === 0) return null;
  const levLow = parseInt(dirLevMatch[2], 10);
  const levHigh = dirLevMatch[3] ? parseInt(dirLevMatch[3], 10) : levLow;
  return {
    pair: expandPair(pairMatch[1]),
    direction: dirLevMatch[1].toLowerCase() as "long" | "short",
    entry: midpoint(lo, hi),
    stopLoss: parseFloat(slMatch[1]),
    takeProfits,
    leverage: Math.round(midpoint(levLow, levHigh)),
  };
}

// ─── Template D — Langestrom ─────────────────────────────────────────
function tryLangestrom(raw: string): RegexFields | null {
  const typeMatch = raw.match(/Type:\s*(LONG|SHORT)/i);
  const assetMatch = raw.match(/Asset:\s*([A-Z]+)/i);
  const entryMatch = raw.match(/Entry\s*Price:\s*\$?([\d.]+)/i);
  const slMatch = raw.match(/Stop\s*Loss:\s*\$?([\d.]+)/i);
  const tp1Match = raw.match(/First\s*TP\s*&\s*SL-BE:\s*\$?([\d.]+)/i);
  const tp2Match = raw.match(/Final\s*Take\s*Profit:\s*\$?([\d.]+)/i);
  const levMatch = raw.match(/Recommended\s*Leverage:\s*(\d+)(?:-(\d+))?x?/i);
  if (!typeMatch || !assetMatch || !entryMatch || !slMatch || !tp1Match || !tp2Match) return null;
  const levLow = levMatch ? parseInt(levMatch[1], 10) : null;
  const levHigh = levMatch && levMatch[2] ? parseInt(levMatch[2], 10) : levLow;
  const leverage = levLow !== null && levHigh !== null ? Math.round(midpoint(levLow, levHigh)) : null;

  const marketHint = /Entry\s*Price:[^\n]*\bMARKET\b/i.test(raw);
  const noteParts: string[] = [];
  if (marketHint) noteParts.push("Entry: MARKET");
  noteParts.push("SL-BE at TP1");
  return {
    pair: expandPair(assetMatch[1]),
    direction: typeMatch[1].toLowerCase() as "long" | "short",
    entry: parseFloat(entryMatch[1]),
    stopLoss: parseFloat(slMatch[1]),
    takeProfits: [parseFloat(tp1Match[1]), parseFloat(tp2Match[1])],
    leverage,
    notes: noteParts.join("; "),
  };
}

const TEMPLATES: { id: TemplateId; fn: (raw: string) => RegexFields | null }[] = [
  { id: "E", fn: tryKapoor },
  { id: "A", fn: trySheldon },
  { id: "B", fn: tryEmojiUsdt },
  { id: "C", fn: tryNasdaq75 },
  { id: "D", fn: tryLangestrom },
];

/** Try each template in order; first whose extractor returns complete required fields wins. */
export function parseWithRegex(rawText: string): RegexResult {
  for (const t of TEMPLATES) {
    const fields = t.fn(rawText);
    if (fields && isComplete(fields)) {
      return { template: t.id, fields, complete: true };
    }
  }
  return { template: null, fields: {}, complete: false };
}
```

- [ ] **Step 5: Run tests + tsc**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10 && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: 142 + 18 (15 fixture-pass + 3 fixture-fall-through) + 2 degenerate = 162 tests passing. TSC=OK.

Note: if any fixture assertion fails, fix the regex template (NOT the fixture's expected output — fixtures are the ground truth from spec §8). Common drift: `parseFloat` vs `parseDollarsAmount` (the latter strips commas), or off-by-one on midpoint rounding for leverage.

- [ ] **Step 6: Commit**

```bash
cd ~/lazytrader-app
git add src/parser/regex.ts src/parser/__tests__/regex.test.ts src/parser/__tests__/__fixtures__/rawSignals.ts
git diff --cached --stat
git commit -m "feat(parser): add 5-template regex extractor + 18-fixture replay

Templates A (Sheldon narrative), B (emoji USDT), C (Nasdaq75 Blofin),
D (Langestrom), E (Kapoor clean) cover 15 of 18 collected real signal
fixtures. Discriminator-gated dispatch (E→A→B→C→D order); each
template independent. Per-template extractors apply spec §8.7 helpers
(midpoint for entries, closerToEntry for TPs, expandPair for quotes,
inferDirection for Kapoor's missing-side case).

3 LLM-only fixtures (#6 Prime Charter LIMIT, #7 multi-trade,
#11 HYPE prose) correctly fall through the gate — test asserts they do.

20 vitest cases (18 fixtures + 2 degenerate-input checks).

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: secureSettings extension for LLM credentials

**Files:**
- Modify: `src/storage/secureSettings.ts`

**Why:** Single chokepoint pattern from M3 — adds `llmProvider` + `claudeApiKey` + `openaiApiKey` keys, and a `getLlmConfig()` helper that resolves provider+key together. T5/T6/T7/T10 all consume these.

- [ ] **Step 1: Replace `src/storage/secureSettings.ts`**

Open `src/storage/secureSettings.ts` and replace its contents with:

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
 * M4 adds: LLM provider + Claude API key + OpenAI API key.
 * M5 will extend with: wallet auth token / session jwt.
 */

import * as SecureStore from "expo-secure-store";

const KEYS = {
  birdeyeApiKey: "birdeye_api_key",
  llmProvider: "llm_provider",
  claudeApiKey: "claude_api_key",
  openaiApiKey: "openai_api_key",
} as const;

export type LlmProvider = "claude" | "gpt-4o-mini";

// ─── Birdeye (M3, unchanged) ────────────────────────────────
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

// ─── LLM (M4) ──────────────────────────────────────────────
export async function getLlmProvider(): Promise<LlmProvider | null> {
  const raw = await SecureStore.getItemAsync(KEYS.llmProvider);
  if (raw === "claude" || raw === "gpt-4o-mini") return raw;
  return null;
}
export async function setLlmProvider(provider: LlmProvider): Promise<void> {
  await SecureStore.setItemAsync(KEYS.llmProvider, provider);
}

export async function getClaudeApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.claudeApiKey);
}
export async function setClaudeApiKey(value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    await clearClaudeApiKey();
    return;
  }
  await SecureStore.setItemAsync(KEYS.claudeApiKey, trimmed);
}
export async function clearClaudeApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.claudeApiKey);
}

export async function getOpenAiApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.openaiApiKey);
}
export async function setOpenAiApiKey(value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    await clearOpenAiApiKey();
    return;
  }
  await SecureStore.setItemAsync(KEYS.openaiApiKey, trimmed);
}
export async function clearOpenAiApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.openaiApiKey);
}

/**
 * Resolves the active provider's full config or null if not configured.
 * Returns null if either provider is unset OR the corresponding key is empty.
 */
export async function getLlmConfig(): Promise<{ provider: LlmProvider; apiKey: string } | null> {
  const provider = await getLlmProvider();
  if (!provider) return null;
  const apiKey = provider === "claude" ? await getClaudeApiKey() : await getOpenAiApiKey();
  if (!apiKey) return null;
  return { provider, apiKey };
}

/** Redact a secret value for logging. Returns "•••••" + last 4 chars. */
export function redact(value: string | null | undefined): string {
  if (!value) return "(empty)";
  if (value.length <= 4) return "•••••";
  return "•••••" + value.slice(-4);
}
```

- [ ] **Step 2: tsc check**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: `TSC=OK`. (No new tests — wrapper around native API; behavior verified on phone in T12.)

- [ ] **Step 3: Verify M3 Birdeye flow still imports work**

```bash
cd ~/lazytrader-app && grep -n "getBirdeyeApiKey\|setBirdeyeApiKey\|clearBirdeyeApiKey" src/screens/SettingsScreen.tsx
```

Expected: 3 imports/uses still present (handleSave, handleClear, useEffect). If any failed import, fix the path before commit.

- [ ] **Step 4: Commit**

```bash
cd ~/lazytrader-app
git add src/storage/secureSettings.ts
git commit -m "feat(storage): add LLM provider + Claude/OpenAI API key getters

Extends M3's single-chokepoint pattern. Adds llmProvider (typed as
'claude' | 'gpt-4o-mini'), claudeApiKey, openaiApiKey getters/setters
+ getLlmConfig() helper that resolves provider+key together (null
if either is unset).

M3 Birdeye flow unchanged. redact() helper still applies to all keys.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: LLM provider-agnostic interface + error class hierarchy

**Files:**
- Create: `src/parser/llm.ts`

**Why:** Defines the public `parseWithLlm()` entrypoint that pipeline.ts calls; dispatches to claudeAdapter or openaiAdapter (T6, T7) based on `provider`. Centralizes error classes consumed by UI.

- [ ] **Step 1: Create `src/parser/llm.ts`**

```ts
/**
 * Provider-agnostic LLM parser interface.
 *
 * pipeline.ts calls parseWithLlm(rawText, config); we dispatch to the
 * matching adapter (claudeAdapter or openaiAdapter). Adapters return a
 * fully-formed ParsedSignal; this module just routes + normalizes errors.
 */

import type { ParsedSignal } from "./schema";
import type { LlmProvider } from "../storage/secureSettings";
import { fetchClaudeParse } from "./claudeAdapter";
import { fetchOpenAiParse } from "./openaiAdapter";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
}

// ─── Error class hierarchy ─────────────────────────────────────
export class LlmError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "LlmError";
  }
}
export class LlmAuthError extends LlmError {
  constructor(message: string) {
    super(message, 401);
    this.name = "LlmAuthError";
  }
}
export class LlmRateLimitError extends LlmError {
  constructor(message: string) {
    super(message, 429);
    this.name = "LlmRateLimitError";
  }
}
export class LlmSchemaError extends LlmError {
  constructor(message: string) {
    super(message);
    this.name = "LlmSchemaError";
  }
}

/** Dispatch to the right adapter based on provider. Adapters throw LlmError subclasses on failure. */
export async function parseWithLlm(
  rawText: string,
  config: LlmConfig,
  signal?: AbortSignal,
): Promise<ParsedSignal> {
  if (config.provider === "claude") {
    return fetchClaudeParse(rawText, config.apiKey, signal);
  }
  return fetchOpenAiParse(rawText, config.apiKey, signal);
}
```

- [ ] **Step 2: tsc check (will fail until T6+T7 land — that's expected)**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit 2>&1 | head -20
```

Expected: errors about `Cannot find module './claudeAdapter'` and `'./openaiAdapter'`. That's intentional — T6 and T7 create those files.

- [ ] **Step 3: Stub the missing modules to unblock tsc**

This is a transitional commit. Create stub files so tsc is clean while T6/T7 fill them in:

`src/parser/claudeAdapter.ts`:
```ts
import type { ParsedSignal } from "./schema";
export async function fetchClaudeParse(
  _rawText: string,
  _apiKey: string,
  _signal?: AbortSignal,
): Promise<ParsedSignal> {
  throw new Error("claudeAdapter not implemented yet (T6)");
}
```

`src/parser/openaiAdapter.ts`:
```ts
import type { ParsedSignal } from "./schema";
export async function fetchOpenAiParse(
  _rawText: string,
  _apiKey: string,
  _signal?: AbortSignal,
): Promise<ParsedSignal> {
  throw new Error("openaiAdapter not implemented yet (T7)");
}
```

- [ ] **Step 4: tsc + tests**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit && echo "TSC=OK" && pnpm test 2>&1 | tail -5
```

Expected: TSC=OK, 162 tests still passing (no new tests for this task; stubs not tested).

- [ ] **Step 5: Commit**

```bash
cd ~/lazytrader-app
git add src/parser/llm.ts src/parser/claudeAdapter.ts src/parser/openaiAdapter.ts
git commit -m "feat(parser): add LLM dispatch interface + error hierarchy

parseWithLlm() routes to claude or openai adapter based on provider.
LlmError + LlmAuthError + LlmRateLimitError + LlmSchemaError class
hierarchy used by UI to discriminate failure modes.

Adapter modules stubbed to throw 'not implemented' — filled in by
T6 (Claude) and T7 (OpenAI). This commit keeps tsc clean while the
adapter implementations land.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Claude Haiku adapter (TDD)

**Files:**
- Modify: `src/parser/claudeAdapter.ts` (replace stub)
- Create: `src/parser/__tests__/claudeAdapter.test.ts`

**Why:** Calls `api.anthropic.com/v1/messages` with a `tool_use` request that pins the JSON output to ParsedSignalSchema. Returns a validated ParsedSignal or throws an LlmError subclass.

- [ ] **Step 1: Write the failing tests**

Create `src/parser/__tests__/claudeAdapter.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchClaudeParse } from "../claudeAdapter";
import { LlmAuthError, LlmRateLimitError, LlmError, LlmSchemaError } from "../llm";

const validToolUseResponse = {
  content: [
    {
      type: "tool_use",
      name: "extract_signal",
      input: {
        pair: "BTCUSDT",
        direction: "long",
        entry: 70000,
        stopLoss: 69000,
        takeProfits: [71000, 72000],
        leverage: 10,
        multipleTrades: false,
        notes: null,
      },
    },
  ],
};

describe("fetchClaudeParse", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ParsedSignal on happy path", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validToolUseResponse),
    });
    const out = await fetchClaudeParse("raw signal text", "sk-test");
    expect(out.pair).toBe("BTCUSDT");
    expect(out.direction).toBe("long");
    expect(out.source).toBe("claude");
    expect(out.rawText).toBe("raw signal text");
    expect(out.takeProfits).toEqual([71000, 72000]);
  });

  it("sends correct headers + body shape", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validToolUseResponse),
    });
    vi.stubGlobal("fetch", mock);
    await fetchClaudeParse("hello", "sk-mykey");
    const url = mock.mock.calls[0][0] as string;
    const init = mock.mock.calls[0][1] as RequestInit;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-mykey");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["content-type"]).toBe("application/json");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("claude-haiku-4-5");
    expect(body.tools[0].name).toBe("extract_signal");
    expect(body.tool_choice).toEqual({ type: "tool", name: "extract_signal" });
    expect(body.messages[0].content).toBe("hello");
  });

  it("throws LlmAuthError on 401", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 401, text: () => Promise.resolve("invalid_api_key"),
    });
    await expect(fetchClaudeParse("x", "bad")).rejects.toBeInstanceOf(LlmAuthError);
  });

  it("throws LlmRateLimitError on 429", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 429, text: () => Promise.resolve("rate_limit"),
    });
    await expect(fetchClaudeParse("x", "k")).rejects.toBeInstanceOf(LlmRateLimitError);
  });

  it("throws LlmError on other HTTP failure", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 503, text: () => Promise.resolve("upstream"),
    });
    await expect(fetchClaudeParse("x", "k")).rejects.toBeInstanceOf(LlmError);
  });

  it("throws LlmSchemaError when response has no tool_use block", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve({ content: [{ type: "text", text: "I refuse to answer" }] }),
    });
    await expect(fetchClaudeParse("x", "k")).rejects.toBeInstanceOf(LlmSchemaError);
  });

  it("throws LlmSchemaError when tool_use input fails Zod", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve({
        content: [{
          type: "tool_use",
          name: "extract_signal",
          input: { pair: "B", direction: "buy", entry: -1, stopLoss: 0, takeProfits: [] },
        }],
      }),
    });
    await expect(fetchClaudeParse("x", "k")).rejects.toBeInstanceOf(LlmSchemaError);
  });

  it("propagates abort signal to fetch", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve(validToolUseResponse),
    });
    vi.stubGlobal("fetch", mock);
    const ac = new AbortController();
    await fetchClaudeParse("x", "k", ac.signal);
    const init = mock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(ac.signal);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10
```

Expected: failures because the stub throws `claudeAdapter not implemented yet`.

- [ ] **Step 3: Replace `src/parser/claudeAdapter.ts` with the real implementation**

```ts
/**
 * Claude Haiku adapter — calls Anthropic Messages API with a tool_use
 * request that pins output to ParsedSignalSchema. Returns a validated
 * ParsedSignal or throws an LlmError subclass.
 *
 * Endpoint: POST https://api.anthropic.com/v1/messages
 * Auth: x-api-key header (BYO key, never bundled)
 */

import { ParsedSignalSchema, type ParsedSignal } from "./schema";
import { LlmAuthError, LlmError, LlmRateLimitError, LlmSchemaError } from "./llm";

const URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";

const TOOL_INPUT_SCHEMA = {
  type: "object",
  properties: {
    pair: {
      type: "string",
      description:
        "Trading pair like BTCUSDT, ETHUSDT, SOLUSDT — base+quote concatenated, no separators. If only the base is in the signal (e.g. just 'BTC' or '#ETH'), append 'USDT' as the quote convention.",
    },
    direction: { type: "string", enum: ["long", "short"] },
    entry: {
      type: "number",
      description: "Entry price; if signal gives a range like '70000-71000', return the midpoint.",
    },
    stopLoss: {
      type: "number",
      description:
        "Stop loss price; if signal gives a range, use the bound closer to the entry price (tighter stop).",
    },
    takeProfits: {
      type: "array",
      items: { type: "number" },
      minItems: 1,
      maxItems: 10,
      description:
        "Take profit prices in order from nearest to farthest from entry. If a TP is given as a range, use the bound closer to entry.",
    },
    leverage: {
      type: ["number", "null"],
      description:
        "Signal's stated leverage if mentioned (midpoint if range like '5-10x'); null if not stated.",
    },
    multipleTrades: {
      type: "boolean",
      description:
        "True if the message contains multiple distinct trade ideas (different entries/SLs). Extract only the first trade's fields if true.",
    },
    notes: {
      type: ["string", "null"],
      description:
        "Free-form execution notes from the signal (e.g. 'MARKET entry', 'SL-BE at TP1', 'wick entry'). Null if none.",
    },
  },
  required: ["pair", "direction", "entry", "stopLoss", "takeProfits", "multipleTrades"],
} as const;

interface ToolUseBlock {
  type: "tool_use";
  name: string;
  input: unknown;
}
interface AnthropicResponse {
  content?: Array<{ type: string; [k: string]: unknown }>;
}

export async function fetchClaudeParse(
  rawText: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ParsedSignal> {
  const body = {
    model: MODEL,
    max_tokens: 1024,
    tools: [
      {
        name: "extract_signal",
        description: "Extract structured trade signal fields from raw text",
        input_schema: TOOL_INPUT_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "extract_signal" },
    messages: [{ role: "user", content: rawText }],
  };

  let res: Response;
  try {
    res = await fetch(URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    throw new LlmError(`Claude network error: ${(e as Error).message}`);
  }

  if (res.status === 401) throw new LlmAuthError("Claude API key invalid (HTTP 401)");
  if (res.status === 429) throw new LlmRateLimitError("Claude rate-limited (HTTP 429)");
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new LlmError(`Claude HTTP ${res.status}: ${bodyText.slice(0, 200)}`, res.status);
  }

  const json = (await res.json()) as AnthropicResponse;
  const toolUse = json.content?.find(
    (b): b is ToolUseBlock => b.type === "tool_use" && (b as ToolUseBlock).name === "extract_signal",
  );
  if (!toolUse) {
    throw new LlmSchemaError("Claude response missing extract_signal tool_use block");
  }

  const candidate = {
    ...(toolUse.input as Record<string, unknown>),
    source: "claude" as const,
    rawText,
    entryRange: null,
    notes:
      (toolUse.input as Record<string, unknown>).notes !== undefined
        ? (toolUse.input as { notes: string | null }).notes
        : null,
  };

  const parsed = ParsedSignalSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new LlmSchemaError(`Claude returned schema-invalid object: ${parsed.error.message.slice(0, 200)}`);
  }
  return parsed.data;
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10 && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: 162 + 7 = 169 tests passing, TSC=OK.

- [ ] **Step 5: Commit**

```bash
cd ~/lazytrader-app
git add src/parser/claudeAdapter.ts src/parser/__tests__/claudeAdapter.test.ts
git commit -m "feat(parser): add Claude Haiku adapter (tool_use schema)

Wraps Anthropic Messages API. tool_choice forced to extract_signal
function — guaranteed schema-valid JSON, no parse-and-pray. Discriminates
errors: LlmAuthError (401), LlmRateLimitError (429), LlmError (other),
LlmSchemaError (no tool_use block OR Zod validation fails).

AbortSignal propagated to fetch for cancellation support.

7 vitest cases (happy path, headers/body shape, all 4 error paths, abort).

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: OpenAI gpt-4o-mini adapter (TDD)

**Files:**
- Modify: `src/parser/openaiAdapter.ts` (replace stub)
- Create: `src/parser/__tests__/openaiAdapter.test.ts`

**Why:** Calls `api.openai.com/v1/chat/completions` with function calling that pins JSON output to ParsedSignalSchema. Same shape as Claude adapter, different request/response formats.

- [ ] **Step 1: Write the failing tests**

Create `src/parser/__tests__/openaiAdapter.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOpenAiParse } from "../openaiAdapter";
import { LlmAuthError, LlmRateLimitError, LlmError, LlmSchemaError } from "../llm";

const validToolCallResponse = {
  choices: [
    {
      message: {
        tool_calls: [
          {
            type: "function",
            function: {
              name: "extract_signal",
              arguments: JSON.stringify({
                pair: "BTCUSDT",
                direction: "long",
                entry: 70000,
                stopLoss: 69000,
                takeProfits: [71000, 72000],
                leverage: 10,
                multipleTrades: false,
                notes: null,
              }),
            },
          },
        ],
      },
    },
  ],
};

describe("fetchOpenAiParse", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ParsedSignal on happy path", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, status: 200, json: () => Promise.resolve(validToolCallResponse),
    });
    const out = await fetchOpenAiParse("raw signal text", "sk-test");
    expect(out.pair).toBe("BTCUSDT");
    expect(out.direction).toBe("long");
    expect(out.source).toBe("gpt-4o-mini");
    expect(out.rawText).toBe("raw signal text");
  });

  it("sends correct headers + body shape", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve(validToolCallResponse),
    });
    vi.stubGlobal("fetch", mock);
    await fetchOpenAiParse("hello", "sk-mykey");
    const url = mock.mock.calls[0][0] as string;
    const init = mock.mock.calls[0][1] as RequestInit;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-mykey");
    expect(headers["content-type"]).toBe("application/json");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.tools[0].function.name).toBe("extract_signal");
    expect(body.tool_choice).toEqual({ type: "function", function: { name: "extract_signal" } });
    expect(body.messages[1].content).toBe("hello");
  });

  it("throws LlmAuthError on 401", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 401, text: () => Promise.resolve("invalid_api_key"),
    });
    await expect(fetchOpenAiParse("x", "bad")).rejects.toBeInstanceOf(LlmAuthError);
  });

  it("throws LlmRateLimitError on 429", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 429, text: () => Promise.resolve("rate_limit"),
    });
    await expect(fetchOpenAiParse("x", "k")).rejects.toBeInstanceOf(LlmRateLimitError);
  });

  it("throws LlmError on other HTTP failure", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 503, text: () => Promise.resolve("upstream"),
    });
    await expect(fetchOpenAiParse("x", "k")).rejects.toBeInstanceOf(LlmError);
  });

  it("throws LlmSchemaError when no tool_calls in response", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve({ choices: [{ message: { content: "I refuse" } }] }),
    });
    await expect(fetchOpenAiParse("x", "k")).rejects.toBeInstanceOf(LlmSchemaError);
  });

  it("throws LlmSchemaError when arguments JSON.parse fails", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve({
        choices: [{ message: { tool_calls: [{ type: "function", function: { name: "extract_signal", arguments: "not valid json {{{" } }] } }],
      }),
    });
    await expect(fetchOpenAiParse("x", "k")).rejects.toBeInstanceOf(LlmSchemaError);
  });

  it("throws LlmSchemaError when arguments fail Zod", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve({
        choices: [{ message: { tool_calls: [{
          type: "function",
          function: { name: "extract_signal", arguments: JSON.stringify({ pair: "B", direction: "buy", entry: -1, stopLoss: 0, takeProfits: [] }) },
        }] } }],
      }),
    });
    await expect(fetchOpenAiParse("x", "k")).rejects.toBeInstanceOf(LlmSchemaError);
  });

  it("propagates abort signal to fetch", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve(validToolCallResponse),
    });
    vi.stubGlobal("fetch", mock);
    const ac = new AbortController();
    await fetchOpenAiParse("x", "k", ac.signal);
    const init = mock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(ac.signal);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10
```

Expected: failures because the stub throws `openaiAdapter not implemented yet`.

- [ ] **Step 3: Replace `src/parser/openaiAdapter.ts` with the real implementation**

```ts
/**
 * OpenAI gpt-4o-mini adapter — calls Chat Completions API with function
 * calling that pins output to ParsedSignalSchema. Returns a validated
 * ParsedSignal or throws an LlmError subclass.
 *
 * Endpoint: POST https://api.openai.com/v1/chat/completions
 * Auth: Authorization: Bearer header (BYO key, never bundled)
 */

import { ParsedSignalSchema, type ParsedSignal } from "./schema";
import { LlmAuthError, LlmError, LlmRateLimitError, LlmSchemaError } from "./llm";

const URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
const SYSTEM_PROMPT =
  "You extract structured trade signal fields from messy social-media text. Use the extract_signal function. If unsure about a field, prefer null over guessing wrong; for required fields, make your best guess.";

const FUNCTION_SCHEMA = {
  type: "object",
  properties: {
    pair: {
      type: "string",
      description:
        "Trading pair like BTCUSDT, ETHUSDT, SOLUSDT — base+quote concatenated, no separators. If only the base is in the signal (e.g. just 'BTC' or '#ETH'), append 'USDT' as the quote convention.",
    },
    direction: { type: "string", enum: ["long", "short"] },
    entry: {
      type: "number",
      description: "Entry price; if signal gives a range like '70000-71000', return the midpoint.",
    },
    stopLoss: {
      type: "number",
      description:
        "Stop loss price; if signal gives a range, use the bound closer to the entry price (tighter stop).",
    },
    takeProfits: {
      type: "array",
      items: { type: "number" },
      minItems: 1,
      maxItems: 10,
      description:
        "Take profit prices in order from nearest to farthest from entry. If a TP is given as a range, use the bound closer to entry.",
    },
    leverage: {
      type: ["number", "null"],
      description:
        "Signal's stated leverage if mentioned (midpoint if range like '5-10x'); null if not stated.",
    },
    multipleTrades: {
      type: "boolean",
      description:
        "True if the message contains multiple distinct trade ideas (different entries/SLs). Extract only the first trade's fields if true.",
    },
    notes: {
      type: ["string", "null"],
      description:
        "Free-form execution notes from the signal (e.g. 'MARKET entry', 'SL-BE at TP1', 'wick entry'). Null if none.",
    },
  },
  required: ["pair", "direction", "entry", "stopLoss", "takeProfits", "multipleTrades"],
} as const;

interface OpenAiResponse {
  choices?: Array<{
    message?: {
      tool_calls?: Array<{
        type: string;
        function: { name: string; arguments: string };
      }>;
    };
  }>;
}

export async function fetchOpenAiParse(
  rawText: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ParsedSignal> {
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: rawText },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "extract_signal",
          description: "Extract structured trade signal fields from raw text",
          parameters: FUNCTION_SCHEMA,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "extract_signal" } },
  };

  let res: Response;
  try {
    res = await fetch(URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    throw new LlmError(`OpenAI network error: ${(e as Error).message}`);
  }

  if (res.status === 401) throw new LlmAuthError("OpenAI API key invalid (HTTP 401)");
  if (res.status === 429) throw new LlmRateLimitError("OpenAI rate-limited (HTTP 429)");
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new LlmError(`OpenAI HTTP ${res.status}: ${bodyText.slice(0, 200)}`, res.status);
  }

  const json = (await res.json()) as OpenAiResponse;
  const toolCall = json.choices?.[0]?.message?.tool_calls?.find(
    (tc) => tc.type === "function" && tc.function.name === "extract_signal",
  );
  if (!toolCall) {
    throw new LlmSchemaError("OpenAI response missing extract_signal tool_call");
  }

  let args: unknown;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch (e) {
    throw new LlmSchemaError(`OpenAI tool_call arguments not valid JSON: ${(e as Error).message}`);
  }

  const candidate = {
    ...(args as Record<string, unknown>),
    source: "gpt-4o-mini" as const,
    rawText,
    entryRange: null,
    notes:
      (args as Record<string, unknown>).notes !== undefined
        ? (args as { notes: string | null }).notes
        : null,
  };

  const parsed = ParsedSignalSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new LlmSchemaError(`OpenAI returned schema-invalid object: ${parsed.error.message.slice(0, 200)}`);
  }
  return parsed.data;
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10 && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: 169 + 8 = 177 tests passing, TSC=OK.

- [ ] **Step 5: Commit**

```bash
cd ~/lazytrader-app
git add src/parser/openaiAdapter.ts src/parser/__tests__/openaiAdapter.test.ts
git commit -m "feat(parser): add OpenAI gpt-4o-mini adapter (function calling)

Wraps Chat Completions API. tool_choice forced to extract_signal
function — guaranteed schema-valid JSON. Same error class hierarchy
as Claude adapter (LlmAuthError/LlmRateLimitError/LlmError/LlmSchemaError).

System prompt instructs the model to prefer null over wrong guesses
for optional fields, best-guess for required.

8 vitest cases (happy path, headers/body, all error paths, abort).

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Pipeline orchestrator (TDD)

**Files:**
- Create: `src/parser/pipeline.ts`
- Create: `src/parser/__tests__/pipeline.test.ts`

**Why:** Single entry point CaptureScreen calls. Owns the regex → LLM gate-decision tree. Per spec §5: gate is strict (5/5 fields), all-or-nothing fallback. Returns either a `ParsedSignal` or a structured error object that UI can map to friendly messages.

- [ ] **Step 1: Write the failing tests**

Create `src/parser/__tests__/pipeline.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../regex", () => ({
  parseWithRegex: vi.fn(),
}));
vi.mock("../llm", () => ({
  parseWithLlm: vi.fn(),
  LlmError: class extends Error {},
  LlmAuthError: class extends Error { name = "LlmAuthError"; },
  LlmRateLimitError: class extends Error { name = "LlmRateLimitError"; },
  LlmSchemaError: class extends Error { name = "LlmSchemaError"; },
}));
vi.mock("../../storage/secureSettings", () => ({
  getLlmConfig: vi.fn(),
}));

import { parseWithRegex } from "../regex";
import { parseWithLlm, LlmAuthError, LlmRateLimitError, LlmSchemaError } from "../llm";
import { getLlmConfig } from "../../storage/secureSettings";
import { parsePipeline, ParseError, type ParsePipelineResult } from "../pipeline";

const regexHit = {
  template: "B" as const,
  fields: {
    pair: "BTCUSDT",
    direction: "long" as const,
    entry: 70000,
    stopLoss: 69000,
    takeProfits: [71000, 72000],
    leverage: 10,
    notes: null,
  },
  complete: true,
};

const regexMiss = { template: null, fields: {}, complete: false };

const llmResult = {
  pair: "ETHUSDT",
  direction: "short" as const,
  entry: 2400,
  stopLoss: 2450,
  takeProfits: [2350],
  leverage: null,
  source: "claude" as const,
  rawText: "raw",
  multipleTrades: false,
  notes: null,
  entryRange: null,
};

describe("parsePipeline", () => {
  beforeEach(() => {
    vi.mocked(parseWithRegex).mockReset();
    vi.mocked(parseWithLlm).mockReset();
    vi.mocked(getLlmConfig).mockReset();
  });

  it("returns regex result when gate passes; LLM not called", async () => {
    vi.mocked(parseWithRegex).mockReturnValue(regexHit);
    const r = (await parsePipeline("raw")) as Extract<ParsePipelineResult, { ok: true }>;
    expect(r.ok).toBe(true);
    expect(r.parsed.source).toBe("regex");
    expect(r.parsed.pair).toBe("BTCUSDT");
    expect(parseWithLlm).not.toHaveBeenCalled();
  });

  it("falls through to LLM when regex misses + key configured", async () => {
    vi.mocked(parseWithRegex).mockReturnValue(regexMiss);
    vi.mocked(getLlmConfig).mockResolvedValue({ provider: "claude", apiKey: "k" });
    vi.mocked(parseWithLlm).mockResolvedValue(llmResult);
    const r = (await parsePipeline("raw")) as Extract<ParsePipelineResult, { ok: true }>;
    expect(r.ok).toBe(true);
    expect(r.parsed.source).toBe("claude");
    expect(parseWithLlm).toHaveBeenCalledOnce();
  });

  it("returns 'no LLM config' error when regex misses + no key", async () => {
    vi.mocked(parseWithRegex).mockReturnValue(regexMiss);
    vi.mocked(getLlmConfig).mockResolvedValue(null);
    const r = (await parsePipeline("raw")) as Extract<ParsePipelineResult, { ok: false }>;
    expect(r.ok).toBe(false);
    expect(r.error).toBe(ParseError.NoLlmConfig);
    expect(parseWithLlm).not.toHaveBeenCalled();
  });

  it("returns 'auth invalid' on LlmAuthError", async () => {
    vi.mocked(parseWithRegex).mockReturnValue(regexMiss);
    vi.mocked(getLlmConfig).mockResolvedValue({ provider: "claude", apiKey: "bad" });
    vi.mocked(parseWithLlm).mockRejectedValue(new LlmAuthError("bad key"));
    const r = (await parsePipeline("raw")) as Extract<ParsePipelineResult, { ok: false }>;
    expect(r.error).toBe(ParseError.AuthInvalid);
  });

  it("returns 'rate limited' on LlmRateLimitError", async () => {
    vi.mocked(parseWithRegex).mockReturnValue(regexMiss);
    vi.mocked(getLlmConfig).mockResolvedValue({ provider: "claude", apiKey: "k" });
    vi.mocked(parseWithLlm).mockRejectedValue(new LlmRateLimitError("slow down"));
    const r = (await parsePipeline("raw")) as Extract<ParsePipelineResult, { ok: false }>;
    expect(r.error).toBe(ParseError.RateLimited);
  });

  it("returns 'malformed' on LlmSchemaError", async () => {
    vi.mocked(parseWithRegex).mockReturnValue(regexMiss);
    vi.mocked(getLlmConfig).mockResolvedValue({ provider: "claude", apiKey: "k" });
    vi.mocked(parseWithLlm).mockRejectedValue(new LlmSchemaError("bad shape"));
    const r = (await parsePipeline("raw")) as Extract<ParsePipelineResult, { ok: false }>;
    expect(r.error).toBe(ParseError.Malformed);
  });

  it("returns 'network' on generic Error from LLM", async () => {
    vi.mocked(parseWithRegex).mockReturnValue(regexMiss);
    vi.mocked(getLlmConfig).mockResolvedValue({ provider: "claude", apiKey: "k" });
    vi.mocked(parseWithLlm).mockRejectedValue(new Error("ETIMEDOUT"));
    const r = (await parsePipeline("raw")) as Extract<ParsePipelineResult, { ok: false }>;
    expect(r.error).toBe(ParseError.Network);
  });

  it("propagates AbortSignal to LLM call", async () => {
    vi.mocked(parseWithRegex).mockReturnValue(regexMiss);
    vi.mocked(getLlmConfig).mockResolvedValue({ provider: "claude", apiKey: "k" });
    vi.mocked(parseWithLlm).mockResolvedValue(llmResult);
    const ac = new AbortController();
    await parsePipeline("raw", ac.signal);
    expect(vi.mocked(parseWithLlm)).toHaveBeenCalledWith("raw", { provider: "claude", apiKey: "k" }, ac.signal);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10
```

Expected: failure with `Cannot find module '../pipeline'`.

- [ ] **Step 3: Implement `src/parser/pipeline.ts`**

```ts
/**
 * Parser pipeline orchestrator. Single entry point for CaptureScreen.
 *
 * Per spec §5: regex first (5-field gate, all-or-nothing); on miss, dispatch
 * to LLM via parseWithLlm. Errors surface as a structured discriminated union
 * the UI can map to friendly messages.
 */

import { parseWithRegex } from "./regex";
import {
  parseWithLlm,
  LlmAuthError,
  LlmRateLimitError,
  LlmSchemaError,
} from "./llm";
import { getLlmConfig } from "../storage/secureSettings";
import { ParsedSignalSchema, type ParsedSignal } from "./schema";

export enum ParseError {
  NoLlmConfig = "no_llm_config",
  AuthInvalid = "auth_invalid",
  RateLimited = "rate_limited",
  Malformed = "malformed",
  Network = "network",
}

export type ParsePipelineResult =
  | { ok: true; parsed: ParsedSignal }
  | { ok: false; error: ParseError; detail?: string };

/**
 * Try regex first; on miss + LLM configured, dispatch to LLM. Otherwise
 * return a structured error.
 */
export async function parsePipeline(
  rawText: string,
  signal?: AbortSignal,
): Promise<ParsePipelineResult> {
  const r = parseWithRegex(rawText);
  if (r.complete) {
    // Construct ParsedSignal from regex result
    const candidate = {
      pair: r.fields.pair!,
      direction: r.fields.direction!,
      entry: r.fields.entry!,
      stopLoss: r.fields.stopLoss!,
      takeProfits: r.fields.takeProfits!,
      leverage: r.fields.leverage ?? null,
      source: "regex" as const,
      rawText,
      multipleTrades: false,
      notes: r.fields.notes ?? null,
      entryRange: r.fields.entryRange ?? null,
    };
    const parsed = ParsedSignalSchema.safeParse(candidate);
    if (!parsed.success) {
      return { ok: false, error: ParseError.Malformed, detail: parsed.error.message.slice(0, 200) };
    }
    return { ok: true, parsed: parsed.data };
  }

  const config = await getLlmConfig();
  if (!config) {
    return { ok: false, error: ParseError.NoLlmConfig };
  }

  try {
    const llm = await parseWithLlm(rawText, config, signal);
    return { ok: true, parsed: llm };
  } catch (e) {
    if (e instanceof LlmAuthError) return { ok: false, error: ParseError.AuthInvalid };
    if (e instanceof LlmRateLimitError) return { ok: false, error: ParseError.RateLimited };
    if (e instanceof LlmSchemaError) return { ok: false, error: ParseError.Malformed, detail: (e as Error).message };
    return { ok: false, error: ParseError.Network, detail: (e as Error).message };
  }
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -10 && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: 177 + 8 = 185 tests passing, TSC=OK.

- [ ] **Step 5: Commit**

```bash
cd ~/lazytrader-app
git add src/parser/pipeline.ts src/parser/__tests__/pipeline.test.ts
git commit -m "feat(parser): add pipeline orchestrator (regex → LLM gate)

Single entry point for CaptureScreen. Strict 5-field gate per spec §5:
regex passes → done; regex misses + LLM configured → dispatch; misses +
no LLM → structured NoLlmConfig error.

Errors surface as discriminated union (ParseError enum: NoLlmConfig,
AuthInvalid, RateLimited, Malformed, Network) — UI maps to friendly
text in T11.

8 vitest cases with regex/llm/secureSettings all mocked.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: ParsedSignalCard component

**Files:**
- Create: `src/components/ParsedSignalCard.tsx`

**Why:** Editable display of the parsed signal + read-only sizing preview (per spec §9). Controlled component — receives ParsedSignal + onChange callbacks; never calls the parser itself; never touches secureSettings.

- [ ] **Step 1: Create the component**

Create `src/components/ParsedSignalCard.tsx`:

```tsx
// src/components/ParsedSignalCard.tsx
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { ParsedSignal } from "../parser/schema";
import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

export interface SizingPreview {
  margin: number;          // $ collateral required at chosen leverage
  leverage: number;        // capped to maxLeverage
  risk: number;            // $ loss if SL hits
  riskPct: number;         // % of accountBalance
  capBinds: boolean;       // true when leverage === maxLeverage AND risk < intended budget
  intendedRiskPct: number; // user's settings value (e.g. 1.0)
  maxLeverage: number;     // user's settings cap (e.g. 25)
}

export interface ParsedSignalCardProps {
  /** Current parsed signal (controlled). */
  value: ParsedSignal;
  /** Called when any editable field changes. Parent owns state. */
  onChange: (next: ParsedSignal) => void;
  /** Live-computed sizing preview from the engine math. Pass null to hide block. */
  sizing: SizingPreview | null;
}

const SOURCE_LABEL: Record<ParsedSignal["source"], string> = {
  regex: "by regex",
  claude: "by Claude",
  "gpt-4o-mini": "by gpt-4o-mini",
};

export function ParsedSignalCard({ value, onChange, sizing }: ParsedSignalCardProps) {
  const updateField = <K extends keyof ParsedSignal>(key: K, v: ParsedSignal[K]) =>
    onChange({ ...value, [key]: v });

  const updateTp = (idx: number, n: number) => {
    const next = [...value.takeProfits];
    next[idx] = n;
    updateField("takeProfits", next);
  };
  const removeTp = (idx: number) => {
    if (value.takeProfits.length <= 1) return;
    updateField("takeProfits", value.takeProfits.filter((_, i) => i !== idx));
  };
  const addTp = () => {
    if (value.takeProfits.length >= 10) return;
    const last = value.takeProfits[value.takeProfits.length - 1];
    updateField("takeProfits", [...value.takeProfits, last]);
  };

  return (
    <View style={styles.card}>
      <View style={styles.chipRow}>
        <View style={styles.chipNeutral}>
          <Text style={styles.chipText}>{SOURCE_LABEL[value.source]}</Text>
        </View>
        {value.multipleTrades && (
          <View style={styles.chipWarn}>
            <Text style={styles.chipText}>multi-trade · first parsed</Text>
          </View>
        )}
      </View>

      <Field label="Pair">
        <Text style={styles.readOnlyValue}>{value.pair}</Text>
      </Field>

      <Field label="Direction">
        <View style={styles.segmented}>
          <Pressable
            style={[styles.segment, value.direction === "long" && styles.segmentActive]}
            onPress={() => updateField("direction", "long")}
          >
            <Text style={[styles.segmentText, value.direction === "long" && styles.segmentTextActive]}>LONG</Text>
          </Pressable>
          <Pressable
            style={[styles.segment, value.direction === "short" && styles.segmentActive]}
            onPress={() => updateField("direction", "short")}
          >
            <Text style={[styles.segmentText, value.direction === "short" && styles.segmentTextActive]}>SHORT</Text>
          </Pressable>
        </View>
      </Field>

      <Field label="Entry">
        <TextInput
          style={styles.numInput}
          keyboardType="numeric"
          value={String(value.entry)}
          onChangeText={(t) => {
            const n = parseFloat(t);
            if (Number.isFinite(n)) updateField("entry", n);
          }}
        />
        {value.entryRange && (
          <Text style={styles.rangeHint}>range: {value.entryRange[0]} – {value.entryRange[1]}</Text>
        )}
      </Field>

      <Field label="Stop loss">
        <TextInput
          style={styles.numInput}
          keyboardType="numeric"
          value={String(value.stopLoss)}
          onChangeText={(t) => {
            const n = parseFloat(t);
            if (Number.isFinite(n)) updateField("stopLoss", n);
          }}
        />
      </Field>

      <Field label="Take profits">
        {value.takeProfits.map((tp, i) => (
          <View key={i} style={styles.tpRow}>
            <Text style={styles.tpLabel}>TP{i + 1}</Text>
            <TextInput
              style={[styles.numInput, styles.tpInput]}
              keyboardType="numeric"
              value={String(tp)}
              onChangeText={(t) => {
                const n = parseFloat(t);
                if (Number.isFinite(n)) updateTp(i, n);
              }}
            />
            {value.takeProfits.length > 1 && (
              <Pressable onPress={() => removeTp(i)} style={styles.removeBtn} hitSlop={6}>
                <Text style={styles.removeBtnText}>−</Text>
              </Pressable>
            )}
          </View>
        ))}
        {value.takeProfits.length < 10 && (
          <Pressable onPress={addTp} style={styles.addBtn} hitSlop={6}>
            <Text style={styles.addBtnText}>+ Add TP</Text>
          </Pressable>
        )}
      </Field>

      {value.leverage !== null && (
        <Text style={styles.signalLeverage}>Signal said: {value.leverage}×</Text>
      )}

      {sizing !== null && (
        <View style={styles.sizingBlock}>
          <Text style={styles.sizingLabel}>Sizing preview (read-only)</Text>
          <SizingRow label="Margin" value={`$${sizing.margin.toFixed(2)}`} />
          <SizingRow
            label="Leverage"
            value={
              sizing.leverage === sizing.maxLeverage
                ? `${sizing.leverage}× (at your cap)`
                : `${sizing.leverage}×`
            }
          />
          <SizingRow
            label="Risk"
            value={`$${sizing.risk.toFixed(2)} (${sizing.riskPct.toFixed(2)}% of account)`}
            warn={sizing.capBinds}
          />
          {sizing.capBinds && (
            <Text style={styles.warningText}>
              SL too tight for {sizing.intendedRiskPct}% risk budget at {sizing.maxLeverage}× cap — actual risk: {sizing.riskPct.toFixed(2)}%
            </Text>
          )}
        </View>
      )}

      {value.notes !== null && value.notes.length > 0 && (
        <Text style={styles.notes}>Notes: {value.notes}</Text>
      )}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldBody}>{children}</View>
    </View>
  );
}

function SizingRow({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.sizingRow}>
      <Text style={styles.sizingRowLabel}>{label}</Text>
      <Text style={[styles.sizingRowValue, warn && styles.sizingRowValueWarn]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: space.md,
    gap: space.md,
  },
  chipRow: { flexDirection: "row", gap: space.sm },
  chipNeutral: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipWarn: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  chipText: {
    fontSize: fontSize.xs - 1,
    color: colors.text,
    fontWeight: fontWeight.semibold,
  },
  field: { gap: space.sm },
  fieldLabel: {
    fontSize: fontSize.xs - 1,
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: fontWeight.semibold,
  },
  fieldBody: { gap: space.xs },
  readOnlyValue: { color: colors.text, fontFamily: fonts.mono, fontSize: fontSize.body },
  segmented: { flexDirection: "row", gap: space.xs },
  segment: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: "center",
  },
  segmentActive: { backgroundColor: colors.surface2, borderColor: colors.text },
  segmentText: { color: colors.muted, fontWeight: fontWeight.semibold },
  segmentTextActive: { color: colors.text },
  numInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: space.sm,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: fontSize.sm,
  },
  rangeHint: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fonts.mono },
  tpRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  tpLabel: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fonts.mono, width: 32 },
  tpInput: { flex: 1 },
  removeBtn: {
    width: 28, height: 28, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  removeBtnText: { color: colors.muted, fontSize: 18, fontWeight: fontWeight.semibold },
  addBtn: { paddingVertical: space.sm },
  addBtnText: { color: colors.muted, fontWeight: fontWeight.semibold },
  signalLeverage: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fonts.mono },
  sizingBlock: {
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(143,161,179,0.06)",
    gap: 4,
  },
  sizingLabel: {
    fontSize: fontSize.xs - 1,
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: fontWeight.semibold,
    marginBottom: space.xs,
  },
  sizingRow: { flexDirection: "row", justifyContent: "space-between" },
  sizingRowLabel: { color: colors.muted, fontSize: fontSize.sm },
  sizingRowValue: { color: colors.text, fontFamily: fonts.mono, fontSize: fontSize.sm },
  sizingRowValueWarn: { color: colors.warning },
  warningText: { color: colors.warning, fontSize: fontSize.xs, fontFamily: fonts.mono, marginTop: space.xs },
  notes: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fonts.mono, fontStyle: "italic" },
});
```

- [ ] **Step 2: tsc check**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: `TSC=OK`. (No tests — RN component, visual verification on phone in T12.)

- [ ] **Step 3: Verify theme exports**

```bash
cd ~/lazytrader-app && grep -nE "warning\b" src/theme/*.ts | head -5
```

Expected: `colors.warning` and `colors.warningBg` already exported (used by NetBadge "Devnet" warn chip in M3). If missing, add them to `src/theme/colors.ts`.

- [ ] **Step 4: Commit**

```bash
cd ~/lazytrader-app
git add src/components/ParsedSignalCard.tsx
git commit -m "feat(ui): add ParsedSignalCard component

Controlled editable display of ParsedSignal: source/multi-trade chips,
read-only pair, segmented direction toggle, editable entry/SL/TPs
(numeric inputs + add/remove buttons up to 10 TPs), signalLeverage
info line, read-only sizing preview block (margin/leverage/risk with
cap-binds warning chip per spec §9), free-form notes.

No internal state — parent owns ParsedSignal + sizing math.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: SettingsScreen — AI Fallback card

**Files:**
- Modify: `src/screens/SettingsScreen.tsx`

**Why:** Adds the provider radio + key SecretInput per spec §11. Mirrors the M3 Birdeye Data Sources card.

- [ ] **Step 1: Replace `src/screens/SettingsScreen.tsx`**

Open `src/screens/SettingsScreen.tsx` and replace its contents with:

```tsx
// src/screens/SettingsScreen.tsx
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { NetBadge } from "../components/NetBadge";
import { ScreenBackdrop } from "../components/ScreenBackdrop";
import { SecretInput } from "../components/SecretInput";
import { WalletChip } from "../components/WalletChip";
import { fetchBirdeyeCandles, BirdeyeAuthError } from "../data/birdeye";
import { fetchClaudeParse } from "../parser/claudeAdapter";
import { fetchOpenAiParse } from "../parser/openaiAdapter";
import { LlmAuthError } from "../parser/llm";
import {
  clearBirdeyeApiKey, getBirdeyeApiKey, setBirdeyeApiKey,
  clearClaudeApiKey, getClaudeApiKey, setClaudeApiKey,
  clearOpenAiApiKey, getOpenAiApiKey, setOpenAiApiKey,
  getLlmProvider, setLlmProvider, type LlmProvider,
} from "../storage/secureSettings";
import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

const SOL_TEST_PAIR = {
  base: "SOL", quote: "USD",
  pyth: { pythSymbol: "Crypto.SOL/USD", pythFeedId: "" },
  birdeyeTokenAddress: "So11111111111111111111111111111111111111112",
};

export function SettingsScreen() {
  // Birdeye state (M3, unchanged)
  const [savedBirdeyeKey, setSavedBirdeyeKey] = useState<string | null>(null);
  const [draftBirdeyeKey, setDraftBirdeyeKey] = useState("");
  const [savingBirdeye, setSavingBirdeye] = useState(false);
  const [birdeyeStatus, setBirdeyeStatus] = useState<string | null>(null);

  // LLM state (M4)
  const [provider, setProvider] = useState<LlmProvider>("claude");
  const [savedClaudeKey, setSavedClaudeKey] = useState<string | null>(null);
  const [savedOpenAiKey, setSavedOpenAiKey] = useState<string | null>(null);
  const [draftLlmKey, setDraftLlmKey] = useState("");
  const [savingLlm, setSavingLlm] = useState(false);
  const [llmStatus, setLlmStatus] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const bk = await getBirdeyeApiKey();
      setSavedBirdeyeKey(bk);
      setDraftBirdeyeKey(bk ?? "");

      const p = (await getLlmProvider()) ?? "claude";
      setProvider(p);
      const ck = await getClaudeApiKey();
      const ok = await getOpenAiApiKey();
      setSavedClaudeKey(ck);
      setSavedOpenAiKey(ok);
      setDraftLlmKey((p === "claude" ? ck : ok) ?? "");
    })();
  }, []);

  // ─── Birdeye handlers (unchanged from M3) ────────────────
  const handleBirdeyeSave = async () => {
    setSavingBirdeye(true);
    setBirdeyeStatus("Testing key…");
    try {
      const now = Math.floor(Date.now() / 1000);
      await fetchBirdeyeCandles({
        pair: SOL_TEST_PAIR,
        tf: "1H",
        fromUnix: now - 3600,
        toUnix: now,
        apiKey: draftBirdeyeKey.trim(),
      });
      await setBirdeyeApiKey(draftBirdeyeKey);
      setSavedBirdeyeKey(draftBirdeyeKey.trim());
      setBirdeyeStatus("Saved · key valid");
    } catch (e) {
      if (e instanceof BirdeyeAuthError) {
        setBirdeyeStatus("Key invalid — not saved");
      } else {
        await setBirdeyeApiKey(draftBirdeyeKey);
        setSavedBirdeyeKey(draftBirdeyeKey.trim());
        setBirdeyeStatus(`Saved · couldn't verify (${(e as Error).message.slice(0, 60)})`);
      }
    } finally {
      setSavingBirdeye(false);
    }
  };
  const handleBirdeyeClear = async () => {
    try {
      await clearBirdeyeApiKey();
      setSavedBirdeyeKey(null);
      setDraftBirdeyeKey("");
      setBirdeyeStatus("Cleared");
    } catch (e) {
      setBirdeyeStatus(`Couldn't clear: ${(e as Error).message.slice(0, 60)}`);
    }
  };

  // ─── LLM handlers (M4) ───────────────────────────────────
  const handleProviderSwitch = async (next: LlmProvider) => {
    setProvider(next);
    await setLlmProvider(next);
    setDraftLlmKey((next === "claude" ? savedClaudeKey : savedOpenAiKey) ?? "");
    setLlmStatus(null);
  };

  const handleLlmSave = async () => {
    setSavingLlm(true);
    setLlmStatus("Testing key…");
    try {
      // Probe with a tiny request — both providers schema-validate the response,
      // so a 200 + parseable result confirms the key works for our use case.
      if (provider === "claude") {
        await fetchClaudeParse("LONG BTCUSDT entry 70000 SL 69000 TP 71000", draftLlmKey.trim());
        await setClaudeApiKey(draftLlmKey);
        setSavedClaudeKey(draftLlmKey.trim());
      } else {
        await fetchOpenAiParse("LONG BTCUSDT entry 70000 SL 69000 TP 71000", draftLlmKey.trim());
        await setOpenAiApiKey(draftLlmKey);
        setSavedOpenAiKey(draftLlmKey.trim());
      }
      setLlmStatus("Saved · key valid");
    } catch (e) {
      if (e instanceof LlmAuthError) {
        setLlmStatus("Key invalid — not saved");
      } else {
        // Network/rate-limit/schema — save anyway with a warning, mirrors Birdeye behavior
        if (provider === "claude") {
          await setClaudeApiKey(draftLlmKey);
          setSavedClaudeKey(draftLlmKey.trim());
        } else {
          await setOpenAiApiKey(draftLlmKey);
          setSavedOpenAiKey(draftLlmKey.trim());
        }
        setLlmStatus(`Saved · couldn't verify (${(e as Error).message.slice(0, 60)})`);
      }
    } finally {
      setSavingLlm(false);
    }
  };

  const handleLlmClear = async () => {
    try {
      if (provider === "claude") {
        await clearClaudeApiKey();
        setSavedClaudeKey(null);
      } else {
        await clearOpenAiApiKey();
        setSavedOpenAiKey(null);
      }
      setDraftLlmKey("");
      setLlmStatus("Cleared");
    } catch (e) {
      setLlmStatus(`Couldn't clear: ${(e as Error).message.slice(0, 60)}`);
    }
  };

  const birdeyeFallbackEnabled = savedBirdeyeKey !== null && savedBirdeyeKey.length > 0;
  const activeKey = provider === "claude" ? savedClaudeKey : savedOpenAiKey;
  const llmConfigured = activeKey !== null && activeKey.length > 0;
  const providerHelperUrl = provider === "claude" ? "console.anthropic.com" : "platform.openai.com";

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
          <Row label="Birdeye fallback" right={<Badge text={birdeyeFallbackEnabled ? "● Enabled" : "○ Disabled"} />} />
          <View style={styles.cardBody}>
            <SecretInput
              value={draftBirdeyeKey}
              onChangeText={setDraftBirdeyeKey}
              placeholder="Birdeye API key"
              helperText={birdeyeStatus ?? (birdeyeFallbackEnabled ? "Key saved" : "Get a key at birdeye.so/developers")}
              onSave={handleBirdeyeSave}
              onClear={handleBirdeyeClear}
              saving={savingBirdeye}
              saveDisabled={draftBirdeyeKey.trim() === (savedBirdeyeKey ?? "")}
            />
          </View>
        </Section>

        <Section title="AI Fallback">
          <Row
            label="Provider"
            right={
              <View style={styles.segmentRow}>
                <Pressable
                  style={[styles.segmentSm, provider === "claude" && styles.segmentSmActive]}
                  onPress={() => void handleProviderSwitch("claude")}
                >
                  <Text style={[styles.segmentSmText, provider === "claude" && styles.segmentSmTextActive]}>Claude</Text>
                </Pressable>
                <Pressable
                  style={[styles.segmentSm, provider === "gpt-4o-mini" && styles.segmentSmActive]}
                  onPress={() => void handleProviderSwitch("gpt-4o-mini")}
                >
                  <Text style={[styles.segmentSmText, provider === "gpt-4o-mini" && styles.segmentSmTextActive]}>OpenAI</Text>
                </Pressable>
              </View>
            }
          />
          <Row label="Status" right={<Badge text={llmConfigured ? "● Configured" : "○ Not configured"} />} />
          <View style={styles.cardBody}>
            <SecretInput
              value={draftLlmKey}
              onChangeText={setDraftLlmKey}
              placeholder={provider === "claude" ? "sk-ant-..." : "sk-..."}
              helperText={llmStatus ?? (llmConfigured ? "Key saved" : `Get a key at ${providerHelperUrl}`)}
              onSave={handleLlmSave}
              onClear={handleLlmClear}
              saving={savingLlm}
              saveDisabled={draftLlmKey.trim() === (activeKey ?? "")}
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
  section: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" },
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
  segmentRow: { flexDirection: "row", gap: 4 },
  segmentSm: {
    paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg,
  },
  segmentSmActive: { backgroundColor: colors.surface2, borderColor: colors.text },
  segmentSmText: { color: colors.muted, fontSize: fontSize.xs - 1, fontWeight: fontWeight.semibold },
  segmentSmTextActive: { color: colors.text },
});
```

- [ ] **Step 2: tsc check**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit && echo "TSC=OK"
```

Expected: `TSC=OK`.

- [ ] **Step 3: Tests still green**

```bash
cd ~/lazytrader-app && pnpm test 2>&1 | tail -5
```

Expected: 185 tests still passing (no new tests for this task).

- [ ] **Step 4: Commit**

```bash
cd ~/lazytrader-app
git add src/screens/SettingsScreen.tsx
git commit -m "feat(settings): add AI Fallback card with provider radio + key flow

New 'AI Fallback' card slotted between Data Sources and Risk. Provider
segmented control (Claude / OpenAI); separate stored keys per provider;
switching providers preserves both keys, just routes the active one.

Save handler probes the active provider's adapter with a tiny test
payload (LONG BTCUSDT signal). 401 → 'Key invalid' don't save. Network
or schema error → save with warning, mirroring M3's Birdeye behavior.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: CaptureScreen — wire Parse button + ParsedSignalCard

**Files:**
- Modify: `src/screens/CaptureScreen.tsx`

**Why:** The integration task. Adds Parse button + state machine, calls pipeline.parsePipeline, renders ParsedSignalCard with sizing math, removes M3's makeStubbedSignal, wires edited values into generateSignalVerification.

- [ ] **Step 1: Replace `src/screens/CaptureScreen.tsx`**

Open `src/screens/CaptureScreen.tsx` and replace its contents with:

```tsx
// src/screens/CaptureScreen.tsx
import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { DetailsAccordion, type DetailFactor } from "../components/DetailsAccordion";
import { FactorChips, type FactorChip, type FactorSeverity } from "../components/FactorChips";
import { MultiTimeframeDashboard, type DashboardRow } from "../components/MultiTimeframeDashboard";
import { NetBadge } from "../components/NetBadge";
import { PairInput } from "../components/PairInput";
import { ParsedSignalCard, type SizingPreview } from "../components/ParsedSignalCard";
import { PrimaryCTA } from "../components/PrimaryCTA";
import { RatingHeroCard } from "../components/RatingHeroCard";
import { ScreenBackdrop } from "../components/ScreenBackdrop";
import { SizingStrip } from "../components/SizingStrip";
import { UploadScreenshotButton } from "../components/UploadScreenshotButton";
import { WalletChip } from "../components/WalletChip";
import { fetchCandlesForEngine, latestClose, NoCandlesError } from "../data/feed";
import type { ResolvedPair } from "../data/pairs";
import { ParseError, parsePipeline } from "../parser/pipeline";
import type { ParsedSignal } from "../parser/schema";
import { generateSignalVerification } from "../smc";
import type { SignalInput, SignalVerificationReport } from "../smc";
import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

const ACCOUNT_BALANCE = 1000;        // M8 makes editable
const MAX_RISK_PCT = 1.0;            // M8 makes editable
const MAX_LEVERAGE = 25;             // M8 makes editable

/**
 * Capture screen — paste/upload signal → Parse → editable card → Verify → engine.
 *
 * M4: live parser via parsePipeline (regex with LLM fallback). Sizing preview
 * is read-only and derived from edited fields + global risk settings.
 */
export function CaptureScreen() {
  const [pairText, setPairText] = useState("");
  const [resolvedPair, setResolvedPair] = useState<ResolvedPair | null>(null);
  const [signalText, setSignalText] = useState("");
  const [parsed, setParsed] = useState<ParsedSignal | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseErrorMsg, setParseErrorMsg] = useState<string | null>(null);
  const [report, setReport] = useState<SignalVerificationReport | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sizing = useMemo<SizingPreview | null>(() => {
    if (!parsed) return null;
    const slDistancePct = Math.abs(parsed.entry - parsed.stopLoss) / parsed.entry;
    if (!Number.isFinite(slDistancePct) || slDistancePct === 0) return null;
    const riskAmount = ACCOUNT_BALANCE * (MAX_RISK_PCT / 100);
    const notional = riskAmount / slDistancePct;
    const idealLeverage = notional / ACCOUNT_BALANCE;
    const cappedLeverage = Math.min(idealLeverage, MAX_LEVERAGE);
    const cappedMargin = notional / cappedLeverage;
    const actualRisk = cappedMargin * cappedLeverage * slDistancePct;
    const capBinds = idealLeverage > MAX_LEVERAGE;
    return {
      margin: cappedMargin,
      leverage: Math.round(cappedLeverage),
      risk: actualRisk,
      riskPct: (actualRisk / ACCOUNT_BALANCE) * 100,
      capBinds,
      intendedRiskPct: MAX_RISK_PCT,
      maxLeverage: MAX_LEVERAGE,
    };
  }, [parsed]);

  const verifyDisabled =
    analyzing ||
    parsed === null ||
    resolvedPair === null ||
    resolvedPair.pyth === null ||
    sizing === null;

  const onParse = async () => {
    if (!signalText.trim()) return;
    setParsing(true);
    setParseErrorMsg(null);
    setParsed(null);
    setReport(null);
    abortRef.current = new AbortController();
    try {
      const result = await parsePipeline(signalText, abortRef.current.signal);
      if (result.ok) {
        setParsed(result.parsed);
        // Auto-fill PairInput if it was empty
        if (!pairText.trim()) {
          setPairText(result.parsed.pair);
          // Note: PairInput.onResolve will fire on its own next blur; we don't
          // synthesize it here. User can tap into PairInput to trigger blur if
          // they want immediate validation, or just tap Parse-then-Verify.
        }
      } else {
        setParseErrorMsg(parseErrorToMessage(result.error, result.detail));
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setParseErrorMsg(null); // user cancelled — silent
      } else {
        setParseErrorMsg((e as Error).message);
      }
    } finally {
      setParsing(false);
      abortRef.current = null;
    }
  };

  const onCancelParse = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setParsing(false);
  };

  const verify = async () => {
    if (!parsed || !resolvedPair?.pyth || !sizing) return;
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
      const finalSignal: SignalInput = {
        pair: `${resolvedPair.base}${resolvedPair.quote}`,
        direction: parsed.direction,
        entry: parsed.entry,
        stopLoss: parsed.stopLoss,
        takeProfits: parsed.takeProfits,
        leverage: sizing.leverage,
      };
      const result = generateSignalVerification({
        signal: finalSignal,
        candleData,
        currentPrice,
        accountBalance: ACCOUNT_BALANCE,
        riskRules: { maxRiskPct: MAX_RISK_PCT, maxLeverage: MAX_LEVERAGE },
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
              Paste a signal, tap Parse, review, then Verify against live data.
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

            <View style={styles.parseRow}>
              <Pressable
                onPress={onParse}
                disabled={parsing || !signalText.trim()}
                style={[styles.parseBtn, (parsing || !signalText.trim()) && styles.parseBtnDisabled]}
              >
                <Text style={styles.parseBtnText}>{parsing ? "Parsing…" : "Parse signal"}</Text>
              </Pressable>
              {parsing && (
                <Pressable onPress={onCancelParse} style={[styles.parseBtn, styles.parseBtnSecondary]}>
                  <Text style={[styles.parseBtnText, styles.parseBtnTextSecondary]}>Cancel</Text>
                </Pressable>
              )}
            </View>

            {parseErrorMsg !== null && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>Parser error</Text>
                <Text style={styles.errorBody}>{parseErrorMsg}</Text>
              </View>
            )}

            {parsed !== null && (
              <ParsedSignalCard
                value={parsed}
                onChange={setParsed}
                sizing={sizing}
              />
            )}

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

        {report !== null && <ReportView report={report} onReset={() => { setReport(null); setParsed(null); setSignalText(""); setPairText(""); }} />}
      </ScrollView>
    </ScreenBackdrop>
  );
}

function parseErrorToMessage(err: ParseError, detail?: string): string {
  switch (err) {
    case ParseError.NoLlmConfig:
      return "AI fallback not configured — set up Claude or OpenAI in Settings, or use a signal format the regex understands.";
    case ParseError.AuthInvalid:
      return "AI key invalid — check Settings.";
    case ParseError.RateLimited:
      return "AI rate-limited — try again in a moment.";
    case ParseError.Malformed:
      return `AI returned malformed data${detail ? ` (${detail.slice(0, 80)})` : ""} — try paste again.`;
    case ParseError.Network:
      return `Couldn't reach AI${detail ? ` (${detail.slice(0, 80)})` : ""} — check your network.`;
  }
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

// ─── Engine → component adapters (UNCHANGED from M3) ──────
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
  return { size: ps.positionSize, risk: ps.riskAmount, riskPct: ps.riskPct, slPct: ps.slDistancePct };
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
  parseRow: { flexDirection: "row", gap: space.sm },
  parseBtn: {
    flex: 1, paddingVertical: space.sm, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
    alignItems: "center",
  },
  parseBtnDisabled: { opacity: 0.4 },
  parseBtnSecondary: { backgroundColor: "transparent" },
  parseBtnText: { color: colors.text, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  parseBtnTextSecondary: { color: colors.muted },
  errorBox: {
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.danger,
    backgroundColor: colors.dangerBg, padding: space.md,
  },
  errorTitle: { fontWeight: fontWeight.bold, color: colors.danger, marginBottom: 4 },
  errorBody: { color: colors.danger, fontFamily: fonts.mono, fontSize: fontSize.sm },
});
```

- [ ] **Step 2: tsc check + tests still green**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit && echo "TSC=OK" && pnpm test 2>&1 | tail -5
```

Expected: TSC=OK, 185 tests still passing (no new tests this task; UI verified on phone in T12).

- [ ] **Step 3: Commit**

```bash
cd ~/lazytrader-app
git add src/screens/CaptureScreen.tsx
git commit -m "feat(capture): wire Parse button + ParsedSignalCard + state machine

Adds 'Parse signal' button between textarea and Verify. State machine:
blank → ready-to-parse → parsing → parsed → verifying → report.
Cancel button surfaces during parsing (AbortController on the LLM
fetch). PairInput auto-fills from parsed.pair if it was empty.

ParsedSignalCard renders below the input card when parse succeeds;
sizing preview is computed live from edited entry/SL via the
position-sizing math in spec §9. Verify button gated on parsed
signal + resolved Pyth pair + valid sizing.

makeStubbedSignal removed from the verify path. CaptureScreen now
builds finalSignal from the (possibly edited) ParsedSignal + chosen
leverage from the sizing block.

ParseError enum mapped to friendly user-facing messages.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Phone hot-reload verification + cleanup

**Files:** none (verification only).

**Why:** Manual confirmation that the wire works on real device. Existing dev APK from M3 (live.lazytrader@1.0.0) already has all native deps — no APK reinstall needed.

- [ ] **Step 1: Verify Metro is up**

```bash
lsof -iTCP:8081 -sTCP:LISTEN | awk 'NR>1' || echo "METRO DOWN — restart from M3 T03 step 4"
```

- [ ] **Step 2: Reconnect phone if needed**

Get current connect port from phone's Wireless Debugging screen, then:

```bash
adb connect 100.84.228.67:<port>
adb devices
```

- [ ] **Step 3: Manual verification matrix**

Open `live.lazytrader` on phone. Walk these scenarios:

1. **Regex happy path — Sheldon (DOGE template A)**
   - Capture → paste signal #1 (DOGE Sheldon) into textarea → tap Parse signal
   - **Expected:** ParsedSignalCard renders with chip "by regex", pair=DOGEUSDT, direction=LONG (segmented), entry=0.103, SL=0.095, TP1=0.12, TP2=0.135, no signalLeverage line (null), notes empty/null
   - PairInput autofills to "DOGEUSDT" with green chip
   - Sizing preview shows margin/leverage/risk based on $1000 × 1% / SL distance

2. **Regex happy path — emoji USDT (#2 APT template B)**
   - Paste signal #2 (APT) → Parse → expect chip "by regex", pair=APTUSDT, direction=LONG, entry≈0.99535, SL=0.9626, takeProfits=6 entries, signalLeverage line "Signal said: 20×"

3. **Regex happy path — Nasdaq75 (#5 ETH template C)**
   - Paste signal #5 (ETH SHORT) → Parse → chip "by regex", pair=ETHUSDT, direction=SHORT, entry=2347.5, SL=2410, 6 EXIT TPs

4. **Regex happy path — Langestrom (#8 PENGU template D)**
   - Paste signal #8 (PENGU LONG) → Parse → chip "by regex", pair=PENGUUSDT, 2 TPs, signalLeverage 40×, notes "Entry: MARKET; SL-BE at TP1"

5. **Regex happy path — Kapoor (#17 AAVE template E)**
   - Paste signal #17 (AAVE Kapoor) → Parse → chip "by regex", pair=AAVEUSDT, direction=LONG (inferred), entry=98.7, SL=95.73, TP1=105.8, TP2=114.02

6. **LLM fallback — multi-trade (#7) WITHOUT key configured**
   - Settings → confirm AI Fallback is "○ Not configured"
   - Capture → paste signal #7 (BTC multi-trade) → Parse
   - **Expected:** parser error box: "AI fallback not configured — set up Claude or OpenAI in Settings, or use a signal format the regex understands."

7. **LLM fallback — multi-trade (#7) WITH key configured**
   - Settings → AI Fallback → pick Claude → paste your Anthropic API key → Save → expect "Saved · key valid", badge "● Configured"
   - Capture → paste signal #7 → Parse → spinner ~1-3s → ParsedSignalCard renders with chip "by Claude", chip "multi-trade · first parsed", pair=BTCUSDT, direction=SHORT, entry=80276, SL=81276, TP1=50276 (first trade only, multipleTrades=true)

8. **Cancel during LLM**
   - Paste signal #7 again (new parse) → tap Parse → tap Cancel mid-spinner → expect spinner stops, no card renders, no error box (silent)

9. **Edit + Verify**
   - Use any successful parse → edit one TP value (e.g. change TP1 from 0.12 to 0.13) → tap Verify
   - **Expected:** engine analysis runs (~1-3s), ReportView renders. R:R chip should reflect the edited TP.

10. **Sizing cap binds**
    - Use a signal with a tight SL (e.g. AAVE Kapoor: entry 98.7 / SL 95.73 = 3% distance — won't bind, leverage ~33x but capped at 25x). Try a tighter one if available, or hand-edit SL to be very close to entry (e.g. SL 98.0 → 0.7% distance → would need ~143x → capped at 25x).
    - **Expected:** sizing preview shows leverage "25× (at your cap)", risk row in warning color, warning text below: "SL too tight for 1% risk budget at 25× cap — actual risk: X.XX%"

11. **Engine fixtures still green**
    ```bash
    cd ~/lazytrader-app && pnpm test 2>&1 | tail -5
    ```
    Expected: 185 tests, all passing.

- [ ] **Step 4: Final tsc + test sweep**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit && echo "TSC=OK" && pnpm test 2>&1 | tail -5
```

Expected: TSC=OK, 185 tests passing.

- [ ] **Step 5: Cleanup pass**

```bash
# Confirm no untracked junk in repo:
cd ~/lazytrader-app && git status --short
# Remove any /tmp artifacts from earlier sessions:
rm -f /tmp/lazytrader-dev.apk /tmp/lazytrader-*.apk /tmp/apk-install*.log /tmp/eas-m4-build.log
ls /tmp/lazytrader* /tmp/apk-install* 2>&1 | head -3 || echo "tmp clean"
```

Expected: `git status --short` empty (all task commits in, no leftovers).

- [ ] **Step 6: Update session-resume memory**

Update `~/.claude/projects/-/memory/project_lazytrader_session_resume.md`:
- Top commit SHA + summary of M4 commits
- Milestone state row: **M4 Parser pipeline** → ✅ done
- Phone state confirmation
- Next milestone target: M5 wallet connect (MWA)

Commit-cadence reminder: never push without Dexter's explicit "push it". M4 is done locally; he'll decide when to push.

- [ ] **Step 7: Report back to user**

Summary template:

```
M4 done.
- 11 task commits (T1-T11), all green
- 185/185 tests (105 prior + 80 new across schema, normalize, regex, claudeAdapter, openaiAdapter, pipeline)
- Phone verified: regex happy paths for all 5 templates, LLM fallback with [Claude|OpenAI] key, cancel works, edit→Verify works, sizing cap-binds warning shows
- Working tree clean. Awaiting "push it" before pushing to origin.
```

---

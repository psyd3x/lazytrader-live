---
title: M4 Parser Pipeline — Design
description: Replace M3's hardcoded SignalInput stub with a real parser. Two-tier extraction: regex against 5 distinct templates (covers 80% of collected real signals), with cloud-LLM fallback (Claude Haiku OR OpenAI gpt-4o-mini, BYO key, mirrors M3's Birdeye pattern) for any signal regex can't handle. ParsedSignalCard surfaces editable fields + source chip + read-only sizing preview before Verify. Per-trade margin/leverage override deferred to M8.
type: design
project: lazytrader
phase: m4-parser
status: approved
date: 2026-05-04
created: 2026-05-04
tags: [design, lazytrader, m4, parser, regex, llm, claude, openai]
---

# M4 Parser Pipeline — Design

**Related**: [[PRD]] · [[ARCHITECTURE]] · [[IMPLEMENTATION-PLAN]] · [[2026-05-03-m3-live-data-feed-design]] · [[2026-05-03-visual-layer-design]]

## 1. Goal

Replace M3's `makeStubbedSignal` (in `src/screens/CaptureScreen.tsx`) with a real parser that takes pasted/OCR'd signal text and produces a `ParsedSignal` (extending the engine's `SignalInput` shape with display metadata).

After this milestone, pasting a real Telegram signal and tapping a new "Parse signal" button produces an editable card with the extracted fields. User reviews, hits Verify, gets the engine verdict reflecting the parsed signal.

**Hackathon deadline:** 2026-05-11 (7 days).
**Budget:** ~2 days build + ~0.5 day phone verify = 2.5 days. Remaining budget covers M5 wallet + M6 Drift order builder + M7 vertical-slice E2E + M9 demo prep.

## 2. Constraints (Dexter-locked)

1. **Hackathon-realistic scope** — PRD's M4 vision (ExecuTorch + NuExtract + SmolLM2 on-device LLM chain) is 10-30 engineer-days of work. M4 ships regex + cloud-LLM fallback only. On-device LLM is documented as post-hackathon roadmap.
2. **BYO LLM key** — judges don't carry API keys; demo path is "regex parses real signals; LLM fallback exists for novel formats" with the developer optionally testing fallback live. Key UX mirrors M3's Birdeye Data Sources card exactly.
3. **No new native deps** — avoid an EAS Cloud Build detour mid-hackathon. No `@react-native-community/slider`. Margin/leverage override controls are deferred to M8.
4. **Engine unchanged** — `src/smc/*` doesn't need to know parser exists. CaptureScreen still calls `generateSignalVerification` with a `SignalInput` shape.
5. **Secret discipline** — secureSettings remains the only consumer of `expo-secure-store`. New keys (`llmProvider`, `claudeApiKey`, `openaiApiKey`) extend the same wrapper.
6. **Privacy** — raw signal text goes to LLM as-is; no PII stripping theater on text the user pasted into their own app intending to parse.

## 3. Locked decisions

| # | Decision | Why |
|---|----------|-----|
| Q1 | **Scope: regex + cloud-LLM fallback** (option b) | On-device LLM (NuExtract+SmolLM2 via ExecuTorch) is 10-30 days of work; ships nothing in hackathon timeline. Cloud LLM via tool_use/function calling gives ~95% accuracy at trivial implementation cost. |
| Q2 | **Key UX: BYO key, mirrors M3 Birdeye exactly** | Demo narrative cohesive with M3; no key-leak surface in APK; user owns their cost. Judges see the architecture, developer demos fallback live with own key. |
| Q3 | **Provider: Claude Haiku OR OpenAI gpt-4o-mini, user picks one in Settings** | Both have first-class structured-output support (Anthropic `tool_use`, OpenAI function calling) — guaranteed valid JSON, no parse-and-pray. Single radio in Settings; secureSettings stores both keys separately, active provider is a flag. |
| Q4 | **UX flow: explicit "Parse signal" button, visible field population, editable** (option b) | Auto-magic on blur reads cleaner but judges can't see the parser working. Explicit Parse tap gives a natural moment to surface "regex didn't catch this format, falling back to Claude" narrative when LLM fires. Inline review screen is over-engineered for the demo. |
| Q5 | **Gate: strict regex first, all-or-nothing LLM fallback** (option a) | Predictable cost (LLM only fires on full miss). "by regex / by Claude / by gpt-4o-mini" chip on parsed card surfaces what happened. Confidence-graded fallback is harder to demo cleanly and adds branching. |
| Q6 | **Required fields gate: 5/5 strict** (option a) | Pair, direction, entry, stopLoss, ≥1 TP all required from regex; any miss → LLM. Pair-tolerant gate (option b) saves LLM calls when user already typed pair, but adds bookkeeping. Strict is simpler and more defensible. |
| Q7 | **Range collapse rules** | Entry → midpoint. SL → bound closer to entry (tighter stop, less drawdown tolerance). TP single range → bound closer to entry (lock profit early). Multiple TPs → keep all in `takeProfits[]`. Leverage range → midpoint (informational only). Multi-trade message → first trade only + `multipleTrades=true` flag. |
| Q8 | **Leverage decoupling** | Parser extracts signal's stated leverage as informational metadata. Engine derives the actually-used leverage from position-sizing math (`riskAmount / slDistancePct`), clamped to `maxLeverage`. UI shows "Signal said: 20x · We're using 10x" line. |
| Q9 | **Per-trade margin/leverage override controls — DROPPED for M4** | User's intuition: just display the sizing math read-only; the real "Confirm trade" gate lives in M5/M6 wallet+order flow. M4 sizing preview is read-only. M8 may revisit. |
| Q10 | **Sizing display when cap binds** (the "derivedLeverage > maxLeverage" case) | Engine clamps to maxLeverage, computes the resulting smaller actual risk %, displays it with a warning chip ("SL too tight for 1% risk budget at 25x cap — actual risk: 0.5%"). No user choice for M4. |

## 4. Architecture

```
src/
  parser/
    schema.ts            NEW — Zod ParsedSignal schema + TS types (single source of truth)
    regex.ts             NEW — per-template patterns + extractor → { fields, hitMap }
    normalize.ts         NEW — range collapse rules, midpoint, closer-to-entry, helpers
    pipeline.ts          NEW — orchestrator: regex → LLM fallback if any required field misses
    llm.ts               NEW — provider-agnostic interface: parseWithLlm(text, provider, apiKey)
    claudeAdapter.ts     NEW — Claude Haiku tool_use POST to api.anthropic.com
    openaiAdapter.ts     NEW — OpenAI gpt-4o-mini function-calling POST
    __tests__/
      regex.test.ts        replay all 18 unique fixtures against per-template regex
      pipeline.test.ts     gate logic, fallback dispatch (LLM mocked)
      normalize.test.ts    range collapsing math
      schema.test.ts       Zod validation accept/reject
      claudeAdapter.test.ts  mocked-fetch happy path + error classes
      openaiAdapter.test.ts  mocked-fetch happy path + error classes
      __fixtures__/
        signals.json       18 collected signals → expected ParsedSignal outputs

  storage/
    secureSettings.ts    MODIFY — add { llmProvider, claudeApiKey, openaiApiKey }
                         getters/setters; getLlmConfig() resolves to active key

  components/
    ParsedSignalCard.tsx NEW — controlled editable display: source chip, multipleTrades chip,
                         pair (read-only), direction toggle, entry/SL/TPs (editable),
                         signalLeverage info line, read-only sizing preview, notes block
    (PairInput / SecretInput from M3 — REUSED unchanged)

  screens/
    CaptureScreen.tsx    MODIFY — add "Parse signal" button between textarea and Verify;
                         wire pipeline; render ParsedSignalCard when parse succeeds;
                         engine call uses card's edited values + signal's parsed leverage
                         (which engine ignores per Q8)
    SettingsScreen.tsx   MODIFY — add "AI Fallback" card below Data Sources card with
                         Claude/OpenAI radio + SecretInput (mirrors Birdeye flow)

  data/, smc/            UNCHANGED — engine consumes SignalInput as before; sizing logic
                         already in scorer.ts derives leverage from riskRules
```

**Module boundary rules:**

- `regex.ts` is pure, no I/O. Returns `{ fields: Partial<SignalInput>, hitMap: Record<field, boolean> }`. No LLM knowledge.
- `pipeline.ts` is the ONLY file that knows the gate-logic decision tree (regex → LLM dispatch).
- `claudeAdapter.ts` / `openaiAdapter.ts` are the ONLY files that know vendor specifics (URLs, request shape, tool/function schema names, error class mapping).
- `normalize.ts` is the ONLY file that knows how to collapse ranges or infer direction from entry-vs-SL.
- `schema.ts` is the ONLY source of truth for ParsedSignal type + Zod schema; everything else imports from here.
- `secureSettings.ts` remains the ONLY file that imports `expo-secure-store`.
- `ParsedSignalCard.tsx` is dumb: takes a ParsedSignal + onChange callbacks; never calls the parser itself; never touches secureSettings.

**Files NOT touched:** engine (`src/smc/*`), data layer (`src/data/*` from M3), all M3 components except SettingsScreen + CaptureScreen.

## 5. Data flow

```
1.  User pastes signal text into textarea
    (or UploadScreenshotButton → OCR → text — UNCHANGED M3 path)
2.  (Optional) User types pair into PairInput (M3 behavior still works)
3.  User taps "Parse signal" button
4.  pipeline.parse(rawText) runs:
    a. regex.tryAll(rawText)
       → { partial: Partial<SignalInput>, hitMap, sourceTemplate }
    b. If hitMap satisfies the 5-field gate (pair, direction, entry, SL, ≥1 TP)
       → source = "regex", normalize.collapseRanges(partial), done
    c. Else → secureSettings.getLlmConfig()
       → { provider, apiKey } | null
       - If null → return { error: "AI fallback not configured", hint: "Settings" }
       - Else → llm.parse(rawText, provider, apiKey)
         · Dispatches to claudeAdapter or openaiAdapter
         · Returns ParsedSignal with source = provider name
    d. Zod-validate result
       - If invalid → return { error: "AI returned malformed data" }
    e. normalize.collapseRanges() pass (defensive — LLM might emit ranges)
5.  ParsedSignalCard renders the result (or error inline):
    - Source chip ("by regex" / "by Claude" / "by gpt-4o-mini")
    - multipleTrades chip if applicable
    - PairInput autofills if it was empty (otherwise user's typed value wins)
    - All 5 required fields editable (pair read-only since PairInput owns it)
    - signalLeverage info line: "Signal said: 20x"
    - Read-only sizing preview: "Margin: $X · Leverage: Yx · Risk: $Z (W%)"
    - Notes block (free-form parser metadata)
6.  User edits any field (or doesn't); PairInput value flows separately
7.  User taps Verify
8.  CaptureScreen builds final SignalInput from edited ParsedSignal:
    - signal.pair = resolvedPair.base + resolvedPair.quote (from PairInput)
    - signal.direction, entry, stopLoss, takeProfits = card's edited values
    - signal.leverage = parsed signalLeverage (engine ignores, derives its own)
9.  fetchCandlesForEngine + generateSignalVerification (UNCHANGED from M3)
10. ReportView renders (UNCHANGED from M3)
```

## 6. ParsedSignal schema

`src/parser/schema.ts` — Zod schema is the single source of truth. Both regex and LLM outputs validate against it before reaching the UI.

```ts
import { z } from "zod";

export const ParsedSignalSchema = z.object({
  // SignalInput-compatible fields:
  pair: z.string().min(2).max(20),
  direction: z.enum(["long", "short"]),
  entry: z.number().positive(),
  stopLoss: z.number().positive(),
  takeProfits: z.array(z.number().positive()).min(1).max(10),
  leverage: z.number().positive().nullable(),  // signal's STATED leverage; engine derives actual

  // M4 display metadata:
  source: z.enum(["regex", "claude", "gpt-4o-mini"]),
  rawText: z.string(),
  multipleTrades: z.boolean(),
  notes: z.string().nullable(),                  // free-form ("MARKET entry", "SL-BE at TP1")
  entryRange: z.tuple([z.number(), z.number()]).nullable(),  // original if was a range
});

export type ParsedSignal = z.infer<typeof ParsedSignalSchema>;
```

**Note:** `leverage` here is the signal's stated leverage (null if not stated). Engine derives the actually-used leverage downstream from `riskRules.maxRiskPct` + SL distance + `maxLeverage` cap.

## 7. LLM contract

Both providers use **identical JSON Schema** (the `extract_signal` tool/function), called via tool_use (Anthropic) or function calling (OpenAI). Both produce schema-validated JSON — no parse-and-pray on free-form text.

### 7.1 Shared JSON Schema

```json
{
  "type": "object",
  "properties": {
    "pair": {
      "type": "string",
      "description": "Trading pair like BTCUSDT, ETHUSDT, SOLUSDT — base+quote concatenated, no separators. If only the base is in the signal (e.g. just 'BTC' or '#ETH'), append 'USDT' as the quote convention."
    },
    "direction": { "type": "string", "enum": ["long", "short"] },
    "entry": {
      "type": "number",
      "description": "Entry price; if signal gives a range like '70000-71000', return the midpoint."
    },
    "stopLoss": {
      "type": "number",
      "description": "Stop loss price; if signal gives a range, use the bound closer to the entry price (tighter stop)."
    },
    "takeProfits": {
      "type": "array",
      "items": { "type": "number" },
      "minItems": 1,
      "maxItems": 10,
      "description": "Take profit prices in order from nearest to farthest from entry. If a TP is given as a range, use the bound closer to entry."
    },
    "leverage": {
      "type": ["number", "null"],
      "description": "Signal's stated leverage if mentioned (midpoint if range like '5-10x'); null if not stated."
    },
    "multipleTrades": {
      "type": "boolean",
      "description": "True if the message contains multiple distinct trade ideas (different entries/SLs). Extract only the first trade's fields if true."
    },
    "notes": {
      "type": ["string", "null"],
      "description": "Free-form execution notes from the signal (e.g. 'MARKET entry', 'SL-BE at TP1', 'wick entry'). Null if none."
    }
  },
  "required": ["pair", "direction", "entry", "stopLoss", "takeProfits", "multipleTrades"]
}
```

### 7.2 Claude Haiku adapter (`claudeAdapter.ts`)

```http
POST https://api.anthropic.com/v1/messages
x-api-key: <user's claude key>
anthropic-version: 2023-06-01
content-type: application/json
```

```json
{
  "model": "claude-haiku-4-5",
  "max_tokens": 1024,
  "tools": [{
    "name": "extract_signal",
    "description": "Extract structured trade signal fields from raw text",
    "input_schema": { /* shared schema from §7.1 */ }
  }],
  "tool_choice": { "type": "tool", "name": "extract_signal" },
  "messages": [{ "role": "user", "content": "<rawText>" }]
}
```

Response handling: look for `content[].type === "tool_use"` with `name === "extract_signal"`, extract `input` object. Set `source = "claude"`, `rawText = original input`.

Errors:
- 401 → `LlmAuthError`
- 429 → `LlmRateLimitError`
- non-2xx → `LlmError(status, body.slice(0, 200))`
- No `tool_use` block in response → `LlmSchemaError`
- `tool_use.input` fails Zod validation → `LlmSchemaError`

### 7.3 OpenAI gpt-4o-mini adapter (`openaiAdapter.ts`)

```http
POST https://api.openai.com/v1/chat/completions
Authorization: Bearer <user's openai key>
content-type: application/json
```

```json
{
  "model": "gpt-4o-mini",
  "messages": [
    {
      "role": "system",
      "content": "You extract structured trade signal fields from messy social-media text. Use the extract_signal function. If unsure about a field, prefer null over guessing wrong; for required fields, make your best guess."
    },
    { "role": "user", "content": "<rawText>" }
  ],
  "tools": [{
    "type": "function",
    "function": {
      "name": "extract_signal",
      "parameters": { /* shared schema from §7.1 */ }
    }
  }],
  "tool_choice": { "type": "function", "function": { "name": "extract_signal" } }
}
```

Response handling: `choices[0].message.tool_calls[0].function.arguments` is a JSON string; `JSON.parse` it. Set `source = "gpt-4o-mini"`, `rawText = original input`.

Errors: same class hierarchy as Claude (`LlmAuthError`/`LlmRateLimitError`/`LlmError`/`LlmSchemaError`).

### 7.4 Error class hierarchy (`llm.ts`)

```ts
export class LlmError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message); this.name = "LlmError";
  }
}
export class LlmAuthError extends LlmError {
  constructor(message: string) { super(message, 401); this.name = "LlmAuthError"; }
}
export class LlmRateLimitError extends LlmError {
  constructor(message: string) { super(message, 429); this.name = "LlmRateLimitError"; }
}
export class LlmSchemaError extends LlmError {
  constructor(message: string) { super(message); this.name = "LlmSchemaError"; }
}
```

### 7.5 Provider-agnostic interface (`llm.ts`)

```ts
export type LlmProvider = "claude" | "gpt-4o-mini";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
}

/** Dispatch to the right adapter based on provider. */
export async function parseWithLlm(
  rawText: string,
  config: LlmConfig,
  signal?: AbortSignal,
): Promise<ParsedSignal>;
```

The `AbortSignal` lets the UI cancel an in-flight LLM call if the user taps Cancel.

## 8. Regex templates

The 18 unique signals in `__fixtures__/signals.json` cluster into **5 templates regex can target** (15 fixtures) + **3 edge cases that fall through to LLM**.

### 8.1 Template A — Sheldon narrative

**Signals:** #1 DOGE, #4 ALGO, #16 COIN
**Discriminator:** `Chart #\d+\s*[–-]\s*[A-Za-z]+\s*\([A-Z0-9]+\)` header AND `Chartist:\s*Sheldon`
**Quirks:** entry phrased as "at around $X" or "at the current $X" or "at the break and retest of $X"; SL phrased as "Just below $X"; TPs as `$A - $B (X% - Y%)` ranges.

**Patterns:**
```ts
const PAIR_RE = /Chart\s*#\d+\s*[–-]\s*[A-Za-z]+\s*\(([A-Z0-9]+)\)/;
const DIRECTION_RE = /(long|short)\s+spot\s+trade/i;
// Entry: extract first $-amount on the "Entry:" line
const ENTRY_LINE_RE = /Entry:\s*([^\n]+)/;
const FIRST_DOLLAR_RE = /\$?([\d,]+\.?\d*)/;
// Stop loss: extract first $-amount on the "Stop Loss:" line
const STOPLOSS_LINE_RE = /Stop\s*Loss:\s*([^\n]+)/;
// TPs: TP\d+: $A - $B (X% - Y%) — capture both bounds
const TP_RE = /TP\d+:\s*\$?([\d,.]+)(?:\s*[-–]\s*\$?([\d,.]+))?(?:\s*\([^)]*\))?/g;
```

**Extraction rules:**
- Pair: regex group 1, e.g. "DOGEUSDT", "ALGOUSDT", "COIN" (stock — passes through; engine's resolveToPythFeed will reject unsupported)
- Direction: lowercase regex match
- Entry: parse first $-amount in the Entry line (handles "around $X", "at $X", "current $X" etc); apply `parseDollarsAmount`
- StopLoss: parse first $-amount in the Stop Loss line ("Just below $X" → just take $X)
- TakeProfits: iterate TP regex matches; for each, if both bounds matched apply `closerToEntry(low, high, entry, side, "tp")`; else use the single value

### 8.2 Template B — emoji USDT bot

**Signals:** #2 APT, #3 AVAX, #15 TRX
**Discriminator:** `Pairs?:\s*[A-Z]+\s*\/\s*[A-Z]+` AND `Trade\s*Type\s*=\s*(LONG|SHORT)` AND `Entry\s*=\s*\[`
**Quirks:** all 6 TPs in a comma-array; entry always `[ X TO Y ]`; fixed leverage (no ranges seen in samples).

**Patterns:**
```ts
const PAIR_RE = /Pairs?:\s*([A-Z]+)\s*\/\s*([A-Z]+)/;
const DIRECTION_RE = /Trade\s*Type\s*=\s*(LONG|SHORT)/i;
const LEVERAGE_RE = /Leverage\s*:?-?\s*(\d+)x/i;
const ENTRY_RANGE_RE = /Entry\s*=\s*\[\s*([\d.]+)\s*TO\s*([\d.]+)\s*\]/i;
const STOPLOSS_RE = /StopLoss\s*:?-?\s*([\d.]+)/i;
const TAKEPROFIT_BLOCK_RE = /Take\s*profit\s*=\s*\[([^\]]+)\]/i;
```

**Extraction rules:**
- Pair: group 1 + group 2 → "APTUSDT" (concatenate base+quote)
- Direction: lowercase
- Leverage: `parseInt(match[1])`
- Entry: midpoint of two range bounds
- StopLoss: single value
- TakeProfits: split inside brackets on `,` → `parseFloat` each → array

### 8.3 Template C — Nasdaq75 Blofin

**Signals:** #5 ETH, #12 LIT, #13 ZEN, #14 ZEN
**Discriminator:** `#[A-Z]+\s*\(Blofin\)` AND `(SHORT|LONG):\s*\d+(-\d+)?x`
**Quirks:** EXIT (not TP) as slash-list; leverage as range like `5-10x`; pair stripped of quote suffix.

**Patterns:**
```ts
const PAIR_RE = /#([A-Z]+)\s*\(Blofin\)/i;
const DIRECTION_LEV_RE = /(SHORT|LONG):\s*(\d+)(?:-(\d+))?x/i;
const ENTRY_RANGE_RE = /ENTRY:\s*([\d.]+)\s*[-–]\s*([\d.]+)/i;
const EXIT_LIST_RE = /EXIT:\s*([\d./]+)/i;
const STOPLOSS_RE = /SL:\s*([\d.]+)/i;
```

**Extraction rules:**
- Pair: group 1 + "USDT" via `expandPair` (e.g. "ETH" → "ETHUSDT")
- Direction: lowercase
- Leverage: midpoint if range, else single value
- Entry: midpoint of range
- StopLoss: single value
- TakeProfits: split EXIT capture on `/` → `parseFloat` each → array

### 8.4 Template D — Langestrom

**Signals:** #8 PENGU, #9 ORDI, #10 RAVE
**Discriminator:** `Type:\s*(LONG|SHORT)` AND `Asset:\s*[A-Z]+` AND `Entry\s*Price:` AND `First\s*TP\s*&\s*SL-BE:` AND `Final\s*Take\s*Profit:` AND `Recommended\s*Leverage:`
**Quirks:** pair stripped of quote (just "PENGU"); only 2 TPs (TP1+Final); execution semantic "SL-BE at TP1" → goes into `notes`; leverage sometimes range, sometimes single.

**Patterns:**
```ts
const TYPE_RE = /Type:\s*(LONG|SHORT)/i;
const ASSET_RE = /Asset:\s*([A-Z]+)/i;
// Entry Price: $0.008410 - MARKET → extract first dollar amount, ignore "MARKET" suffix
const ENTRY_RE = /Entry\s*Price:\s*\$?([\d.]+)/i;
const STOPLOSS_RE = /Stop\s*Loss:\s*\$?([\d.]+)/i;
const TP1_RE = /First\s*TP\s*&\s*SL-BE:\s*\$?([\d.]+)/i;
const TP2_RE = /Final\s*Take\s*Profit:\s*\$?([\d.]+)/i;
const LEVERAGE_RE = /Recommended\s*Leverage:\s*(\d+)(?:-(\d+))?x?/i;
const MARKET_HINT_RE = /Entry\s*Price:[^\n]*\bMARKET\b/i;
```

**Extraction rules:**
- Pair: asset + "USDT" via `expandPair`
- Direction: lowercase
- Entry: first $-amount in Entry Price line
- StopLoss: single value
- TakeProfits: `[tp1, tp2]` (always 2)
- Leverage: midpoint if range, else single value
- Notes: build from optional flags — `MARKET_HINT_RE` match adds "Entry: MARKET", always add "SL-BE at TP1" since template guarantees it

### 8.5 Template E — Kapoor clean

**Signals:** #17 AAVE, #18 BTC
**Discriminator:** `Chart\s*#\d+\s*[–-]\s*[A-Za-z]+\s*\([A-Z0-9]+\)` header AND `Chartist:\s*Kapoor` AND `Trade\s*Levels:`
**Quirks:** direction not stated; infer from `stopLoss < entry → long` else short. Comma thousands like `$71,600`. Single-number entry/SL/TP1/TP2 (no ranges, no %).

**Patterns:**
```ts
const PAIR_RE = /Chart\s*#\d+\s*[–-]\s*[A-Za-z]+\s*\(([A-Z0-9]+)\)/;
const ENTRY_RE = /Entry:\s*\$?([\d,]+\.?\d*)/;
const STOPLOSS_RE = /Stop\s*Loss:\s*\$?([\d,]+\.?\d*)/;
const TP_RE = /TP\d+:\s*\$?([\d,]+\.?\d*)/g;
```

**Extraction rules:**
- Pair: group 1 (e.g. "AAVEUSDT", "BTCUSDT")
- Direction: `inferDirection({entry, stopLoss})`
- Entry: parse, strip commas
- StopLoss: parse, strip commas
- TakeProfits: iterate TP matches, parse each (commas stripped)

### 8.6 Edge cases → LLM

These three samples don't fit any of A-E cleanly. They fall through to LLM:

- **#6 BTC Prime Charter LIMIT** — em-dash separators, `Stop Loss:` / `Target:` labels, narrative "wick entry" annotations. Single example in the sample set; not worth a regex template.
- **#7 BTC multi-trade** — bulleted "Trade ideas" with 3 distinct {entry/SL/TP} sub-trades. LLM is told via the JSON Schema description to extract only the first trade and set `multipleTrades: true`.
- **#11 HYPE Prime Charter** — SL embedded in prose ("endure the SL 42.9"). Regex would have to do free-form scanning across the entire message; LLM handles cleanly.

### 8.7 Cross-template helpers (`normalize.ts`)

```ts
/** Strip $, commas, whitespace; parseFloat. Returns null on failure. */
export function parseDollarsAmount(s: string): number | null;

/** SL < entry → "long"; SL > entry → "short". Throws if equal. */
export function inferDirection(opts: { entry: number; stopLoss: number }): "long" | "short";

/** Append "USDT" if no quote suffix already present. */
export function expandPair(base: string, quote?: string): string;

/** (a + b) / 2. */
export function midpoint(a: number, b: number): number;

/** For SL: closer to entry = tighter. For TP: closer to entry = lock-profit-early. */
export function closerToEntry(
  low: number,
  high: number,
  entry: number,
  side: "long" | "short",
  kind: "sl" | "tp",
): number;
```

`closerToEntry` rule table:
| side | kind | choose |
|------|------|--------|
| long | sl | higher of {low, high} (closer to entry from below) |
| long | tp | lower of {low, high} (closer to entry from above) |
| short | sl | lower of {low, high} (closer to entry from above) |
| short | tp | higher of {low, high} (closer to entry from below) |

### 8.8 Order of attempt + fall-through

Templates tried in order: **E → A → B → C → D**. Why this order:
- E (Kapoor) has the strictest discriminator (`Chartist: Kapoor` literal); cheapest to test.
- A (Sheldon) shares the `Chart #N` header with E but has a different Chartist; tested second.
- B/C/D have unique structural signatures and can be tried in any order; placed B/C/D for alphabetical predictability.

For each template:
1. Test discriminator regex against rawText. If no match → fall through.
2. If discriminator matches, run all field extractors.
3. If all 5 required fields parsed → return `{ source: "regex", template: <letter>, ...fields }`.
4. If any required field missing → fall through to next template.

If all 5 templates fail → fall through to LLM.

### 8.9 Coverage at ship

| Template | Fixtures hit | Pass via regex |
|----------|--------------|----------------|
| A Sheldon | #1, #4, #16 | 3 |
| B emoji USDT | #2, #3, #15 | 3 |
| C Nasdaq75 Blofin | #5, #12, #13, #14 | 4 |
| D Langestrom | #8, #9, #10 | 3 |
| E Kapoor clean | #17, #18 | 2 |
| **Subtotal regex** | | **15 / 18 fixtures** |
| LLM fallback | #6, #7, #11 | 3 (test asserts gate fails for them) |
| **Total** | | **18 / 18 fixtures** |

Coverage breakdown by source: regex 83% (15/18), LLM 17% (3/18). LLM cost is bounded by the LLM-only fixture rate at human typing speed.

### 8.10 Test fixture format

`src/parser/__tests__/__fixtures__/signals.json`:

```json
[
  {
    "id": "doge-sheldon-1d",
    "rawText": "Chart #2 – Dogecoin (DOGEUSDT) 1-Day\nChartist: Sheldon\n\nChart for DOGE\n...",
    "expected": {
      "regexShouldHit": true,
      "expectedTemplate": "A",
      "parsed": {
        "pair": "DOGEUSDT",
        "direction": "long",
        "entry": 0.103,
        "stopLoss": 0.095,
        "takeProfits": [0.12, 0.135],
        "leverage": null,
        "multipleTrades": false
      }
    }
  },
  {
    "id": "btc-multi-trade-7",
    "rawText": "...",
    "expected": {
      "regexShouldHit": false,
      "expectedTemplate": null,
      "llmExpected": {
        "pair": "BTCUSDT",
        "direction": "short",
        "entry": 80276,
        "stopLoss": 81276,
        "takeProfits": [50276],
        "leverage": null,
        "multipleTrades": true
      }
    }
  }
]
```

Test `regex.test.ts` iterates each fixture:
- If `regexShouldHit === true`: assert pipeline returns `source === "regex"` AND `parsed` deep-equals the expected fields.
- If `regexShouldHit === false`: assert pipeline returns the no-config error (since LLM is not mocked at this layer).

Test `pipeline.test.ts` mocks the LLM adapter and asserts that for `regexShouldHit === false` fixtures, the LLM is invoked exactly once with the rawText.

## 9. ParsedSignalCard layout

```
┌─ Parsed Signal ────────────────────────────────────┐
│  [by Claude]  [3 trades, first only]               │  ← chips (source, multipleTrades)
│                                                     │
│  Pair        BTCUSDT          (read-only)          │  ← PairInput is the source of truth
│  Direction   [LONG]  [SHORT]                       │  ← segmented toggle (editable)
│  Entry       [ 71600         ]  range: 71500-71700 │  ← editable, raw range below if set
│  Stop loss   [ 70200         ]                     │
│  Take profits                                      │
│    TP1       [ 73900         ]  [-]                │  ← editable, remove button
│    TP2       [ 76100         ]  [-]                │
│    [+ Add TP]                                      │
│                                                     │
│  Signal said: 20x  (informational)                 │  ← signalLeverage display
│  Sizing preview (read-only)                        │
│    Margin    $80                                   │  ← derived from engine math
│    Leverage  25x  (at your cap)                    │
│    Risk      $5  (0.5% — SL too tight for 1%)      │  ← warning chip if cap binds
│                                                     │
│  Notes: Entry "MARKET" qualifier; SL-BE at TP1     │  ← parser's free-text notes
└────────────────────────────────────────────────────┘
```

**Editable fields:** Direction (segmented toggle), Entry (numeric), Stop Loss (numeric), each TP (numeric + remove button), "+ Add TP" button (max 10).

**Read-only fields:** Pair (PairInput is the source of truth — autofills if empty when card renders), source chip, multipleTrades chip, signalLeverage line, sizing preview, notes.

**Sizing preview** is computed live from edited values. Derivation:

```ts
slDistancePct  = abs(entry - stopLoss) / entry
riskAmount     = accountBalance × maxRiskPct        // e.g. $1000 × 1% = $10
notional       = riskAmount / slDistancePct         // size needed to hit exactly riskAmount at SL
idealLeverage  = notional / accountBalance          // leverage if user posts full balance as margin
cappedLeverage = min(idealLeverage, maxLeverage)    // clamped to user's cap (M3 stub: 25x)
cappedMargin   = notional / cappedLeverage          // collateral required at the chosen leverage
actualRisk     = cappedMargin × cappedLeverage × slDistancePct
                                                    //   = riskAmount when cap doesn't bind
                                                    //   < riskAmount when cap binds (cappedLev = maxLev)
```

**Display lines:**
- `Margin: $cappedMargin` (rounded to 2 dp)
- `Leverage: cappedLeverage × (at your cap)` if `cappedLeverage === maxLeverage`, else `Leverage: cappedLeverage ×`
- `Risk: $actualRisk (P% of account)` where `P = (actualRisk / accountBalance) × 100`

**Warning chip on Risk line** when `cappedLeverage === maxLeverage` AND `actualRisk < riskAmount`:
`SL too tight for {maxRiskPct}% risk budget at {maxLeverage}× cap — actual risk: P%`.

When `cappedLeverage < maxLeverage` → no warning, full risk budget is reached.

**Verify button** (in CaptureScreen, below the card) is disabled until:
- ParsedSignalCard has rendered (i.e. parse succeeded)
- PairInput has a resolved Pyth pair (`resolvedPair?.pyth !== null`)

## 10. CaptureScreen modifications

State machine:

```
"blank"          → user typing
"ready-to-parse" → textarea has content, no parsed signal yet
"parsing"        → spinner on Parse button (regex < 50ms, LLM 1-3s)
"parsed"         → ParsedSignalCard rendered, fields editable
"verifying"      → spinner on Verify
"report"         → ReportView rendered (M3 path)
```

State transitions:
- `"blank"` → `"ready-to-parse"`: textarea onChangeText with non-empty value
- `"ready-to-parse"` → `"parsing"`: Parse button tap
- `"parsing"` → `"parsed"`: pipeline returns success
- `"parsing"` → `"ready-to-parse"`: pipeline returns error (with inline error display)
- `"parsing"` → `"ready-to-parse"`: user taps Cancel during LLM phase (AbortController fires)
- `"parsed"` → `"verifying"`: Verify button tap
- `"verifying"` → `"report"`: engine returns
- `"report"` → `"blank"`: "Verify another signal" tap

UI changes from M3 CaptureScreen:

- Add `[Parse signal]` Pressable between `<UploadScreenshotButton>` and `<PrimaryCTA label="Verify with SMC engine">`
  - Disabled when textarea is empty
  - Shows "Parsing…" + spinner during state `"parsing"`
  - Cancel button surfaces during LLM phase (state `"parsing"` AND a flag `llmInFlight=true`)
- Add `<ParsedSignalCard>` rendered conditionally when state is `"parsed"`
  - Above the Verify button
  - Receives editable callbacks; CaptureScreen owns the `editedSignal` state
- Verify button now consumes `editedSignal` (from ParsedSignalCard) instead of `makeStubbedSignal()`:
  ```ts
  const finalSignal: SignalInput = {
    pair: `${resolvedPair.base}${resolvedPair.quote}`,  // PairInput is source of truth
    direction: editedSignal.direction,
    entry: editedSignal.entry,
    stopLoss: editedSignal.stopLoss,
    takeProfits: editedSignal.takeProfits,
    leverage: editedSignal.leverage,  // signal's stated; engine ignores per Q8
  };
  // Rest of verify() body unchanged from M3
  ```

`makeStubbedSignal` is removed.

Error inline display: same pattern as M3's error box (red border, danger background), with friendly messages:
- "AI fallback not configured — set up Claude or OpenAI in Settings, or use a signal format the regex understands."
- "Couldn't reach Claude — check your network."
- "Claude returned malformed data — try pasting again."
- "API key invalid — check Settings."
- "Rate limited — try again in a moment."

## 11. SettingsScreen modifications — AI Fallback card

Slot a new card directly below the Data Sources card (between Data Sources and Risk):

```
┌─ AI Fallback ──────────────────────────┐
│ Provider          [● Claude]  [○ OpenAI]│  ← segmented radio
│ Status            ● Configured         │  ← or ○ Not configured
│   API key         •••••••••••• [Reveal]│  ← reuse SecretInput from M3
│   [Save]  [Clear]                      │
│   Get a key →                          │  ← static helper text
└────────────────────────────────────────┘
```

Behavior:

- **Provider radio:** segmented control with two options ("Claude", "OpenAI"). Default selection: whichever was last saved, or "Claude" on first ever render.
- **API key SecretInput:** reuses M3's `SecretInput` component. Bound to the *active provider's* key (`claudeApiKey` or `openaiApiKey`).
- **Save:** validates by firing the active provider's adapter with a minimal probe (Claude: `messages` request with `max_tokens: 1` and a 4-char prompt; OpenAI: `chat.completions` equivalent). Auth pass → save to secureSettings. Auth fail (401) → "Key invalid — not saved". Network/rate-limit fail → save with warning (mirrors Birdeye behavior).
- **Clear:** deletes the active provider's key from secureSettings; status returns to "Not configured".
- **Switching providers when both keys are saved:** keep both keys stored; switch which one `getLlmConfig()` returns. No data loss when toggling.
- **Get a key →:** static helper text ("birdeye.so/developers"-style), e.g. "Get a Claude key at console.anthropic.com" or "Get an OpenAI key at platform.openai.com".

## 12. secureSettings extension

`src/storage/secureSettings.ts` adds:

```ts
const KEYS = {
  birdeyeApiKey: "birdeye_api_key",       // M3
  llmProvider: "llm_provider",            // M4: "claude" | "gpt-4o-mini"
  claudeApiKey: "claude_api_key",         // M4
  openaiApiKey: "openai_api_key",         // M4
} as const;

export type LlmProvider = "claude" | "gpt-4o-mini";

export async function getLlmProvider(): Promise<LlmProvider | null>;
export async function setLlmProvider(provider: LlmProvider): Promise<void>;
export async function getClaudeApiKey(): Promise<string | null>;
export async function setClaudeApiKey(value: string): Promise<void>;
export async function clearClaudeApiKey(): Promise<void>;
export async function getOpenAiApiKey(): Promise<string | null>;
export async function setOpenAiApiKey(value: string): Promise<void>;
export async function clearOpenAiApiKey(): Promise<void>;

/** Returns the active provider's config or null if not configured. */
export async function getLlmConfig(): Promise<{ provider: LlmProvider; apiKey: string } | null>;
```

`getLlmConfig` resolves provider AND key together: reads `llmProvider`, then reads the corresponding key. Returns null if either is missing or if the active key is empty.

`redact()` helper from M3 still applies to LLM keys.

## 13. Testing strategy

**Unit tests (vitest, on Mac):**

- `regex.test.ts` — replays all 18 unique fixtures from `__fixtures__/signals.json`. 15 should pass via regex (`source === "regex"`) with exact field match against the fixture's `expected.parsed`. 3 (#6, #7, #11) should fall through the gate (test asserts pipeline returns the "no LLM config" error since this test doesn't mock LLM).
- `normalize.test.ts` — covers `parseDollarsAmount` (`$1,234.56`, `1234`, `$0.0001`, malformed → null), `inferDirection` (long, short, equal throws), `expandPair` (already-quoted, not-quoted, lowercase), `midpoint`, `closerToEntry` (all 4 side×kind combos).
- `schema.test.ts` — Zod accepts well-formed ParsedSignal (all 18 fixtures' expected outputs, including the LLM-only ones supplied as `llmExpected`); rejects malformed (negative numbers, missing required, wrong direction enum, empty takeProfits).
- `pipeline.test.ts` — mocks `regex.tryAll` and `llm.parseWithLlm` and `secureSettings.getLlmConfig`; asserts gate dispatch:
  - regex hit → no LLM call, returns regex result
  - regex miss + LLM key present → LLM called once with rawText, returns LLM result
  - regex miss + no LLM key → returns "not configured" error, no LLM call
  - LLM throws LlmAuthError → returns "API key invalid" error
  - LLM throws LlmRateLimitError → returns "rate limited" error
  - LLM returns Zod-invalid object → returns "malformed data" error

**Integration tests (vitest with mocked fetch):**

- `claudeAdapter.test.ts` — happy path (200 + tool_use block) → ParsedSignal; 401 → LlmAuthError; 429 → LlmRateLimitError; non-2xx → LlmError; missing tool_use block → LlmSchemaError; tool_use input fails Zod → LlmSchemaError. Verify URL and headers (x-api-key, anthropic-version, content-type) are correct.
- `openaiAdapter.test.ts` — same shape: happy path (200 + function call) → ParsedSignal; 401 → LlmAuthError; 429 → LlmRateLimitError; non-2xx → LlmError; missing tool_calls → LlmSchemaError; arguments JSON.parse fails → LlmSchemaError. Verify URL and `Authorization: Bearer ...` header.

**NO live API tests in CI** — token cost + rate limits + flakiness. Manual `scripts/probe-llm.ts` for live verification on demand.

**Engine fixtures stay green** — 27 SMC golden fixtures untouched; parser doesn't touch engine.

**Phone hot-reload verification:** paste 3-4 real signals from existing Telegram subscriptions, watch ParsedSignalCard fill correctly, edit one field (e.g. tweak entry), hit Verify, see engine verdict.

## 14. Out of scope (explicit)

- **Multiple-trade extraction beyond first trade** — flag-only; user re-pastes if they want a different trade.
- **LLM autocorrect of obviously-wrong regex hits** — strict gate is binary; no hybrid mode.
- **Result caching across parses** — rare enough that caching doesn't pay back the complexity.
- **Confidence-graded fallback** (Q5 option b) — pure binary gate is locked.
- **On-device LLM** (Q1 option c — NuExtract/SmolLM2/ExecuTorch) — explicitly post-hackathon; documented as roadmap.
- **Margin/leverage user override controls** (Q9 — dropped) — sizing preview is read-only in M4. M8 may revisit.
- **Camera capture / share-intent target** (PRD M4.2/M4.4) — defer to post-hackathon.
- **Real "Confirm trade" wallet+order flow** — M5/M6 territory.
- **Streaming OCR vs paste** — `UploadScreenshotButton` already does it; no new path.
- **Editable accountBalance / maxRiskPct / maxLeverage** — still hardcoded as M3 values; M8 makes them editable.
- **Pair extraction from any quote convention** — parser appends "USDT" if no quote suffix; doesn't try to infer that an "ETH-PERP" might want USD vs USDT. Pyth catalog (M3) folds USDT/USDC → USD anyway, so this is benign.
- **More test fixtures beyond the 18 collected** — additional fixtures collected during build via real-world iteration, not as a spec deliverable.

## 15. Risks

| Risk | Mitigation |
|------|------------|
| Provider API change (Anthropic/OpenAI) breaks adapter | Adapters are one file each; TypeScript + Zod catch shape drift early; one-file fix; both providers documented with their current API version. |
| LLM hallucinates wrong values within valid schema | `tool_use`/function calling guarantees JSON schema, not semantic correctness. User edits any field before Verify. Source chip on card makes it obvious LLM was involved. |
| Real signal format we haven't seen breaks all regex templates | LLM fallback handles it. If LLM key not configured → friendly nudge to Settings, not a crash. |
| Pair extraction returns base only ("BTC") but engine wants "BTCUSDT" | `expandPair()` helper appends "USDT" if no quote suffix; `resolveToPythFeed` (M3) already folds USDT/USDC → USD via Pyth catalog. |
| LLM cost spirals if user spams parse | BYO key, user pays. Each call sub-2KB context, ~$0.0001 Haiku / ~$0.0002 gpt-4o-mini. Negligible at human-typing rates. No caching risk because there is no cache. |
| LLM latency (1-3s) feels slow | Cancel button + spinner during LLM phase. Regex covers ~80% of signals so most parses are <50ms. |
| Multi-trade message (#7) silently extracts wrong trade | Parser sets `multipleTrades=true`; UI surfaces "3 trades, only first parsed" chip; user re-pastes the variant they want. |
| Direction misinference for Kapoor template (entry-vs-SL heuristic) | Direction is editable in card; segmented toggle is a 1-tap fix. Test fixture covers normal case. |
| LLM key leaks via logs/dump/APK reverse | `secureSettings.redact()` helper enforced; no `console.log(apiKey)` anywhere; reviewed in code-review pass; key never bundled in APK (BYO). |
| Both Claude + OpenAI keys stored, ambiguous which is active | secureSettings stores them under distinct keys; provider radio toggles which is read by `getLlmConfig()`. No ambiguity. Switching providers preserves both stored keys. |
| Native dep accidentally added (e.g. slider) → triggers EAS rebuild | Margin/leverage controls dropped from M4 (Q9) to avoid this. Reviewed in code-review: any new dep with native module → blocked. |
| Engine integration regression (sizing/leverage math) | Sizing preview is computed in ParsedSignalCard from same formula engine uses; verify-time engine call uses identical math; visual sanity pass on the phone catches drift. 27 SMC golden fixtures stay green. |
| LLM adapter chooses wrong field types (e.g. string when number expected) | Zod validates; throws LlmSchemaError; UI surfaces "AI returned malformed data — paste again" with no engine call. |

## 16. Success criteria

- All 18 fixture signals process correctly:
  - 15 regex-target fixtures pass via regex with exact field match against `expected.parsed`
  - 3 LLM-target fixtures (#6, #7, #11) fall through the regex gate (verified by `regex.test.ts` asserting gate-fail without LLM mock; `pipeline.test.ts` verifies LLM is called for them when mocked)
- Phone manual verification: paste 3+ real signals (BTC + SOL + ETH-range), each parses correctly, ParsedSignalCard renders editable, an edit flows into Verify, engine produces sensible verdict
- All 105 prior vitest cases + new (~25-35 estimated) all pass
- `pnpm exec tsc --noEmit` exits 0
- LLM call completes <3s typical, <5s 95th percentile (network-dependent)
- App with no LLM key + LLM-required signal → friendly nudge to Settings, no crash
- ParsedSignalCard with malformed LLM response → friendly error, no crash
- LLM API key never appears in `adb logcat`, AsyncStorage dump, or APK reverse-engineer (visual code review pass)
- Build remains pushable + cloneable (no untracked-foundation regression — same lesson as M3)
- `accountBalance: 1000` and `riskRules` still hardcoded (M8 makes them editable; out of scope here)
- Sizing preview math matches engine's actual computation (visually cross-checked on phone vs ReportView output)
- "Signal said 20x" line shows when signal had explicit leverage; absent when signal had none
- Multi-trade chip shows on #7-style messages

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
  const leverage =
    levLow !== null && levHigh !== null ? Math.round(midpoint(levLow, levHigh)) : null;

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

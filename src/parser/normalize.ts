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
  if (side === "long" && kind === "sl") return hi;
  if (side === "long" && kind === "tp") return lo;
  if (side === "short" && kind === "sl") return lo;
  return hi;
}

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

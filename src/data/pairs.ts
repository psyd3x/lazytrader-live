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

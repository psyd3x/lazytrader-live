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
    const sym = f.attributes?.symbol;
    if (!sym || !sym.startsWith("Crypto.")) continue;
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

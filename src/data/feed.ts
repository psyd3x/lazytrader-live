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

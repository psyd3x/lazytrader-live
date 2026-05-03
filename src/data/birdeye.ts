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

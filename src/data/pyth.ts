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

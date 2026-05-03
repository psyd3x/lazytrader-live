/**
 * Demo data — synthetic candles + sample signal for the Capture-screen stub.
 *
 * **Not for tests.** This is purely so the Capture screen has something to feed
 * the engine before M3 (live data feed) and M4 (OCR signal parser) land. Keep
 * this file out of the test path; tests use `validation-fixtures/` exclusively.
 *
 * The generator uses a deterministic seeded LCG so the demo is reproducible
 * across runs (helps visual QA on the phone).
 */

import type { Candle, SignalInput } from "../smc";

interface TfSpec {
  /** Pine-style TF identifier matching DEFAULT_TIMEFRAMES. */
  tf: string;
  /** Bar interval in ms — only used for the synthetic timestamp. */
  intervalMs: number;
  /** How many bars to generate. ~60-120 keeps the engine fast on-device. */
  count: number;
  /** Mean per-bar % drift (positive = bull). Higher TFs lean stronger. */
  drift: number;
  /** Per-bar volatility as a fraction of price. */
  volatility: number;
}

const TF_SPECS: readonly TfSpec[] = [
  { tf: "1m", intervalMs: 60_000, count: 120, drift: 0.0, volatility: 0.0008 },
  { tf: "5m", intervalMs: 5 * 60_000, count: 120, drift: 0.0001, volatility: 0.0015 },
  { tf: "15m", intervalMs: 15 * 60_000, count: 120, drift: 0.0002, volatility: 0.0025 },
  { tf: "1H", intervalMs: 60 * 60_000, count: 120, drift: 0.0004, volatility: 0.004 },
  { tf: "4H", intervalMs: 4 * 60 * 60_000, count: 100, drift: 0.0008, volatility: 0.007 },
  { tf: "1D", intervalMs: 24 * 60 * 60_000, count: 80, drift: 0.0012, volatility: 0.014 },
  { tf: "1W", intervalMs: 7 * 24 * 60 * 60_000, count: 60, drift: 0.0018, volatility: 0.025 },
];

/** Park-Miller LCG — small, deterministic, good enough for demo data. */
function makeRng(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function generateTf(
  basePrice: number,
  spec: TfSpec,
  seed: number,
  endMs: number,
): Candle[] {
  const rng = makeRng(seed);
  const out: Candle[] = [];
  let close = basePrice;
  for (let i = spec.count - 1; i >= 0; i--) {
    const ts = endMs - i * spec.intervalMs;
    const open = close;
    const noise = (rng() - 0.5) * 2 * spec.volatility;
    const move = (spec.drift + noise) * open;
    close = open + move;
    const wickUp = rng() * spec.volatility * open * 0.6;
    const wickDown = rng() * spec.volatility * open * 0.6;
    const high = Math.max(open, close) + wickUp;
    const low = Math.min(open, close) - wickDown;
    const volume = 100 + rng() * 50;
    out.push({ timestamp: ts, open, high, low, close, volume });
  }
  return out;
}

export interface DemoBundle {
  pair: string;
  candleData: Record<string, Candle[]>;
  signal: SignalInput;
  currentPrice: number;
  /** Friendly multi-line text rendition of the signal — feeds the TextInput. */
  signalText: string;
}

/** Build a demo bundle (candles + sample signal) for the Capture screen. */
export function makeBtcDemo(): DemoBundle {
  const basePrice = 78_500;
  const endMs = Date.now();
  const candleData: Record<string, Candle[]> = {};
  for (let i = 0; i < TF_SPECS.length; i++) {
    candleData[TF_SPECS[i].tf] = generateTf(basePrice, TF_SPECS[i], 1729 + i * 31, endMs);
  }
  const lastTf = "1m";
  const lastCandles = candleData[lastTf];
  const currentPrice = lastCandles[lastCandles.length - 1].close;

  const entry = currentPrice * 0.998;
  const stopLoss = currentPrice * 0.985;
  const tp1 = currentPrice * 1.012;
  const tp2 = currentPrice * 1.028;
  const tp3 = currentPrice * 1.05;

  const signal: SignalInput = {
    pair: "BTCUSDT",
    direction: "long",
    entry,
    stopLoss,
    takeProfits: [tp1, tp2, tp3],
    leverage: 5,
  };

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { maximumFractionDigits: 2 });

  const signalText =
    `BTCUSDT LONG  ·  5x leverage\n` +
    `Entry:  $${fmt(entry)}\n` +
    `SL:     $${fmt(stopLoss)}\n` +
    `TP1:    $${fmt(tp1)}\n` +
    `TP2:    $${fmt(tp2)}\n` +
    `TP3:    $${fmt(tp3)}`;

  return {
    pair: "BTCUSDT",
    candleData,
    signal,
    currentPrice,
    signalText,
  };
}

/**
 * 18 unique trade signals collected from real Telegram channels during M4
 * brainstorming (2026-05-04). 15 should parse via regex templates A-E;
 * 3 (#6, #7, #11) are LLM-only edge cases.
 *
 * Each entry: { id, rawText, regexShouldHit, expectedTemplate, parsed }
 * - parsed is the field-level expected output (for both regex and LLM ground truth)
 * - regexShouldHit indicates whether the 5-template regex pass should fill all
 *   required fields; LLM-only entries set this false
 */

export interface RawSignalFixture {
  id: string;
  rawText: string;
  regexShouldHit: boolean;
  expectedTemplate: "A" | "B" | "C" | "D" | "E" | null;
  parsed: {
    pair: string;
    direction: "long" | "short";
    entry: number;
    stopLoss: number;
    takeProfits: number[];
    leverage: number | null;
    multipleTrades: boolean;
  };
}

export const RAW_SIGNALS: RawSignalFixture[] = [
  // ─── Template A — Sheldon narrative ─────────────────────────
  {
    id: "1-doge-sheldon-1d",
    rawText: `Chart #2 – Dogecoin (DOGEUSDT) 1-Day
Chartist: Sheldon

Chart for DOGE
(For the chart screenshot, click here)

The price of DOGE has been very bullish over the last week, and I am looking for the price to break the overhead resistance, where I will then enter a long spot trade.

Trade Levels:

Entry: Enter a long spot trade at the break and retest of the $0.103 level.

Stop Loss: Just below $0.095

Take Profit Levels (TP):

TP1: $0.12 - $0.125 (17% - 21%)

TP2: $0.135 - $0.155 (31% - 50%)`,
    regexShouldHit: true,
    expectedTemplate: "A",
    parsed: {
      pair: "DOGEUSDT",
      direction: "long",
      entry: 0.103,
      stopLoss: 0.095,
      takeProfits: [0.12, 0.135], // closerToEntry of each range (long → lower bound)
      leverage: null,
      multipleTrades: false,
    },
  },
  {
    id: "4-algo-sheldon-1d",
    rawText: `Chart #4 – Algorand (ALGOUSDT) 1-Day
Chartist: Sheldon

Chart for ALGO
(For the chart screenshot, click here)

Over the last 3 days, the price of ALGO has been in a retrace, and it is getting close to the next major level of support, where I will be looking at entering a long spot trade.

Trade Levels:

Entry: Enter a long spot trade at around $0.11

Stop Loss: Just below $0.103

Take Profit Levels (TP):

TP1: $0.126 - $0.147 (15% - 34%)

TP2: $0.175 - $0.20 (59% - 82%)`,
    regexShouldHit: true,
    expectedTemplate: "A",
    parsed: {
      pair: "ALGOUSDT",
      direction: "long",
      entry: 0.11,
      stopLoss: 0.103,
      takeProfits: [0.126, 0.175],
      leverage: null,
      multipleTrades: false,
    },
  },
  {
    id: "16-coin-sheldon-1d",
    rawText: `Chart #5 – Coinbase (COIN) 1-Day
Chartist: Sheldon

Chart for COIN
(For the chart screenshot, click here)

(COIN refers to the stock of Coinbase and not a cryptocurrency.)

I am keeping a close eye on the price of Coinbase going into tonight's FOMC meeting, as I do think there is a possibility of another move up in the price of BTC that could lift the rest of the Crypto Market, and also Coinbase.

Trade Levels:

Entry: Enter a long spot trade at the current $192 level of support.

Stop Loss: Just below $175

Take Profit Levels (TP):

TP1: $224 - $260 (17% - 35%)

TP2: $290 - $340 (51% - 77%)`,
    regexShouldHit: true,
    expectedTemplate: "A",
    parsed: {
      pair: "COIN", // stock — engine's resolveToPythFeed will reject as unsupported, that's correct behavior
      direction: "long",
      entry: 192,
      stopLoss: 175,
      takeProfits: [224, 290],
      leverage: null,
      multipleTrades: false,
    },
  },

  // ─── Template B — emoji USDT bot ──────────────────────────
  {
    id: "2-apt-emoji",
    rawText: `Pairs:  APT/USDT

 👉 Trade Type = LONG 🟢

 👉 Leverage :- 20x

⚡️ Entry = [ 0.9966 TO 0.9941 ]

❌ StopLoss :- 0.9626

✅ Take profit = [ 1.0131, 1.0234, 1.0346, 1.0524, 1.0631, 1.0837`,
    regexShouldHit: true,
    expectedTemplate: "B",
    parsed: {
      pair: "APTUSDT",
      direction: "long",
      entry: 0.99535, // midpoint
      stopLoss: 0.9626,
      takeProfits: [1.0131, 1.0234, 1.0346, 1.0524, 1.0631, 1.0837],
      leverage: 20,
      multipleTrades: false,
    },
  },
  {
    id: "3-avax-emoji",
    rawText: `Pairs:  AVAX/USDT

 👉 Trade Type = LONG 🟢

 👉 Leverage :- 20x

⚡️ Entry = [ 9.172 TO 9.149 ]

❌ StopLoss :- 8.876

✅ Take profit = [ 9.320, 9.433, 9.536, 9.663, 9.812, 9.974 ]`,
    regexShouldHit: true,
    expectedTemplate: "B",
    parsed: {
      pair: "AVAXUSDT",
      direction: "long",
      entry: 9.1605,
      stopLoss: 8.876,
      takeProfits: [9.32, 9.433, 9.536, 9.663, 9.812, 9.974],
      leverage: 20,
      multipleTrades: false,
    },
  },
  {
    id: "15-trx-emoji",
    rawText: `Pairs:  TRX/USDT

 👉 Trade Type = LONG 🟢

 👉 Leverage :- 20x

⚡️ Entry = [ 0.3252 TO 0.3244 ]

❌ StopLoss :- 0.3131

✅ Take profit = [ 0.3305, 0.3337, 0.3383, 0.3417, 0.3483, 0.3513 ]`,
    regexShouldHit: true,
    expectedTemplate: "B",
    parsed: {
      pair: "TRXUSDT",
      direction: "long",
      entry: 0.3248,
      stopLoss: 0.3131,
      takeProfits: [0.3305, 0.3337, 0.3383, 0.3417, 0.3483, 0.3513],
      leverage: 20,
      multipleTrades: false,
    },
  },

  // ─── Template C — Nasdaq75 Blofin ──────────────────────────
  {
    id: "5-eth-nasdaq75",
    rawText: `Nasdaq75 [Prime] [CHPR], Role icon, Technical Analyst — 4/29/26, 8:14 AM
#ETH (Blofin) @Crypto Signal
SHORT: 5-10x
ENTRY: 2370-2325
EXIT: 2317/2307/2290/2270/2230/2150
SL: 2410
THIS IS A SHORT-TERM TRADE
@Crypto Signal`,
    regexShouldHit: true,
    expectedTemplate: "C",
    parsed: {
      pair: "ETHUSDT",
      direction: "short",
      entry: 2347.5, // midpoint
      stopLoss: 2410,
      takeProfits: [2317, 2307, 2290, 2270, 2230, 2150],
      leverage: 8, // Math.round(midpoint(5, 10)) = Math.round(7.5) = 8
      multipleTrades: false,
    },
  },
  {
    id: "12-lit-nasdaq75",
    rawText: `Nasdaq75 [Prime] [CHPR], Role icon, Technical Analyst — 4/15/26, 9:18 PM
#LIT (Blofin) @Crypto Signal
SHORT: 5-10x
ENTRY: 1.0850-1.0560
EXIT: 1.0510/1.0440/1.0370/1.0270/1.00/0.97
SL: 1.10
THIS IS A SHORT-TERM TRADE`,
    regexShouldHit: true,
    expectedTemplate: "C",
    parsed: {
      pair: "LITUSDT",
      direction: "short",
      entry: 1.0705,
      stopLoss: 1.1,
      takeProfits: [1.051, 1.044, 1.037, 1.027, 1.0, 0.97],
      leverage: 8,
      multipleTrades: false,
    },
  },
  {
    id: "13-zen-nasdaq75-a",
    rawText: `Nasdaq75 [Prime] [CHPR], Role icon, Technical Analyst — 4/14/26, 11:02 PM
#ZEN (Blofin) @Crypto Signal
SHORT: 5-10x
ENTRY: 5.80-5.64
EXIT: 5.62/5.60/5.56/5.48/5.36/5.20
SL: 5.88
THIS IS A SHORT-TERM TRADE`,
    regexShouldHit: true,
    expectedTemplate: "C",
    parsed: {
      pair: "ZENUSDT",
      direction: "short",
      entry: 5.72,
      stopLoss: 5.88,
      takeProfits: [5.62, 5.6, 5.56, 5.48, 5.36, 5.2],
      leverage: 8,
      multipleTrades: false,
    },
  },
  {
    id: "14-zen-nasdaq75-b",
    rawText: `Nasdaq75 [Prime] [CHPR], Role icon, Technical Analyst — 4/27/26, 11:33 PM
#ZEN (Blofin) @Free Crypto Signals
SHORT: 5-10x
ENTRY: 6.02-5.94
EXIT: 5.92/5.89/5.85/5.80/5.72/5.64
SL: 6.10
THIS IS A SHORT-TERM TRADE`,
    regexShouldHit: true,
    expectedTemplate: "C",
    parsed: {
      pair: "ZENUSDT",
      direction: "short",
      entry: 5.98,
      stopLoss: 6.1,
      takeProfits: [5.92, 5.89, 5.85, 5.8, 5.72, 5.64],
      leverage: 8,
      multipleTrades: false,
    },
  },

  // ─── Template D — Langestrom ────────────────────────────────
  {
    id: "8-pengu-langestrom",
    rawText: `Type: LONG
Asset: PENGU
Entry Price: $0.008410 - MARKET
Stop Loss: $0.007960
First TP & SL-BE: $0.008661
Final Take Profit: $0.010107
Recommended Leverage: 30-50x`,
    regexShouldHit: true,
    expectedTemplate: "D",
    parsed: {
      pair: "PENGUUSDT",
      direction: "long",
      entry: 0.00841,
      stopLoss: 0.00796,
      takeProfits: [0.008661, 0.010107],
      leverage: 40, // midpoint of 30-50
      multipleTrades: false,
    },
  },
  {
    id: "9-ordi-langestrom",
    rawText: `Langestrom [Prime] [CHPR], Role icon, Technical Analyst — 4/16/26, 3:59 PM
LANGESTROM SWING CALL

Type: SHORT
Asset: ORDI
Entry Price: $8.551
Stop Loss: $9.447
First TP & SL-BE: $7.5
Final Take Profit: $5.842
Recommended Leverage: 20x`,
    regexShouldHit: true,
    expectedTemplate: "D",
    parsed: {
      pair: "ORDIUSDT",
      direction: "short",
      entry: 8.551,
      stopLoss: 9.447,
      takeProfits: [7.5, 5.842],
      leverage: 20,
      multipleTrades: false,
    },
  },
  {
    id: "10-rave-langestrom",
    rawText: `LANGESTROM SCALP CALL

Type: SHORT
Asset: RAVE
Entry Price: $14.353
Stop Loss: $16.88
First TP & SL-BE: $12.74
Final Take Profit: $8.1
Recommended Leverage: 10-15x`,
    regexShouldHit: true,
    expectedTemplate: "D",
    parsed: {
      pair: "RAVEUSDT",
      direction: "short",
      entry: 14.353,
      stopLoss: 16.88,
      takeProfits: [12.74, 8.1],
      leverage: 13, // midpoint of 10-15, rounded
      multipleTrades: false,
    },
  },

  // ─── Template E — Kapoor clean ──────────────────────────────
  {
    id: "17-aave-kapoor-8h",
    rawText: `Chart #1 – Aave (AAVEUSDT) 8-Hour
Chartist: Kapoor

Chart for AAVE
(For the chart screenshot, click here)

Aave is showing strength after taking support from $90. If it reclaims $98, continuation toward the next resistance is likely.

Trade Levels:

Entry: $98.7

Stop Loss: $95.73

Take Profit Levels (TP):

TP1: $105.8

TP2: $114.02`,
    regexShouldHit: true,
    expectedTemplate: "E",
    parsed: {
      pair: "AAVEUSDT",
      direction: "long", // inferred from SL < entry
      entry: 98.7,
      stopLoss: 95.73,
      takeProfits: [105.8, 114.02],
      leverage: null,
      multipleTrades: false,
    },
  },
  {
    id: "18-btc-kapoor-8h",
    rawText: `Chart #2 – Bitcoin (BTCUSDT) 8-Hour
Chartist: Kapoor

Chart for BTC
With Trump speaking today at 1PM ET, we are facing a key trigger event. Any de-escalation tone could push BTC through resistance, in which case I am looking for a breakout and retest for entry.

Trade Levels:

Entry: $71,600

Stop Loss: $70,200

Take Profit Levels (TP):

TP1: $73,900

TP2: $76,100`,
    regexShouldHit: true,
    expectedTemplate: "E",
    parsed: {
      pair: "BTCUSDT",
      direction: "long",
      entry: 71600,
      stopLoss: 70200,
      takeProfits: [73900, 76100],
      leverage: null,
      multipleTrades: false,
    },
  },

  // ─── LLM-only edge cases ───────────────────────────────────
  {
    id: "6-btc-prime-charter-limit",
    rawText: `Prime Charter [Rúnír] [CHPR], Role icon, Technical Analyst — 4/19/26, 5:54 AM
BTCUSDT.P – LIMIT ORDER | BUY https://www.tradingview.com/x/YKSCC3lg/
Bitunix Price Data

Entry range 73,715 – 74,470

Potential wick entry: 72,390 ⚡
→ Acts as invalidation / de-risk level
→ If 4H closes below, reduce or close — don't wait for full SL

🛡️ Stop Loss
70,500

🏁 Target
 80,050 - 80,280`,
    regexShouldHit: false,
    expectedTemplate: null,
    parsed: {
      pair: "BTCUSDT",
      direction: "long",
      entry: 74092.5, // midpoint
      stopLoss: 70500,
      takeProfits: [80050],
      leverage: null,
      multipleTrades: false,
    },
  },
  {
    id: "7-btc-multi-trade",
    rawText: `Prime Charter [Rúnír] [CHPR], Role icon, Technical Analyst — 4/18/26, 10:32 PM
⁠🚨｜crypto-signals⁠

Found one of my old crypto signals from Mar 16 — looks like unfinished business on BTC.

I'm taking a wild shot here.

SELL zone - 80,050 – 80,250 🔻
Wick entry around 80,321 (HTF wicks for me) https://www.tradingview.com/x/aYDceDcG/
@Crypto Signal
SL will depend on your risk. Different styles here — some may wait for price to tap the level first before confirming and executing (scalp / intraday / swing).

Trade ideas

• Sell 80,276
SL: 81,276 (-1,000)
TP: 50,276 (+30,000)
~1:30 RR (take profits along the way)

• Sell 80,050
SL: 80,350
TP: 74,350 (~1:19 RR)

• Sell 80,250
SL: 80,350
TP: 79,350 (~1:9 RR)
I know most of you think I'm always bearish.`,
    regexShouldHit: false,
    expectedTemplate: null,
    parsed: {
      pair: "BTCUSDT",
      direction: "short",
      entry: 80276, // first trade
      stopLoss: 81276,
      takeProfits: [50276],
      leverage: null,
      multipleTrades: true,
    },
  },
  {
    id: "11-hype-prime-charter",
    rawText: `Prime Charter [Rúnír] [CHPR], Role icon, Technical Analyst — 4/21/26, 8:41 AM
HYPEUSDT.P - Bitunix Price data https://www.tradingview.com/x/uDaEAK5l/
High probability Sell
41.930 - 42.106

IF you have deep pocket and can endure the SL 42.9, you can sell now

Final Target (Swing) - 34.45 - You can hold for lower targets  @Crypto Signal`,
    regexShouldHit: false,
    expectedTemplate: null,
    parsed: {
      pair: "HYPEUSDT",
      direction: "short",
      entry: 42.018, // midpoint
      stopLoss: 42.9,
      takeProfits: [34.45],
      leverage: null,
      multipleTrades: false,
    },
  },
];

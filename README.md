# LazyTrader

> AI-powered Android trading signal app. Camera/paste/Telegram signal ingestion, on-device parsing, SMC/ICT verification, executed on Solana perps via your own wallet.

**Hackathon**: Solana Frontiers (Colosseum) — AI track
**Domain**: [lazytrader.live](https://lazytrader.live)
**Status**: Pre-MVP — PRD + plan phase

---

## What it does

1. You see a trading signal somewhere — Telegram channel, Twitter screenshot, paid group, paste of text
2. You feed it to LazyTrader (camera, paste, screenshot, share)
3. App parses it on-device (free, no API costs)
4. SMC/ICT engine verifies it against multi-timeframe market structure
5. Engine grades the signal A+ to D
6. You approve in one tap → Drift Protocol perp order is constructed
7. Phantom or Solflare signs the transaction → executed on Solana

No backend custody. No escrow. No success-fee programs. Your wallet, your trade.

## Why this is different

Every other Solana trading app gives you raw execution. LazyTrader is the **AI intelligence layer** that sits between a signal and your wallet. It tells you whether the signal is worth taking before you commit capital.

## Tech

| Layer | Choice | Why |
|-------|--------|-----|
| Mobile | React Native (Android only, MVP) | Cross-platform later, fast iteration now |
| OCR | Google ML Kit Text Recognition v2 | Free, on-device, 50ms |
| Parser | Regex + SmolLM2-1.7B fallback (ExecuTorch) | Free, on-device, no API costs |
| SMC Engine | TS port of existing Python engine | Fully on-device, zero backend |
| Execution | Drift Protocol (`@drift-labs/sdk`) | Solana-native perps, 40+ markets |
| Wallet | Solana Mobile Wallet Adapter | Phantom / Solflare / any MWA wallet |
| Data feed | Birdeye / Drift historical | Free for MVP scope |

## Status

This is a fresh repo. The previous Python prototype lives at `~/lazytrader/` and is reference-only.

See [`docs/`](./docs) for the PRD, architecture, plan, and dev setup.

## Quick links

- [Product Requirements (PRD)](./docs/PRD.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Implementation Plan](./docs/IMPLEMENTATION-PLAN.md)
- [Android Dev Setup (Tailscale + Expo)](./docs/ANDROID-DEV-SETUP.md)
- [SMC Engine Validation Plan](./docs/SMC-ENGINE-VALIDATION.md)

## License

Not yet determined. All rights reserved until license decided.

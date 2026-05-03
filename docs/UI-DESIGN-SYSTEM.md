---
title: LazyTrader UI Design System
description: Visual design system for the LazyTrader Android MVP — palette, typography, screen architecture, and component conventions. Palette locked to Solana brand (Option A from palette-preview.html).
type: design-system
project: lazytrader
version: 1.1
status: locked
date: 2026-05-03
created: 2026-05-03
tags: [design-system, lazytrader, ui, palette, typography, react-native]
---

# LazyTrader UI Design System

_Version: 1.1_
_Date: 2026-05-03_

**Related docs**: [[PRD]] · [[ARCHITECTURE]] · [[IMPLEMENTATION-PLAN]] · [[ANDROID-DEV-SETUP]]

> **v1.1 — palette locked to Solana brand (Option A from `palette-preview.html`).**
> Canonical tokens live in `src/theme/tokens.ts`. Update both this doc and that
> file in lockstep if the palette ever changes.

This document defines the mobile interface direction for `lazytrader.live`.
It is intended to guide the Android app scaffold, component implementation, and
visual polish for the MVP.

## 1. Product feel

LazyTrader should feel like a serious trading instrument, not a generic fintech
app. The interface should communicate:

- speed
- trust
- precision
- self-custody
- confidence without hype

The UI should never look loud, gimmicky, or meme-ish. It should feel like a
premium market terminal that was simplified for one-handed mobile use.

## 2. Visual direction

### Mood

- Dark-first, with a near-black graphite foundation
- High-contrast accents for action and signal quality
- Minimal chrome, strong hierarchy, sharp spacing
- Subtle glow only on high-value states like verified and approved

### Color palette

Use semantic colors rather than decorative colors.

- Background: deep navy
- Surface: lifted blue-graphite
- Primary action: Solana purple
- Secondary accent: Solana green (sparingly)
- Long / positive: green
- Short / negative: red
- Warning / caution: amber
- Neutral info: cool gray

Canonical tokens (mirrored in `src/theme/tokens.ts`):

- `bg`: `#081018`
- `surface`: `#0d1721`
- `surface-2`: `#131e2a`
- `border`: `rgba(143, 161, 179, 0.18)`
- `text`: `#eaf1f7`
- `muted`: `#9fb0bf`
- `primary`: `#9945ff` (Solana purple)
- `secondary`: `#14f195` (Solana green — accents only)
- `success`: `#37df91`
- `danger`: `#ff6478`
- `warning`: `#ffb44b`

Keep the palette restrained. Bright color only for meaning, not decoration.
Solana purple/green telegraph the chain — earn it, don't sprinkle it.

### Typography

- Headings + body: `Inter` (single family for consistency)
- Numeric / market values + dashboard cells: platform monospace (`Menlo` on
  iOS, `monospace` on Android) — wired through `fonts.mono` in
  `src/theme/tokens.ts`
- Tabular numbers enabled for any number that lines up in a column

MVP ships without a custom font load (no `expo-font` dep) — `Inter` is
specified but falls back to platform sans (San Francisco / Roboto) which is
close enough. Upgrade path documented in `tokens.ts` when we want pixel-exact
Inter rendering.

Type should feel crisp and contemporary. Use larger numbers for trading data,
but keep supporting labels compact and calm.

### Shape and depth

- Base radius: 16
- Card radius: 20
- Small controls: 12
- Use soft shadows very sparingly
- Prefer borders and tonal surfaces over heavy drop shadows

### Motion

- Fast transitions only
- Use motion to explain state changes, not to decorate
- Animate: card expansion, rating reveal, step progress, tx success
- Do not use looping motion unless it conveys live status
- Respect reduced motion settings

## 3. Navigation model

Use a bottom navigation bar with four primary destinations:

1. `Scan`
2. `Verify`
3. `History`
4. `Settings`

This keeps the app simple while matching the product flow. The `Scan` tab is
the default landing point.

### Secondary paths

- Capture camera
- Paste signal
- Gallery import
- Review parsed signal
- Trade confirmation

These should feel like a linear workflow, not separate apps.

## 4. Screen architecture

## 4.1 Scan

Purpose: get a signal into the app as fast as possible.

Primary layout:

- Hero card with the current trading status and wallet connection state
- Large capture action
- Secondary actions for paste and gallery
- Recent examples or last scanned signal

Key elements:

- `Scan signal` primary button
- `Paste text` secondary button
- `Import image` secondary button
- Wallet chip with connected / disconnected state
- Small note explaining on-device parsing

Design intent:

- one focal action
- no clutter
- clear trust message

## 4.2 Review

Purpose: let the user confirm the parsed signal before verification.

Primary layout:

- Parsed pair
- Direction pill
- Entry / stop / take-profits fields
- Editable form rows
- Confidence indicator from the parser
- `Verify signal` CTA

Interaction rules:

- editable fields should expand inline
- corrections should preserve prior values
- invalid fields must show inline error text

## 4.3 Verify

Purpose: show the SMC / ICT result and whether the signal is worth taking.

Primary layout:

- Rating hero card
- Score letter and percentage
- Position size multiplier
- Human-readable justification
- Multi-timeframe breakdown
- Confluence summary

Recommended structure:

- top: rating and verdict
- middle: concise justification
- bottom: timeframe chips and supporting factors

The rating card should be the visual anchor of the app.

### Rating treatment

- `A+` and `A`: green gradient glow, but subtle
- `B`: cyan / neutral confidence
- `C`: amber caution
- `D`: red warning, visually discouraging approval

## 4.4 Confirm

Purpose: summarize the trade before wallet signing.

Primary layout:

- pair
- side
- size
- leverage
- stop loss and TPs
- estimated risk
- wallet sign action
- network indicator

This screen should feel final and deliberate.

Include a clear warning that the wallet will review the transaction.

## 4.5 History

Purpose: show prior signals and executed trades.

Primary layout:

- list of signal cards
- rating, pair, direction, timestamp
- tx status and explorer link
- executed / rejected / failed states

Empty state should explain that past signals will appear here after approval.

## 4.6 Settings

Purpose: control wallet, risk, network, and engine preferences.

Primary layout:

- wallet connection section
- risk settings
- network selector
- engine toggles
- privacy note

Settings should be grouped into cards with clear labels and minimal prose.

## 5. Key components

### 5.1 Hero stat card

Used for:

- rating
- risk
- wallet balance
- transaction status

Layout:

- label
- primary value
- supporting text
- optional action

### 5.2 Signal card

Used in history and review summaries.

Fields:

- pair
- direction
- rating
- confidence
- timestamp

### 5.3 Verification breakdown

Used on the Verify screen.

Contains:

- timeframe chips
- structure status
- order block status
- FVG status
- EMA trend
- session / killzone

### 5.4 Step tracker

Used for the end-to-end flow.

Steps:

1. Capture
2. Parse
3. Verify
4. Confirm
5. Sign
6. Execute

This should appear where it helps orientation, not on every screen.

### 5.5 Wallet chip

States:

- disconnected
- connecting
- connected
- rejected

The chip should be compact but always visible on the main flow screens.

## 6. Copy tone

Copy should be:

- short
- direct
- calm
- specific

Examples:

- `Scan a signal`
- `Verify before you trade`
- `Wallet connected`
- `No signal parsed yet`
- `Transaction submitted`
- `Signal rejected by engine`

Avoid verbose fintech copy and anything that sounds promotional.

## 7. State model

Every major screen must include these states:

- loading
- empty
- error
- success

### Loading

- use skeleton cards, not a lone spinner
- keep layout stable

### Empty

- explain what to do next
- include one primary action

### Error

- state the failure plainly
- give a retry action
- avoid technical jargon unless it helps debugging

### Success

- confirm the outcome
- show the next step

## 8. Android-specific choices

- Use touch targets that are easy to hit with one thumb
- Keep the primary CTA docked near the lower third of the screen
- Respect safe areas and gesture bars
- Prefer bottom sheets for quick edits and confirmations
- Make hardware back behavior predictable

## 9. Recommended screen flow

```text
Scan
  -> Parse
    -> Review
      -> Verify
        -> Confirm
          -> Wallet Sign
            -> Execute
              -> History
```

This flow should be obvious from the interface without needing onboarding text.

## 10. Implementation notes

When the app scaffold arrives:

- keep the nav structure minimal
- design the Verify screen first
- build the rating card as the visual centerpiece
- use semantic color tokens from day one
- avoid generic card stacks and dashboard clutter
- show trust cues early: on-device parsing, non-custodial signing, network status

## 11. What to avoid

- neon overload
- generic white fintech screens
- excessive charts in the MVP
- three different button styles for the same action type
- hidden primary actions
- tiny helper text that becomes unreadable on phones
- decorative gradients without meaning
- showing too much technical detail before the user needs it

## 12. MVP interface summary

The ideal first release is a focused Android workflow with:

- a strong scan entry point
- a clean parse review step
- a high-trust verification card
- a deliberate confirmation screen
- a simple history trail
- a restrained settings page

That is enough to make LazyTrader feel like a real product without overbuilding it.

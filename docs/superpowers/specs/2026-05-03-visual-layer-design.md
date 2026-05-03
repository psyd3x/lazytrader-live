---
title: LazyTrader Visual Layer — Design
description: Visual rebuild of the LazyTrader Android MVP — replaces the unstyled stub with a Solana-branded UI built around the existing SMC engine output. Covers Home/Capture/Settings screens, bottom-tab nav, hybrid Verify composition, and OCR-from-screenshot capture.
type: design
project: lazytrader
phase: visual-layer
status: approved
date: 2026-05-03
created: 2026-05-03
tags: [design, lazytrader, ui, react-native, solana, smc]
---

# LazyTrader Visual Layer — Design

**Related**: [[UI-DESIGN-SYSTEM]] · [[IMPLEMENTATION-PLAN]] · [[ARCHITECTURE]] · [[PRD]]

**Mockups (visual companions, kept in repo)**:
- `docs/palette-preview.html` — palette comparison (Option A locked)
- `docs/verify-layout-options.html` — Verify composition (hybrid C locked)
- `docs/full-mockup.html` — final 4-screen mockup

## 1. Goal

Replace the unstyled M1/M2 stub with a coherent Solana-branded mobile UI built around the validated SMC engine. **No engine changes**, no new screens beyond the existing three. Optimised for the demo flow: paste/upload signal → see verdict + multi-TF dashboard → tap Confirm.

## 2. Constraints

- Android-only (per PRD)
- One EAS Cloud Build acceptable (~15 min) for new native deps
- No backend
- Engine output (`SignalVerificationReport`) is the only data source
- Privacy: no Telegram screenshots saved or transmitted server-side; OCR is on-device via ML Kit

## 3. Locked decisions (from brainstorm)

| # | Decision | Why |
|---|----------|-----|
| Q1 | **Scope: rewrite all 3 screens + bottom nav** | A is jarring (themed Capture next to white Home), C is premature (Scan/Verify split needs M3/M4) |
| Q2 | **Verify composition: hybrid C** — hero + dashboard primary, factor chips, sizing strip, expandable details | A loses sizing info, B competes with the dashboard for attention |
| Q3 | **Bottom tabs via `@react-navigation/bottom-tabs`** | Same family as installed nav lib, gestures + safe-area handled |
| Q4 | **Add `@expo/vector-icons` + `expo-linear-gradient`** | Required for proper tabs + brand backdrop; one rebuild covers them |
| — | **Capture inputs: paste + upload screenshot** (no live camera in MVP) | Live camera is rare for trading-signal use; vision-camera stays dormant for future re-enablement |

## 4. Architecture

```
src/
  theme/                          ✅ already built (locked)
    tokens.ts                     colors, fonts, radius, space, ratingColor()
    index.ts                      barrel
  components/                     NEW
    RatingHeroCard.tsx            grade letter + pct + verdict + LONG/size/session pills
    MultiTimeframeDashboard.tsx   7-row × 4-col matrix (TF × struct/OB/FVG/EMA)
    FactorChips.tsx               7 g/y/r status chips for scoring factors
    SizingStrip.tsx               $size · $risk · SL% one-line strip
    DetailsAccordion.tsx          collapsible: justification + per-factor 1-liners
    WalletChip.tsx                topbar chip (DISCONNECTED stub for now)
    NetBadge.tsx                  topbar DEVNET badge
    ScreenBackdrop.tsx            LinearGradient wrapper used by all 3 screens
    PrimaryCTA.tsx                themed primary + secondary button variants
    UploadScreenshotButton.tsx    secondary CTA → image picker → OCR → text
  navigation/                     NEW
    AppTabs.tsx                   BottomTabs config (Home, Capture, Settings + Ionicons)
  input/                          NEW
    ocr.ts                        thin ML Kit wrapper: imageUri → string
  screens/
    HomeScreen.tsx                REWRITE — branded landing, last-signal recall, CTA
    CaptureScreen.tsx             REWRITE — paste field + upload + composed Verify view
    SettingsScreen.tsx            REWRITE — themed structural stub (real settings = M8)
  data/                           unchanged
  smc/                            unchanged
```

**Component boundary rules**:
- Each component in `components/` is a leaf — no cross-imports between siblings
- `CaptureScreen` is the only composer; it owns the engine call and the data adapters
- All hex/font/spacing values come from `src/theme` — zero inline literals in `screens/` or `components/`

## 5. Data flow

```
User → paste OR upload → CaptureScreen state.signalText
                          │
                          ▼
                    [Verify pressed]
                          │
                          ▼
        generateSignalVerification({signal, candleData, ...})
                          │
                          ▼ SignalVerificationReport
                          │
                ┌─────────┼─────────┬────────────┐
                ▼         ▼         ▼            ▼
        toHeroProps  toDashboard  toFactorChips toSizing
        (inline)     Rows         (inline)      Stats
                          │
                          ▼
        <RatingHeroCard /> <MultiTimeframeDashboard />
        <FactorChips />    <SizingStrip />
        <DetailsAccordion />
```

The four `to*` adapters live inline in `CaptureScreen.tsx` — small enough not to warrant extraction. If they grow past ~20 lines each, extract to `src/screens/captureAdapters.ts`.

**Open data question** (resolved during implementation): the dashboard reads `confluence.timeframeBreakdown`. If the `ConfluenceEngine` doesn't expose per-TF struct/OB/FVG/EMA in a directly-renderable shape, the adapter pulls from `analyzer.analyzeTimeframe()` results instead. Either way, **no engine modifications** — the adapter does the shaping.

## 6. Screen-by-screen

### 6.1 Home

- Topbar: `<WalletChip />` + `<NetBadge />`
- Brand block: 56×56 logomark (purple→green linear gradient), "LazyTrader" title, one-line value prop
- 24h stats grid (2-col): "Signals scanned" + "A+/A rated" — both display "—" until M7 history is wired (no fake numbers)
- Last verified card: rating badge + pair + relative timestamp — display "No signals yet" empty state until M7
- Primary CTA: "Verify a new signal" → switches to Capture tab

### 6.2 Capture

**Empty state**:
- Topbar
- Title + 1-line subtitle
- Paste `TextInput` card (signal text)
- `<UploadScreenshotButton />` secondary CTA
- Empty-state hint card
- `<PrimaryCTA>Verify with SMC engine</PrimaryCTA>`

**Loading state**: Verify button shows spinner, hint card swapped for skeleton.

**Error state**: Hint card replaced by error card (red border, message, retry button).

**Verified state** (hybrid C):
- Topbar (unchanged)
- `<RatingHeroCard />`
- `<MultiTimeframeDashboard />`
- `<FactorChips />`
- `<SizingStrip />`
- `<DetailsAccordion />` (collapsed by default; tapping expands justification + per-factor detail)
- `<PrimaryCTA>Confirm trade →</PrimaryCTA>` (no-op for now; wired in M5/M6)

### 6.3 Settings

Sectioned card list, all values are stubs/placeholders:
- **Wallet**: status (Disconnected) + Connect Phantom button (no-op until M5)
- **Network**: Cluster (Devnet badge) + RPC URL
- **Risk**: max risk %, max leverage, account balance (read-only stubs)
- **Engine**: version, "Golden fixtures: 27/27 ✓"

No interactivity required for this scope. M8 will make these editable.

## 7. Navigation

`App.tsx` swaps from `NativeStackNavigator` to wrapping `<AppTabs />`. `AppTabs.tsx`:

```ts
const Tab = createBottomTabNavigator();
<Tab.Navigator
  screenOptions={{
    headerShown: false,
    tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.muted,
  }}
  initialRouteName="Capture"
>
  <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: ({color, size}) => <Ionicons name="home-outline" {...} /> }} />
  <Tab.Screen name="Capture" component={CaptureScreen} options={{ tabBarIcon: ({color, size}) => <Ionicons name="scan-outline" {...} /> }} />
  <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: ({color, size}) => <Ionicons name="settings-outline" {...} /> }} />
</Tab.Navigator>
```

Default landing tab: **Capture** (matches mockup, primary user intent).

## 8. Theming

All visual values come from `src/theme/tokens.ts` (already built). New components MUST import from `../theme` rather than inline. Lockfile: any color/font/radius change goes through `tokens.ts` first, never patched in a component.

## 9. Dependency changes

```bash
pnpm add @react-navigation/bottom-tabs
npx expo install @expo/vector-icons expo-linear-gradient
```

`@expo/vector-icons` and `expo-linear-gradient` are native modules → **single EAS Cloud Build required** before phone-side iteration resumes. `@react-navigation/bottom-tabs` is JS-only (peer-deps `react-native-screens` and `react-native-safe-area-context`, both already installed) so no rebuild on its own. The build for the other two carries it for free.

```bash
source ~/.expo-token.zsh
eas build --profile development --platform android
# wait ~15 min, then ADB-install the resulting APK on phone via Tailscale:
adb -s 100.84.228.67:5555 install path/to/build.apk
```

After install, hot-reload picks up everything else.

`vision-camera` and `@react-native-ml-kit/text-recognition` stay as-is in `package.json` — already installed, ML Kit gets used by the new `src/input/ocr.ts`.

## 10. Testing

- `pnpm exec tsc --noEmit` — must stay clean throughout
- `pnpm test` — existing 27 SMC fixtures must stay green (engine untouched)
- **No new component tests** in this scope — RN component testing setup (jest + react-test-renderer + RN preset) is non-trivial and would balloon this work. Tracked as future scope.
- Visual verification = phone hot-reload pass at the end of each component implementation

## 11. Out of scope (explicit)

- Splitting Capture into separate Scan + Verify screens (waits for M3 + M4)
- Real wallet connection / MWA (M5)
- Real Drift order construction (M6)
- History screen / persistent signal log (M7)
- Editable settings (M8)
- Custom font loading via `expo-font` (Inter falls back to platform sans, documented in `tokens.ts`)
- Animations / micro-interactions (post-M8 polish)
- Component snapshot tests (future scope)
- Live camera capture (parked as follow-up — `vision-camera` already in deps, ~30 min to enable when needed)
- Full M4 parser pipeline (regex → NuExtract → schema-validated `ParsedSignal`) — `src/input/ocr.ts` only does raw `imageUri → string`; user mentally parses by editing the resulting text

## 12. Risks

| Risk | Mitigation |
|------|------------|
| EAS rebuild fails for new native deps | Commit dep changes in their own commit before rebuild → `git reset --hard HEAD~1` reverts cleanly |
| `confluence.timeframeBreakdown` shape doesn't match dashboard needs | Adapter pulls from `analyzer.analyzeTimeframe()` instead. No engine change either way. |
| Tab nav re-anchoring loses phone state on first reload | Cosmetic — user gets bumped to default tab once. Acceptable. |
| ML Kit OCR fails on certain screenshot formats | Empty/error result surfaces in error state; user falls back to paste. No silent failure. |
| `expo-linear-gradient` rendering differs across Android versions | Backdrop uses subtle gradient; flat fallback is acceptable. Test on dev phone (`fbi-van-42`). |

## 13. Success criteria

- All three screens (Home, Capture, Settings) render with locked palette + bottom-tab navigation
- Capture screen accepts both paste and screenshot upload, runs engine, renders hybrid-C verify view
- Existing 27/27 SMC fixtures still pass; `tsc --noEmit` exits 0
- Hot-reload-verified on phone (`fbi-van-42` via Tailscale)
- No engine modifications — all changes live in `src/theme/`, `src/components/`, `src/navigation/`, `src/input/`, `src/screens/`
- No commits pushed without explicit user approval

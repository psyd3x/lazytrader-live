---
title: LazyTrader Visual Layer Implementation Plan
description: Bite-sized task-by-task plan to ship the LazyTrader visual layer rebuild — 19 tasks covering deps, EAS rebuild, 11 components, navigation, 3 screen rewrites, and phone verification.
type: implementation-plan
project: lazytrader
phase: visual-layer
status: ready
date: 2026-05-03
created: 2026-05-03
tags: [plan, lazytrader, ui, react-native, solana, smc]
---

# LazyTrader Visual Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Related**: [[2026-05-03-visual-layer-design]] · [[UI-DESIGN-SYSTEM]] · [[IMPLEMENTATION-PLAN]] · [[ARCHITECTURE]]

**Spec:** `docs/superpowers/specs/2026-05-03-visual-layer-design.md`

**Goal:** Replace LazyTrader's M1/M2 unstyled stub with a Solana-branded mobile UI built around the existing SMC engine output — three themed screens, bottom-tab nav, hybrid Verify composition, and OCR-from-screenshot capture.

**Architecture:** All visuals live under `src/theme/` (already done), `src/components/`, `src/navigation/`, `src/input/`. Screens become thin composers. Engine and existing data layer stay untouched. One EAS Cloud Build gate sits in the middle to enable native deps.

**Tech Stack:** React Native 0.81 + Expo SDK 54, TypeScript strict, `@react-navigation/bottom-tabs`, `@expo/vector-icons` (Ionicons), `expo-linear-gradient`, `expo-image-picker`, `@react-native-ml-kit/text-recognition`. pnpm. EAS Cloud Build.

---

## Notes for the executor

**Testing approach.** This is RN UI work. The spec explicitly defers component snapshot tests (jest + react-test-renderer setup is heavy and out of scope). The verification loop per task is:

1. `pnpm exec tsc --noEmit` — must exit 0
2. Visual inspection on the phone via Metro hot-reload (after Task 3, when the new APK is installed)
3. At plan end: `pnpm test` — existing 27 SMC fixtures must stay green (engine untouched)

**Commit cadence.** One commit per task. Conventional commits (`feat:`, `chore:`, etc.). Never push unless the user explicitly asks.

**Phone setup (already in place from previous session):**
- Phone IP via Tailscale: `100.84.228.67`
- Mac Metro IP: `100.88.202.3:8081`
- ADB target string: `100.84.228.67:5555`
- EAS token: `source ~/.expo-token.zsh` before any `eas` command in automated shells
- Project ID: `c0c01c8e-232d-4e52-a49f-17a8cf8ecff3`

**Engine output reference (already explored — line numbers locked):**
- `SignalVerificationReport` shape — `src/smc/scorer.ts:644-654`
- `TimeframeAnalysis` — `src/smc/models.ts:188-198`
- `StructureResult` — `src/smc/models.ts:112-121` (`bias: Direction`, where `Direction = -1 | 0 | 1`)
- `EMAResult` — `src/smc/models.ts:169-175` (`direction: Direction`)
- `NearestZone` — `src/smc/models.ts:160-166` (`direction: Direction`, `isInside: boolean`)
- `ScoreReport.factors` keys (7 of them) — `src/smc/scorer.ts:153-161`:
  - `timeframe_alignment`, `entry_quality`, `structure`, `risk_reward_quality`, `htf_trend`, `swing_position`, `zone_confluence`

---

## Task 1: Install deps

**Files:**
- Modify: `package.json` (deps section, auto via pnpm/expo)
- Modify: `pnpm-lock.yaml` (auto)

**Why:** Bottom tabs, icons, gradient, and image picker are all required by the new components. Image picker is a native module → pulls into the same EAS rebuild.

- [ ] **Step 1: Install JS-only nav lib**

```bash
cd ~/lazytrader-app
pnpm add @react-navigation/bottom-tabs
```

Expected: package added to `dependencies` in `package.json`. No native code changes.

- [ ] **Step 2: Install three native Expo modules**

```bash
cd ~/lazytrader-app
npx expo install @expo/vector-icons expo-linear-gradient expo-image-picker
```

Expected: three packages added. `expo install` picks SDK-54-compatible versions automatically.

- [ ] **Step 3: Verify all four are present**

```bash
cd ~/lazytrader-app && grep -E '"(@react-navigation/bottom-tabs|@expo/vector-icons|expo-linear-gradient|expo-image-picker)"' package.json
```

Expected: 4 lines printed. If fewer, re-run the missing installs.

- [ ] **Step 4: Typecheck still clean**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit
echo "TSC_EXIT=$?"
```

Expected: `TSC_EXIT=0`.

- [ ] **Step 5: Commit**

```bash
cd ~/lazytrader-app
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add bottom-tabs, vector-icons, linear-gradient, image-picker

Required for the visual layer rebuild. Three are native modules
and trigger an EAS rebuild before iteration resumes on phone."
```

---

## Task 2: Trigger EAS Cloud Build

**Files:** none (build artifact lives on EAS).

**Why:** Three of the new deps are native modules. The dev client APK on the phone has to be rebuilt before they're usable. ~15 min of wall time, mostly waiting.

- [ ] **Step 1: Source EAS auth and trigger the build**

```bash
cd ~/lazytrader-app
source ~/.expo-token.zsh
eas build --profile development --platform android --non-interactive
```

Expected: build queues, prints a build ID like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` and a URL `https://expo.dev/.../builds/<id>`. CLI will stream progress.

- [ ] **Step 2: Wait for build to finish (~12-18 min)**

Watch CLI output OR open the URL in a browser. Status progresses: `in queue` → `in progress` → `finished`. Final log line should include the APK download URL.

If build **fails** (red status): read the EAS log, fix the underlying issue (usually a peer-dep mismatch on a fresh install), re-run Step 1. Do NOT proceed to Task 3 until status is `finished`.

- [ ] **Step 3: Capture the build artifact URL**

The CLI prints something like:
```
✔ Build finished
  Android app: https://expo.dev/artifacts/eas/<id>.apk
```

Note this URL for Task 3.

---

## Task 3: Install fresh APK on phone

**Files:** none.

**Why:** Replaces the existing development build on `fbi-van-42` with the one that has the new native modules registered.

- [ ] **Step 1: Download the APK locally**

```bash
cd /tmp
curl -L -o lazytrader-dev.apk "<URL from Task 2 Step 3>"
ls -lh lazytrader-dev.apk
```

Expected: file ~280-310 MB.

- [ ] **Step 2: Confirm phone is reachable over Tailscale**

```bash
adb -s 100.84.228.67:5555 shell echo "phone-online"
```

Expected: `phone-online`. If "device offline" or "no devices/emulators found", run `adb connect 100.84.228.67:5555` then re-try.

- [ ] **Step 3: Install (replacing existing build)**

```bash
adb -s 100.84.228.67:5555 install -r /tmp/lazytrader-dev.apk
```

Expected: `Performing Streamed Install ... Success`. Takes ~30-90 sec.

- [ ] **Step 4: Confirm Metro is still running on Mac**

```bash
lsof -iTCP:8081 -sTCP:LISTEN
```

Expected: a `node` PID listed. If empty, restart Metro:

```bash
cd ~/lazytrader-app
REACT_NATIVE_PACKAGER_HOSTNAME=100.88.202.3 pnpm exec expo start --dev-client
```

(Run in background or new terminal.)

- [ ] **Step 5: Open app on phone, confirm it loads against Metro**

Manual: launch `live.lazytrader` on the phone. Dev client should auto-connect to `http://100.88.202.3:8081` (saved from previous session). Existing Capture stub should render. If it shows "Cannot connect to Metro," tap the URL field and re-enter `http://100.88.202.3:8081`.

- [ ] **Step 6: Clean up the downloaded APK**

```bash
rm /tmp/lazytrader-dev.apk
```

(Per global CLAUDE.md: clean up artifacts.)

No commit required — this is environment setup only.

---

## Task 4: ScreenBackdrop component

**Files:**
- Create: `src/components/ScreenBackdrop.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/ScreenBackdrop.tsx
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ReactNode } from "react";

import { colors } from "../theme";

/**
 * Branded full-bleed backdrop used by every top-level screen.
 *
 * Renders the deep-navy base plus two corner washes (purple top-left,
 * green hint top-right) to give the app its Solana atmosphere without
 * needing radial gradients (which RN can't do natively).
 *
 * Children are rendered inside a SafeAreaView so the topbar / nav bar
 * cutouts don't overlap content.
 */
export function ScreenBackdrop({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      {/* Base */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />
      {/* Purple top-left wash */}
      <LinearGradient
        colors={["rgba(153, 69, 255, 0.18)", "rgba(153, 69, 255, 0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 0.5 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Green top-right hint */}
      <LinearGradient
        colors={["rgba(20, 241, 149, 0.10)", "rgba(20, 241, 149, 0)"]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.4, y: 0.4 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
});
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit
echo "TSC_EXIT=$?"
```

Expected: `TSC_EXIT=0`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ScreenBackdrop.tsx
git commit -m "feat(ui): add ScreenBackdrop component

Branded full-bleed wrapper with deep-navy base and two corner
LinearGradient washes (Solana purple top-left, green top-right).
Used by every top-level screen. Wraps children in SafeAreaView."
```

---

## Task 5: WalletChip component

**Files:**
- Create: `src/components/WalletChip.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/WalletChip.tsx
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts, fontSize, radius, space } from "../theme";

export type WalletChipState = "disconnected" | "connecting" | "connected";

interface Props {
  state: WalletChipState;
  /** Truncated pubkey to show when connected, e.g. "7xKp…aR8q". */
  shortAddress?: string;
}

/**
 * Compact topbar chip showing wallet connection status.
 * Stub for now — wallet logic lands in M5.
 */
export function WalletChip({ state, shortAddress }: Props) {
  const dotColor =
    state === "connected" ? colors.success
    : state === "connecting" ? colors.warning
    : colors.muted;

  const label =
    state === "connected" ? (shortAddress ?? "CONNECTED")
    : state === "connecting" ? "CONNECTING…"
    : "DISCONNECTED";

  return (
    <View style={styles.chip}>
      <View style={[styles.dot, { backgroundColor: dotColor, opacity: state === "disconnected" ? 0.5 : 1 }]} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: fontSize.xs,
    color: colors.muted,
    letterSpacing: 0.5,
  },
});
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit
echo "TSC_EXIT=$?"
```

Expected: `TSC_EXIT=0`.

- [ ] **Step 3: Commit**

```bash
git add src/components/WalletChip.tsx
git commit -m "feat(ui): add WalletChip component

Compact topbar chip with status dot + label. Stub for now —
real MWA wiring lands in M5."
```

---

## Task 6: NetBadge component

**Files:**
- Create: `src/components/NetBadge.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/NetBadge.tsx
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts, fontSize, radius, space } from "../theme";

export type Network = "devnet" | "mainnet" | "testnet";

interface Props {
  network: Network;
}

/** Topbar badge showing the active Solana cluster. */
export function NetBadge({ network }: Props) {
  const isDevnet = network === "devnet" || network === "testnet";
  return (
    <View style={[styles.badge, isDevnet ? styles.warn : styles.ok]}>
      <Text style={[styles.label, isDevnet ? styles.labelWarn : styles.labelOk]}>
        {network.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  warn: { backgroundColor: colors.warningBg },
  ok: { backgroundColor: colors.successBg },
  label: {
    fontFamily: fonts.mono,
    fontSize: fontSize.xs - 1,
    letterSpacing: 0.6,
    fontWeight: "600",
  },
  labelWarn: { color: colors.warning },
  labelOk: { color: colors.success },
});
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit
echo "TSC_EXIT=$?"
```

Expected: `TSC_EXIT=0`.

- [ ] **Step 3: Commit**

```bash
git add src/components/NetBadge.tsx
git commit -m "feat(ui): add NetBadge component

Topbar cluster badge — amber for devnet/testnet, green for mainnet."
```

---

## Task 7: PrimaryCTA component

**Files:**
- Create: `src/components/PrimaryCTA.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/PrimaryCTA.tsx
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { colors, fontSize, fontWeight, radius, space } from "../theme";

interface Props {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary";
  loading?: boolean;
  disabled?: boolean;
}

/**
 * App-wide CTA button. Two variants:
 *  - primary   filled Solana-purple, glows softly. Use for the main action.
 *  - secondary outlined surface, calmer. Use for secondary actions like
 *              "Upload screenshot" alongside a primary "Verify".
 */
export function PrimaryCTA({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
}: Props) {
  const isPrimary = variant === "primary";
  const inert = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inert}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        pressed && !inert && (isPrimary ? styles.primaryPressed : styles.secondaryPressed),
        inert && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? "#fff" : colors.text} />
      ) : (
        <Text style={[styles.label, isPrimary ? styles.labelPrimary : styles.labelSecondary]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 13,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  primaryPressed: { opacity: 0.85 },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryPressed: { backgroundColor: colors.surface2 },
  disabled: { opacity: 0.55 },
  label: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.2,
  },
  labelPrimary: { color: "#fff" },
  labelSecondary: { color: colors.text },
});
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit
echo "TSC_EXIT=$?"
```

Expected: `TSC_EXIT=0`.

- [ ] **Step 3: Commit**

```bash
git add src/components/PrimaryCTA.tsx
git commit -m "feat(ui): add PrimaryCTA button

Primary (filled purple, soft glow) and secondary (outlined surface)
variants. Handles loading + disabled states."
```

---

## Task 8: RatingHeroCard component

**Files:**
- Create: `src/components/RatingHeroCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/RatingHeroCard.tsx
import { StyleSheet, Text, View } from "react-native";

import { colors, fontSize, fontWeight, radius, space, ratingColor } from "../theme";

interface Props {
  rating: string;        // "A+" | "A" | "B" | "C" | "D"
  scorePct: number;      // 0-100
  verdict: string;       // 1-sentence justification
  side: "LONG" | "SHORT";
  sizeMult: number;      // e.g. 1.5 → "1.5× SIZE"
  sessionTag?: string;   // e.g. "ASIA · OB"
}

export function RatingHeroCard({ rating, scorePct, verdict, side, sizeMult, sessionTag }: Props) {
  const grade = ratingColor(rating);
  return (
    <View style={styles.card}>
      <View style={styles.gradeRow}>
        <Text style={[styles.grade, { color: grade }]}>{rating}</Text>
        <Text style={styles.pct}>{Math.round(scorePct)}%</Text>
      </View>
      <Text style={styles.verdict}>{verdict}</Text>
      <View style={styles.metaRow}>
        <SidePill side={side} />
        <Pill bg={colors.primaryBg} color={colors.primary} label={`${sizeMult.toFixed(1)}× SIZE`} />
        {sessionTag !== undefined && (
          <Pill bg={colors.surface2} color={colors.muted} label={sessionTag} bordered />
        )}
      </View>
    </View>
  );
}

function SidePill({ side }: { side: "LONG" | "SHORT" }) {
  if (side === "LONG") return <Pill bg={colors.successBg} color={colors.success} label="LONG" />;
  return <Pill bg={colors.dangerBg} color={colors.danger} label="SHORT" />;
}

function Pill({
  bg, color, label, bordered = false,
}: { bg: string; color: string; label: string; bordered?: boolean }) {
  return (
    <View style={[
      styles.pill,
      { backgroundColor: bg },
      bordered && { borderWidth: 1, borderColor: colors.border },
    ]}>
      <Text style={[styles.pillLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  gradeRow: { flexDirection: "row", alignItems: "baseline", gap: space.md, marginBottom: 4 },
  grade: { fontSize: 52, lineHeight: 56, fontWeight: fontWeight.black, letterSpacing: -2 },
  pct: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text },
  verdict: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 18, marginBottom: space.md },
  metaRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  pill: { paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.pill },
  pillLabel: { fontSize: fontSize.xs - 1, fontWeight: fontWeight.semibold, letterSpacing: 0.3 },
});
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit
echo "TSC_EXIT=$?"
```

Expected: `TSC_EXIT=0`.

- [ ] **Step 3: Commit**

```bash
git add src/components/RatingHeroCard.tsx
git commit -m "feat(ui): add RatingHeroCard component

Visual centerpiece of the Verify view per UI-DESIGN-SYSTEM.md §4.3.
Big grade letter (color-coded by rating), score %, verdict line,
side / size / session pills."
```

---

## Task 9: MultiTimeframeDashboard component

**Files:**
- Create: `src/components/MultiTimeframeDashboard.tsx`

**Why:** The dashboard is the data centerpiece — Pine-style 7×4 matrix (TF rows × structure/OB/FVG/EMA columns). Reads directly from `report.timeframeAnalyses` (already part of `SignalVerificationReport`).

- [ ] **Step 1: Write the component**

```tsx
// src/components/MultiTimeframeDashboard.tsx
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

/** One row of the dashboard. `direction` fields: -1 bear, 0 neutral, +1 bull. */
export interface DashboardRow {
  tf: string;        // "1W" | "1D" | "4H" | "1H" | "15m" | "5m" | "1m" | …
  struct: number;
  /** True iff structure is in a "strong" state — renders as filled tint. */
  structStrong?: boolean;
  ob: number;
  fvg: number;
  ema: number;
}

interface Props {
  rows: readonly DashboardRow[];
  pair: string;
}

/** Pine-style multi-TF dashboard. Rows = HTF→LTF, columns = SMC factor. */
export function MultiTimeframeDashboard({ rows, pair }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.headerLeft}>Multi-TF</Text>
        <Text style={styles.headerRight}>{pair}</Text>
      </View>
      <View style={styles.headRow}>
        <Cell text="TF" head left />
        <Cell text="Struct" head />
        <Cell text="OB" head />
        <Cell text="FVG" head />
        <Cell text="EMA" head />
      </View>
      {rows.map((r) => (
        <View key={r.tf} style={styles.row}>
          <Cell text={r.tf} left bold />
          <DirCell value={r.struct} strong={r.structStrong} text={structLabel(r.struct)} />
          <DirCell value={r.ob} text={arrow(r.ob)} />
          <DirCell value={r.fvg} text={arrow(r.fvg)} />
          <DirCell value={r.ema} text={arrow(r.ema)} />
        </View>
      ))}
    </View>
  );
}

function structLabel(d: number): string {
  if (d > 0) return "BULL";
  if (d < 0) return "BEAR";
  return "RANGE";
}

function arrow(d: number): string {
  if (d > 0) return "↑";
  if (d < 0) return "↓";
  return "—";
}

function DirCell({ value, text, strong }: { value: number; text: string; strong?: boolean }) {
  let color = colors.muted;
  if (value > 0) color = colors.success;
  else if (value < 0) color = colors.danger;
  const bg = strong
    ? value > 0 ? colors.successBg
    : value < 0 ? colors.dangerBg
    : "transparent"
    : "transparent";
  return (
    <View style={[styles.cell, { backgroundColor: bg }]}>
      <Text style={[styles.cellText, { color, fontWeight: value === 0 ? "400" : "600" }]}>
        {text}
      </Text>
    </View>
  );
}

function Cell({
  text, head = false, bold = false, left = false,
}: { text: string; head?: boolean; bold?: boolean; left?: boolean }) {
  return (
    <View style={[styles.cell, left && styles.cellLeft, head && styles.cellHead]}>
      <Text
        style={[
          styles.cellText,
          head && styles.cellHeadText,
          bold && { color: colors.text, fontWeight: fontWeight.bold },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: space.md,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headerLeft: {
    fontSize: fontSize.xs - 1,
    color: colors.muted,
    letterSpacing: 1,
  },
  headerRight: {
    fontFamily: fonts.mono,
    fontSize: fontSize.xs - 1,
    color: colors.text,
    letterSpacing: 1,
  },
  headRow: { flexDirection: "row", backgroundColor: colors.surface2 },
  row: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(143,161,179,0.06)" },
  cell: { flex: 1, paddingVertical: 6, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  cellLeft: { alignItems: "flex-start", paddingLeft: space.md, flex: 0.7 },
  cellHead: { paddingVertical: 7 },
  cellText: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted },
  cellHeadText: { fontSize: 9, letterSpacing: 0.6, fontWeight: fontWeight.semibold, textTransform: "uppercase" },
});
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit
echo "TSC_EXIT=$?"
```

Expected: `TSC_EXIT=0`.

- [ ] **Step 3: Commit**

```bash
git add src/components/MultiTimeframeDashboard.tsx
git commit -m "feat(ui): add MultiTimeframeDashboard component

Pine-style 7-row × 4-col SMC matrix (TF × structure/OB/FVG/EMA).
Color-coded cells, monospace numerals. Takes pre-shaped DashboardRow[]
so the screen layer owns the engine→props adapter."
```

---

## Task 10: FactorChips component

**Files:**
- Create: `src/components/FactorChips.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/FactorChips.tsx
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

export type FactorSeverity = "good" | "ok" | "bad";

export interface FactorChip {
  /** Short display label e.g. "struct", "OB", "EMA". */
  label: string;
  /** 0-100 integer score. */
  score: number;
  severity: FactorSeverity;
}

interface Props {
  chips: readonly FactorChip[];
}

/** Compact g/y/r status chips for the 7 scoring factors. */
export function FactorChips({ chips }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Factors</Text>
      <View style={styles.row}>
        {chips.map((c) => (
          <View key={c.label} style={styles.chip}>
            <View style={[styles.dot, { backgroundColor: dotColor(c.severity) }]} />
            <Text style={styles.label}>{c.label} {c.score}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function dotColor(s: FactorSeverity): string {
  if (s === "good") return colors.success;
  if (s === "ok") return colors.warning;
  return colors.danger;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: space.md,
  },
  title: {
    fontSize: fontSize.xs - 1,
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
    fontWeight: fontWeight.semibold,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontFamily: fonts.mono, fontSize: 10, color: colors.text },
});
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit
echo "TSC_EXIT=$?"
```

Expected: `TSC_EXIT=0`.

- [ ] **Step 3: Commit**

```bash
git add src/components/FactorChips.tsx
git commit -m "feat(ui): add FactorChips component

Compact g/y/r status pills for the 7 scoring factors. Severity
colored by dot, score inline as text. Adapter on screen side
maps engine factor scores 0-1 → 0-100 integer + severity bucket."
```

---

## Task 11: SizingStrip component

**Files:**
- Create: `src/components/SizingStrip.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/SizingStrip.tsx
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

interface Props {
  /** USD position size. */
  size: number;
  /** USD risk amount. */
  risk: number;
  /** Risk as % of account, e.g. 1.0. */
  riskPct: number;
  /** Stop-loss distance as %, e.g. 0.66. */
  slPct: number;
}

/** One-line strip with the 3 numbers a trader checks before signing. */
export function SizingStrip({ size, risk, riskPct, slPct }: Props) {
  return (
    <View style={styles.strip}>
      <Stat valueBold={fmtUsd(size)} valueSuffix="size" />
      <Stat valueBold={`${fmtUsd(risk)}`} valueSuffix={`· ${riskPct.toFixed(2)}%`} />
      <Stat valueBold={`${slPct.toFixed(2)}%`} valueSuffix="SL" />
    </View>
  );
}

function Stat({ valueBold, valueSuffix }: { valueBold: string; valueSuffix: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.text}>
        <Text style={styles.bold}>{valueBold}</Text>
        {" "}
        {valueSuffix}
      </Text>
    </View>
  );
}

function fmtUsd(n: number): string {
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  return `$${n.toFixed(2)}`;
}

const styles = StyleSheet.create({
  strip: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    paddingVertical: 8,
    paddingHorizontal: space.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stat: { flex: 1, alignItems: "flex-start" },
  text: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted },
  bold: { color: colors.text, fontWeight: fontWeight.bold },
});
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit
echo "TSC_EXIT=$?"
```

Expected: `TSC_EXIT=0`.

- [ ] **Step 3: Commit**

```bash
git add src/components/SizingStrip.tsx
git commit -m "feat(ui): add SizingStrip component

One-line size / risk / SL% strip — the 3 numbers a trader needs
in front of them before tapping Confirm."
```

---

## Task 12: DetailsAccordion component

**Files:**
- Create: `src/components/DetailsAccordion.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/DetailsAccordion.tsx
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fontSize, fontWeight, radius, space } from "../theme";

export interface DetailFactor {
  /** Display name e.g. "Structure". */
  name: string;
  /** 0-100 integer. */
  score: number;
  /** Engine's per-factor `detail` string. */
  detail: string;
}

interface Props {
  justification: string;
  factors: readonly DetailFactor[];
}

/**
 * Expandable card with the verbose engine output — the engine's
 * justification line plus the per-factor `detail` strings.
 *
 * Collapsed by default; tap toggles open. Default-closed so the
 * Verify screen stays glanceable.
 */
export function DetailsAccordion({ justification, factors }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
      >
        <Text style={styles.toggleLabel}>
          {open ? "▾" : "▸"}  Per-factor detail · justification
        </Text>
      </Pressable>
      {open && (
        <View style={styles.body}>
          <Text style={styles.justification}>{justification}</Text>
          {factors.map((f) => (
            <View key={f.name} style={styles.factor}>
              <View style={styles.factorHead}>
                <Text style={styles.factorName}>{f.name}</Text>
                <Text style={styles.factorScore}>{f.score}</Text>
              </View>
              <Text style={styles.factorDetail}>{f.detail}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    alignItems: "center",
  },
  togglePressed: { backgroundColor: colors.surface2 },
  toggleLabel: { fontSize: fontSize.xs, color: colors.muted },
  body: {
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  justification: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 18,
    marginBottom: space.md,
  },
  factor: {
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(143,161,179,0.1)",
  },
  factorHead: { flexDirection: "row", justifyContent: "space-between" },
  factorName: { fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.semibold, textTransform: "capitalize" },
  factorScore: { fontSize: fontSize.sm, color: colors.muted, fontWeight: fontWeight.semibold },
  factorDetail: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
});
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit
echo "TSC_EXIT=$?"
```

Expected: `TSC_EXIT=0`.

- [ ] **Step 3: Commit**

```bash
git add src/components/DetailsAccordion.tsx
git commit -m "feat(ui): add DetailsAccordion component

Default-collapsed expandable card showing the engine justification
plus per-factor detail strings. Keeps the main Verify view glanceable."
```

---

## Task 13: src/input/ocr.ts

**Files:**
- Create: `src/input/ocr.ts`

- [ ] **Step 1: Write the OCR adapter**

```ts
// src/input/ocr.ts
import TextRecognition from "@react-native-ml-kit/text-recognition";

/**
 * Run on-device OCR over a local image URI and return the recognised text.
 *
 * Thin wrapper. The full M4 parser pipeline (regex → NuExtract → schema)
 * lives in src/parser/ — this file only does raw `imageUri → string`.
 *
 * @param imageUri - "file://…" URI as returned by expo-image-picker.
 * @returns the joined text from all recognised blocks (newline-separated),
 *   or "" if nothing was recognised.
 * @throws if the image can't be decoded or ML Kit fails internally.
 */
export async function recognizeTextFromImage(imageUri: string): Promise<string> {
  const result = await TextRecognition.recognize(imageUri);
  // result.blocks[].text is the per-block recognised text.
  return result.blocks.map((b) => b.text).join("\n").trim();
}
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit
echo "TSC_EXIT=$?"
```

Expected: `TSC_EXIT=0`. If ML Kit's TS types aren't found, run `pnpm add -D @types/react-native-ml-kit__text-recognition` (unlikely; the lib ships its own types).

- [ ] **Step 3: Commit**

```bash
git add src/input/ocr.ts
git commit -m "feat(input): add OCR adapter (raw imageUri → string)

Thin ML Kit wrapper. Parser pipeline (regex/NuExtract) stays in M4 —
this file only handles the OCR-to-text leg so the visual layer
can offer screenshot upload alongside paste."
```

---

## Task 14: UploadScreenshotButton component

**Files:**
- Create: `src/components/UploadScreenshotButton.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/UploadScreenshotButton.tsx
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { colors, fontSize, fontWeight, radius, space } from "../theme";
import { recognizeTextFromImage } from "../input/ocr";

interface Props {
  /** Called with the OCR'd text once recognition succeeds. */
  onText: (text: string) => void;
}

/**
 * Secondary CTA: pick a screenshot → OCR it → hand text back to the
 * parent (which dumps it into the paste TextInput for user review).
 *
 * No image is persisted by the app. The picked URI lives only in the
 * temp picker cache and is dropped after OCR completes.
 */
export function UploadScreenshotButton({ onText }: Props) {
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Grant photos access to upload a screenshot.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        quality: 1,
      });
      if (result.canceled || result.assets.length === 0) return;
      const uri = result.assets[0].uri;
      const text = await recognizeTextFromImage(uri);
      if (text.length === 0) {
        Alert.alert("No text found", "Couldn't read any text from that image. Try a sharper screenshot or paste the signal instead.");
        return;
      }
      onText(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert("Upload failed", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.btn,
        pressed && !busy && styles.pressed,
        busy && styles.busy,
      ]}
    >
      <View style={styles.row}>
        <Ionicons name="image-outline" size={18} color={colors.text} />
        <Text style={styles.label}>{busy ? "Reading…" : "Upload screenshot"}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 12,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { backgroundColor: colors.surface2 },
  busy: { opacity: 0.6 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.semibold },
});
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit
echo "TSC_EXIT=$?"
```

Expected: `TSC_EXIT=0`. If `expo-image-picker` types complain about `MediaTypeOptions`, the lib version is recent — use `MediaType.Images` instead (renamed in newer SDKs). `expo install` selects the SDK-correct version, so use whichever symbol the installed types expose.

- [ ] **Step 3: Commit**

```bash
git add src/components/UploadScreenshotButton.tsx
git commit -m "feat(ui): add UploadScreenshotButton

Secondary CTA — pick screenshot, run OCR, deliver raw text to
parent via onText callback. Permission request handled, empty/error
states surfaced with native Alert. No image persisted by the app."
```

---

## Task 15: AppTabs navigation + App.tsx wiring

**Files:**
- Create: `src/navigation/AppTabs.tsx`
- Modify: `App.tsx`

- [ ] **Step 1: Read current App.tsx to know the swap-out shape**

```bash
cat ~/lazytrader-app/App.tsx
```

Note the existing `NavigationContainer` + `Stack.Navigator` setup before replacing.

- [ ] **Step 2: Write the tab navigator**

```tsx
// src/navigation/AppTabs.tsx
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

import { CaptureScreen } from "../screens/CaptureScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { colors } from "../theme";

const Tab = createBottomTabNavigator();

type IoniconName = ComponentProps<typeof Ionicons>["name"];

const ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  Home:     { active: "home",     inactive: "home-outline" },
  Capture:  { active: "scan",     inactive: "scan-outline" },
  Settings: { active: "settings", inactive: "settings-outline" },
};

export function AppTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Capture"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 10, letterSpacing: 0.4 },
        tabBarIcon: ({ color, size, focused }) => {
          const pair = ICONS[route.name];
          if (!pair) return null;
          return <Ionicons name={focused ? pair.active : pair.inactive} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home"     component={HomeScreen} />
      <Tab.Screen name="Capture"  component={CaptureScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
```

- [ ] **Step 3: Rewrite App.tsx**

(This file already exists; replace its content. Keep the `SafeAreaProvider` wrapper if it was there, since `ScreenBackdrop` uses `SafeAreaView`.)

```tsx
// App.tsx
import "react-native-gesture-handler";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppTabs } from "./src/navigation/AppTabs";
import { colors } from "./src/theme";

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer theme={navTheme}>
        <StatusBar style="light" />
        <AppTabs />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit
echo "TSC_EXIT=$?"
```

Expected: `TSC_EXIT=0`. Will fail until Tasks 16/17/18 land (since the Tab screens are imported but the rewrites change their export shape). **Acceptable failure**: only errors should be "Cannot find module './src/screens/HomeScreen'" or "no exported member `HomeScreen`" — record these and resolve as the screen tasks complete.

If there are unrelated TS errors, fix them before committing.

- [ ] **Step 5: Commit**

```bash
git add src/navigation/AppTabs.tsx App.tsx
git commit -m "feat(nav): switch to bottom-tab navigation

3 tabs (Home, Capture, Settings) with Ionicons. Replaces the
native-stack header with per-screen topbars. Capture is the
default landing tab."
```

---

## Task 16: SettingsScreen rewrite

**Files:**
- Modify: `src/screens/SettingsScreen.tsx`

(Smallest screen — ship first to unblock Task 15's typecheck failures.)

- [ ] **Step 1: Replace file content**

```tsx
// src/screens/SettingsScreen.tsx
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { NetBadge } from "../components/NetBadge";
import { ScreenBackdrop } from "../components/ScreenBackdrop";
import { WalletChip } from "../components/WalletChip";
import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

export function SettingsScreen() {
  return (
    <ScreenBackdrop>
      <View style={styles.topbar}>
        <WalletChip state="disconnected" />
        <NetBadge network="devnet" />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.h1}>Settings</Text>

        <Section title="Wallet">
          <Row label="Status" right={<Badge text="Disconnected" />} />
          <Row label="Connect Phantom" right={<Text style={styles.muted}>—</Text>} />
        </Section>

        <Section title="Network">
          <Row label="Cluster" right={<Badge text="Devnet" warn />} />
          <Row label="RPC" right={<Text style={styles.mono}>api.devnet.solana.com</Text>} />
        </Section>

        <Section title="Risk">
          <Row label="Max risk per trade" right={<Text style={styles.mono}>1.0%</Text>} />
          <Row label="Max leverage" right={<Text style={styles.mono}>25×</Text>} />
          <Row label="Account balance" right={<Text style={styles.mono}>$1,000</Text>} />
        </Section>

        <Section title="Engine">
          <Row label="Version" right={<Text style={styles.mono}>smc · 1.0.0</Text>} />
          <Row label="Golden fixtures" right={<Text style={styles.mono}>27 / 27 ✓</Text>} />
        </Section>

        <Text style={styles.foot}>Editable settings land in M8.</Text>
      </ScrollView>
    </ScreenBackdrop>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, right }: { label: string; right: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View>{right}</View>
    </View>
  );
}

function Badge({ text, warn = false }: { text: string; warn?: boolean }) {
  return (
    <View style={[styles.badge, warn ? { backgroundColor: colors.warningBg } : { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }]}>
      <Text style={[styles.badgeText, warn && { color: colors.warning }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xs },
  body: { padding: space.md, paddingBottom: 80, gap: space.md },
  h1: { fontSize: 22, fontWeight: fontWeight.bold, color: colors.text, marginVertical: space.sm },
  section: {
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden",
  },
  sectionTitle: {
    paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: 4,
    fontSize: fontSize.xs - 1, color: colors.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: fontWeight.semibold,
  },
  row: {
    paddingHorizontal: space.md, paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(143,161,179,0.06)",
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  rowLabel: { color: colors.text, fontSize: fontSize.body },
  mono: { fontFamily: fonts.mono, fontSize: fontSize.xs, color: colors.muted },
  muted: { color: colors.muted, fontSize: fontSize.sm },
  badge: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontSize: fontSize.xs - 1, color: colors.muted },
  foot: { color: colors.muted, fontSize: fontSize.xs, textAlign: "center", paddingVertical: space.lg },
});
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit
echo "TSC_EXIT=$?"
```

Expected: `TSC_EXIT=0` for everything related to SettingsScreen. Home + Capture import errors are still expected — those land in Tasks 17 + 18.

- [ ] **Step 3: Commit**

```bash
git add src/screens/SettingsScreen.tsx
git commit -m "feat(screen): rewrite SettingsScreen with branded sections

Themed structural stub — wallet / network / risk / engine sections.
All values are read-only stubs; editable settings land in M8."
```

---

## Task 17: HomeScreen rewrite

**Files:**
- Modify: `src/screens/HomeScreen.tsx`

- [ ] **Step 1: Replace file content**

```tsx
// src/screens/HomeScreen.tsx
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { NetBadge } from "../components/NetBadge";
import { PrimaryCTA } from "../components/PrimaryCTA";
import { ScreenBackdrop } from "../components/ScreenBackdrop";
import { WalletChip } from "../components/WalletChip";
import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

export function HomeScreen() {
  const nav = useNavigation<{ navigate: (n: string) => void }>();
  return (
    <ScreenBackdrop>
      <View style={styles.topbar}>
        <WalletChip state="disconnected" />
        <NetBadge network="devnet" />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.brand}>
          <LinearGradient
            colors={[colors.primary, colors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logo}
          >
            <Text style={styles.logoText}>LT</Text>
          </LinearGradient>
          <Text style={styles.title}>LazyTrader</Text>
          <Text style={styles.lede}>
            Verify Telegram trade signals against SMC structure before risking capital.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Last 24h</Text>
        <View style={styles.statGrid}>
          <Stat label="Signals scanned" value="—" sub="No history yet" />
          <Stat label="A+ / A rated" value="—" sub="History lands in M7" />
        </View>

        <Text style={styles.sectionLabel}>Last verified</Text>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No signals yet. Verify one to get started.</Text>
        </View>

        <View style={styles.cta}>
          <PrimaryCTA label="Verify a new signal" onPress={() => nav.navigate("Capture")} />
        </View>
      </ScrollView>
    </ScreenBackdrop>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xs },
  body: { padding: space.md, paddingBottom: 80, gap: space.md },

  brand: { alignItems: "center", paddingVertical: space.xxl },
  logo: { width: 56, height: 56, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", marginBottom: space.md },
  logoText: { color: "#fff", fontWeight: fontWeight.black, fontSize: 24 },
  title: { color: colors.text, fontSize: 24, fontWeight: fontWeight.bold, marginBottom: 6, letterSpacing: -0.4 },
  lede: { color: colors.muted, fontSize: fontSize.sm, textAlign: "center", lineHeight: 18, maxWidth: 260 },

  sectionLabel: {
    fontSize: fontSize.xs - 1, color: colors.muted, letterSpacing: 1,
    textTransform: "uppercase", fontWeight: fontWeight.semibold, marginTop: space.sm,
  },
  statGrid: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, padding: space.md,
  },
  statLabel: { fontSize: fontSize.xs - 1, color: colors.muted, letterSpacing: 1, textTransform: "uppercase" },
  statValue: { fontFamily: fonts.mono, fontSize: 18, color: colors.text, fontWeight: fontWeight.bold, marginTop: 4 },
  statSub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },

  empty: {
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, padding: space.md, alignItems: "center",
  },
  emptyText: { color: colors.muted, fontSize: fontSize.sm },

  cta: { marginTop: space.lg },
});
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit
echo "TSC_EXIT=$?"
```

Expected: `TSC_EXIT=0` for HomeScreen. Capture import errors still expected.

- [ ] **Step 3: Commit**

```bash
git add src/screens/HomeScreen.tsx
git commit -m "feat(screen): rewrite HomeScreen with brand + recall stub

Solana-gradient logomark, value-prop lede, 24h stats stub
('—' until M7), CTA jumps to Capture tab."
```

---

## Task 18: CaptureScreen rewrite

**Files:**
- Modify: `src/screens/CaptureScreen.tsx`

(Biggest task — composes every component built so far.)

- [ ] **Step 1: Replace file content**

```tsx
// src/screens/CaptureScreen.tsx
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { DetailsAccordion, type DetailFactor } from "../components/DetailsAccordion";
import { FactorChips, type FactorChip, type FactorSeverity } from "../components/FactorChips";
import { MultiTimeframeDashboard, type DashboardRow } from "../components/MultiTimeframeDashboard";
import { NetBadge } from "../components/NetBadge";
import { PrimaryCTA } from "../components/PrimaryCTA";
import { RatingHeroCard } from "../components/RatingHeroCard";
import { ScreenBackdrop } from "../components/ScreenBackdrop";
import { SizingStrip } from "../components/SizingStrip";
import { UploadScreenshotButton } from "../components/UploadScreenshotButton";
import { WalletChip } from "../components/WalletChip";
import { makeBtcDemo } from "../data/demoData";
import { generateSignalVerification } from "../smc";
import type { SignalVerificationReport } from "../smc";
import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

/**
 * Capture screen — paste OR upload screenshot → SMC engine → branded
 * verify view (hybrid C composition: hero + dashboard + chips +
 * sizing strip + expandable details).
 *
 * Engine call path is unchanged from the M2 stub. Demo signal still
 * comes from `makeBtcDemo()` — live data feed lands in M3.
 */
export function CaptureScreen() {
  const demo = useMemo(() => makeBtcDemo(), []);
  const [signalText, setSignalText] = useState(demo.signalText);
  const [report, setReport] = useState<SignalVerificationReport | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const verify = () => {
    setAnalyzing(true);
    setErrorMsg(null);
    setReport(null);
    setTimeout(() => {
      try {
        const result = generateSignalVerification({
          signal: demo.signal,
          candleData: demo.candleData,
          currentPrice: demo.currentPrice,
          accountBalance: 1000,
          riskRules: { maxRiskPct: 1.0, maxLeverage: 25 },
        });
        setReport(result);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setAnalyzing(false);
      }
    }, 0);
  };

  return (
    <ScreenBackdrop>
      <View style={styles.topbar}>
        <WalletChip state="disconnected" />
        <NetBadge network="devnet" />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {report === null && (
          <>
            <Text style={styles.h1}>Capture</Text>
            <Text style={styles.subtitle}>
              Paste a signal or upload a screenshot. The SMC engine will rate it before you trade.
            </Text>

            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Signal text</Text>
              <TextInput
                style={styles.input}
                multiline
                value={signalText}
                onChangeText={setSignalText}
                placeholder="$BTC LONG&#10;Entry: 67,500&#10;SL: 67,050&#10;TP1: 68,200"
                placeholderTextColor={`${colors.muted}80`}
              />
            </View>

            <UploadScreenshotButton onText={setSignalText} />

            {errorMsg !== null && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>Engine error</Text>
                <Text style={styles.errorBody}>{errorMsg}</Text>
              </View>
            )}

            <PrimaryCTA label="Verify with SMC engine" onPress={verify} loading={analyzing} />
          </>
        )}

        {report !== null && <ReportView report={report} onReset={() => setReport(null)} />}
      </ScrollView>
    </ScreenBackdrop>
  );
}

function ReportView({ report, onReset }: { report: SignalVerificationReport; onReset: () => void }) {
  const heroProps = toHeroProps(report);
  const rows = toDashboardRows(report);
  const chips = toFactorChips(report);
  const sizing = toSizingStats(report);
  const detailFactors = toDetailFactors(report);

  return (
    <View style={{ gap: space.md }}>
      <RatingHeroCard {...heroProps} />
      <MultiTimeframeDashboard rows={rows} pair={report.signal.pair} />
      <FactorChips chips={chips} />
      {sizing !== null && <SizingStrip {...sizing} />}
      <DetailsAccordion justification={report.scoring.justification} factors={detailFactors} />
      <PrimaryCTA label="Confirm trade →" onPress={() => { /* wired in M5/M6 */ }} />
      <PrimaryCTA label="Verify another signal" variant="secondary" onPress={onReset} />
    </View>
  );
}

// ─── Engine → component adapters ─────────────────────────────────────────

function toHeroProps(r: SignalVerificationReport) {
  // Session tag: pull session label from the LTF analysis if present.
  // Engine doesn't expose a top-level session; fall back to OB hint.
  const ltfAnalysis = r.timeframeAnalyses["1m"] ?? r.timeframeAnalyses["5m"] ?? null;
  const obHint = ltfAnalysis?.nearestOb?.isInside ? "OB" : null;
  const tag = obHint !== null ? `INSIDE · ${obHint}` : undefined;

  return {
    rating: r.scoring.rating,
    scorePct: r.scoring.score,                 // already 0-100
    verdict: r.scoring.justification,
    side: (r.signal.direction > 0 ? "LONG" : "SHORT") as "LONG" | "SHORT",
    sizeMult: r.scoring.scoreMultiplier,
    sessionTag: tag,
  };
}

function toDashboardRows(r: SignalVerificationReport): DashboardRow[] {
  return Object.entries(r.timeframeAnalyses).map(([tf, a]) => ({
    tf,
    struct: a.structure.bias,
    structStrong: a.structure.bias !== 0 && (a.structure.labels.length >= 2),
    ob: a.nearestOb?.direction ?? 0,
    fvg: a.nearestFvg?.direction ?? 0,
    ema: a.ema.direction,
  }));
}

function toFactorChips(r: SignalVerificationReport): FactorChip[] {
  // Engine factor names → short display labels
  const labels: Record<string, string> = {
    timeframe_alignment: "TF",
    entry_quality: "entry",
    structure: "struct",
    risk_reward_quality: "R:R",
    htf_trend: "HTF",
    swing_position: "swing",
    zone_confluence: "zone",
  };
  return Object.entries(r.scoring.factors).map(([name, f]) => {
    const score = Math.round(f.score * 100);
    const sev: FactorSeverity = score >= 75 ? "good" : score >= 50 ? "ok" : "bad";
    return { label: labels[name] ?? name, score, severity: sev };
  });
}

function toSizingStats(r: SignalVerificationReport) {
  const ps = r.positionSizing;
  if (ps === null) return null;
  return {
    size: ps.positionSize,
    risk: ps.riskAmount,
    riskPct: ps.riskPct,
    slPct: ps.slDistancePct,
  };
}

function toDetailFactors(r: SignalVerificationReport): DetailFactor[] {
  return Object.entries(r.scoring.factors).map(([name, f]) => ({
    name: name.replace(/_/g, " "),
    score: Math.round(f.score * 100),
    detail: f.detail,
  }));
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xs },
  body: { padding: space.md, paddingBottom: 80, gap: space.md },

  h1: { fontSize: 22, fontWeight: fontWeight.bold, color: colors.text, letterSpacing: -0.4 },
  subtitle: { color: colors.muted, fontSize: fontSize.sm, lineHeight: 18 },

  inputCard: {
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, padding: space.md,
  },
  inputLabel: {
    fontSize: fontSize.xs - 1, color: colors.muted, letterSpacing: 1,
    textTransform: "uppercase", fontWeight: fontWeight.semibold, marginBottom: space.sm,
  },
  input: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: space.sm, minHeight: 110, color: colors.text,
    fontFamily: fonts.mono, fontSize: fontSize.sm, lineHeight: 18,
    textAlignVertical: "top",
  },

  errorBox: {
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.danger,
    backgroundColor: colors.dangerBg, padding: space.md,
  },
  errorTitle: { fontWeight: fontWeight.bold, color: colors.danger, marginBottom: 4 },
  errorBody: { color: colors.danger, fontFamily: fonts.mono, fontSize: fontSize.sm },
});
```

- [ ] **Step 2: Confirm import name on demoData**

```bash
grep -E "export (const|function|default) makeBtcDemo" ~/lazytrader-app/src/data/demoData.ts
```

Expected: a line containing `makeBtcDemo`. If the export is default-only, change the import in CaptureScreen accordingly. (Existing M2 CaptureScreen already used named import successfully, so this should match.)

- [ ] **Step 3: Typecheck (final)**

```bash
cd ~/lazytrader-app && pnpm exec tsc --noEmit
echo "TSC_EXIT=$?"
```

Expected: `TSC_EXIT=0`. All previous Task-15 import errors should now resolve.

- [ ] **Step 4: Commit**

```bash
git add src/screens/CaptureScreen.tsx
git commit -m "feat(screen): rewrite CaptureScreen with hybrid Verify view

Composes RatingHeroCard, MultiTimeframeDashboard, FactorChips,
SizingStrip, DetailsAccordion. Adds UploadScreenshotButton for
OCR-from-screenshot input alongside paste. Engine call path
unchanged. Inline adapters map SignalVerificationReport → component
props; extract to captureAdapters.ts only if they grow past 20 lines."
```

---

## Task 19: Phone hot-reload verification + final test gate

**Files:** none.

**Why:** Confirm everything renders correctly and engine fixtures still pass. No commit.

- [ ] **Step 1: Confirm Metro is still running**

```bash
lsof -iTCP:8081 -sTCP:LISTEN
```

If not, restart:

```bash
cd ~/lazytrader-app
REACT_NATIVE_PACKAGER_HOSTNAME=100.88.202.3 pnpm exec expo start --dev-client
```

- [ ] **Step 2: Reload app on phone**

Manual: shake the phone or use the dev client menu → "Reload". App should reload from the latest bundle.

- [ ] **Step 3: Walk every screen**

Manual checklist:
- [ ] App opens on **Capture** tab (default landing)
- [ ] Capture topbar: `DISCONNECTED` chip + amber `DEVNET` badge
- [ ] Capture empty state: "Capture" h1, subtitle, paste field, Upload screenshot button, Verify CTA
- [ ] Tap **Upload screenshot** → photo picker opens (cancel out is fine — just confirm it opens)
- [ ] Tap **Verify with SMC engine** → spinner briefly, then full verify view renders:
  - [ ] RatingHeroCard with grade letter color-coded by rating
  - [ ] MultiTimeframeDashboard with 7 rows × 4 cols, BULL/BEAR/RANGE colored
  - [ ] FactorChips: 7 chips with g/y/r dots
  - [ ] SizingStrip: $size · $risk · 1% · SL%
  - [ ] DetailsAccordion: tap to expand, shows justification + per-factor details
  - [ ] "Confirm trade →" + "Verify another signal" buttons at bottom
- [ ] Tap "Verify another signal" → returns to empty state
- [ ] Tap **Home** tab → branded LazyTrader landing, "—" stats, "No signals yet", CTA "Verify a new signal"
- [ ] Tap CTA on Home → switches to Capture tab
- [ ] Tap **Settings** tab → Wallet / Network / Risk / Engine sections
- [ ] Bottom tab indicator (purple) follows the active tab

If anything looks wrong, file a follow-up commit with the fix and re-run this checklist.

- [ ] **Step 4: Final tsc + tests**

```bash
cd ~/lazytrader-app
pnpm exec tsc --noEmit
echo "TSC_EXIT=$?"
pnpm test
```

Expected:
- `TSC_EXIT=0`
- `Test Files  1 passed (1)`, `Tests  27 passed (27)`

- [ ] **Step 5: Git status sanity**

```bash
cd ~/lazytrader-app && git status && git log --oneline origin/main..HEAD
```

Expected: clean working tree, ~18 new commits (from Tasks 1, 4-18) ahead of origin. **Do not push** — wait for explicit user approval.

---

## Self-review

After completing the plan, executor should verify:

1. **Spec coverage** — every section of `docs/superpowers/specs/2026-05-03-visual-layer-design.md` has at least one task implementing it. ScreenBackdrop ✓ (T4), WalletChip ✓ (T5), NetBadge ✓ (T6), PrimaryCTA ✓ (T7), RatingHeroCard ✓ (T8), MultiTimeframeDashboard ✓ (T9), FactorChips ✓ (T10), SizingStrip ✓ (T11), DetailsAccordion ✓ (T12), `src/input/ocr.ts` ✓ (T13), UploadScreenshotButton ✓ (T14), AppTabs + App.tsx ✓ (T15), SettingsScreen ✓ (T16), HomeScreen ✓ (T17), CaptureScreen ✓ (T18). Theme module covered by previously-completed work (T1+T2 in the parent task list).

2. **No commits pushed** — the plan never includes `git push`. If the user asks to push, that's a separate, explicitly-approved action.

3. **Engine untouched** — every modification is under `src/components/`, `src/navigation/`, `src/input/`, `src/screens/`, `src/theme/`, `App.tsx`, or `package.json`. **No file under `src/smc/` or `src/data/` is modified.**

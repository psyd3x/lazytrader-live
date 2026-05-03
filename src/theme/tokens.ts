/**
 * LazyTrader theme tokens — Solana-brand palette (Option A).
 *
 * Source: docs/palette-preview.html (chosen 2026-05-03) + docs/UI-DESIGN-SYSTEM.md.
 * Single source of truth — components MUST import from `src/theme` rather than
 * inline hex values. Lets us swap palettes by editing this file.
 *
 * RGBA helpers below are baked rather than runtime-computed because RN
 * StyleSheet doesn't run JS for static styles — keep it dumb and string-y.
 */
import { Platform } from "react-native";

export const colors = {
  // Backgrounds (deepest → liftedmost)
  bg: "#081018",
  surface: "#0d1721",
  surface2: "#131e2a",
  border: "rgba(143, 161, 179, 0.18)",

  // Text
  text: "#eaf1f7",
  muted: "#9fb0bf",

  // Brand (Solana)
  primary: "#9945ff",
  primaryFg: "#ffffff",
  primaryBg: "rgba(153, 69, 255, 0.14)",
  primaryBorder: "rgba(153, 69, 255, 0.28)",

  secondary: "#14f195",
  secondaryBg: "rgba(20, 241, 149, 0.12)",

  // Semantic
  success: "#37df91",
  successBg: "rgba(55, 223, 145, 0.12)",
  danger: "#ff6478",
  dangerBg: "rgba(255, 100, 120, 0.12)",
  warning: "#ffb44b",
  warningBg: "rgba(255, 180, 75, 0.12)",
} as const;

export const fonts = {
  // Inter is the spec, but we don't load custom fonts yet (no expo-font dep
  // in the visual-layer scope). Falls back to platform sans, which is close
  // enough for the MVP. Upgrade path: install @expo-google-fonts/inter and
  // call useFonts() in App.tsx, then swap these strings.
  sans: Platform.select({ ios: "System", android: "sans-serif", default: "System" }),
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
} as const;

export const fontSize = {
  xs: 11,
  sm: 12,
  body: 14,
  md: 16,
  lg: 18,
  xl: 22,
  display: 28,
  hero: 64,
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  black: "800",
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  huge: 32,
} as const;

/** Map an SMC rating letter to its semantic color. */
export function ratingColor(rating: string): string {
  switch (rating) {
    case "A+":
    case "A":
      return colors.success;
    case "B":
      return colors.primary;
    case "C":
      return colors.warning;
    default:
      return colors.danger;
  }
}

/** Map an SMC rating to its background tint (low-opacity). */
export function ratingBg(rating: string): string {
  switch (rating) {
    case "A+":
    case "A":
      return colors.successBg;
    case "B":
      return colors.primaryBg;
    case "C":
      return colors.warningBg;
    default:
      return colors.dangerBg;
  }
}

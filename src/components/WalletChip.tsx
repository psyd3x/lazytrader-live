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

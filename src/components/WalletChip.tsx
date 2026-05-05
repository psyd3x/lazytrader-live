import { Pressable, StyleSheet, Text } from "react-native";

import { useConnect } from "../wallet/useConnect";
import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

export function WalletChip() {
  const { address, isConnected, isConnecting, connectAndSignIn } = useConnect();

  const onPress = () => {
    if (!isConnected && !isConnecting) {
      void connectAndSignIn();
    }
    // If already connected, tap is a no-op — full management lives in Settings
  };

  const label = isConnecting
    ? "CONNECTING…"
    : isConnected && address
      ? `${address.slice(0, 4)}…${address.slice(-4)}`
      : "DISCONNECTED";

  return (
    <Pressable onPress={onPress} style={[styles.chip, isConnected && styles.chipConnected]}>
      <Text style={[styles.dot, isConnected && styles.dotConnected]}>●</Text>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipConnected: {
    borderColor: colors.success,
  },
  dot: { color: colors.muted, fontSize: 8 },
  dotConnected: { color: colors.success },
  label: {
    fontFamily: fonts.mono,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.muted,
    letterSpacing: 0.5,
  },
});

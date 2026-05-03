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

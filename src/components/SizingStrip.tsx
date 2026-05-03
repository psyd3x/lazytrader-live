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

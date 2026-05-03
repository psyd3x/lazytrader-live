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

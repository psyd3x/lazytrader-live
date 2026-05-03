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
  let color: string = colors.muted;
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

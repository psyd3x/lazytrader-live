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

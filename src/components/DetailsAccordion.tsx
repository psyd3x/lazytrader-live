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

// src/components/ParsedSignalCard.tsx
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { ParsedSignal } from "../parser/schema";
import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

export interface SizingPreview {
  margin: number;          // $ collateral required at chosen leverage
  leverage: number;        // capped to maxLeverage
  risk: number;            // $ loss if SL hits
  riskPct: number;         // % of accountBalance
  capBinds: boolean;       // true when leverage === maxLeverage AND risk < intended budget
  intendedRiskPct: number; // user's settings value (e.g. 1.0)
  maxLeverage: number;     // user's settings cap (e.g. 25)
}

export interface ParsedSignalCardProps {
  /** Current parsed signal (controlled). */
  value: ParsedSignal;
  /** Called when any editable field changes. Parent owns state. */
  onChange: (next: ParsedSignal) => void;
  /** Live-computed sizing preview from the engine math. Pass null to hide block. */
  sizing: SizingPreview | null;
}

const SOURCE_LABEL: Record<ParsedSignal["source"], string> = {
  regex: "by regex",
  claude: "by Claude",
  "gpt-4o-mini": "by gpt-4o-mini",
};

export function ParsedSignalCard({ value, onChange, sizing }: ParsedSignalCardProps) {
  const updateField = <K extends keyof ParsedSignal>(key: K, v: ParsedSignal[K]) =>
    onChange({ ...value, [key]: v });

  const updateTp = (idx: number, n: number) => {
    const next = [...value.takeProfits];
    next[idx] = n;
    updateField("takeProfits", next);
  };
  const removeTp = (idx: number) => {
    if (value.takeProfits.length <= 1) return;
    updateField("takeProfits", value.takeProfits.filter((_, i) => i !== idx));
  };
  const addTp = () => {
    if (value.takeProfits.length >= 10) return;
    const last = value.takeProfits[value.takeProfits.length - 1];
    updateField("takeProfits", [...value.takeProfits, last]);
  };

  return (
    <View style={styles.card}>
      <View style={styles.chipRow}>
        <View style={styles.chipNeutral}>
          <Text style={styles.chipText}>{SOURCE_LABEL[value.source]}</Text>
        </View>
        {value.multipleTrades && (
          <View style={styles.chipWarn}>
            <Text style={styles.chipText}>multi-trade · first parsed</Text>
          </View>
        )}
      </View>

      <Field label="Pair">
        <Text style={styles.readOnlyValue}>{value.pair}</Text>
      </Field>

      <Field label="Direction">
        <View style={styles.segmented}>
          <Pressable
            style={[styles.segment, value.direction === "long" && styles.segmentActive]}
            onPress={() => updateField("direction", "long")}
          >
            <Text style={[styles.segmentText, value.direction === "long" && styles.segmentTextActive]}>LONG</Text>
          </Pressable>
          <Pressable
            style={[styles.segment, value.direction === "short" && styles.segmentActive]}
            onPress={() => updateField("direction", "short")}
          >
            <Text style={[styles.segmentText, value.direction === "short" && styles.segmentTextActive]}>SHORT</Text>
          </Pressable>
        </View>
      </Field>

      <Field label="Entry">
        <TextInput
          style={styles.numInput}
          keyboardType="numeric"
          value={String(value.entry)}
          onChangeText={(t) => {
            const n = parseFloat(t);
            if (Number.isFinite(n)) updateField("entry", n);
          }}
        />
        {value.entryRange && (
          <Text style={styles.rangeHint}>range: {value.entryRange[0]} – {value.entryRange[1]}</Text>
        )}
      </Field>

      <Field label="Stop loss">
        <TextInput
          style={styles.numInput}
          keyboardType="numeric"
          value={String(value.stopLoss)}
          onChangeText={(t) => {
            const n = parseFloat(t);
            if (Number.isFinite(n)) updateField("stopLoss", n);
          }}
        />
      </Field>

      <Field label="Take profits">
        {value.takeProfits.map((tp, i) => (
          <View key={i} style={styles.tpRow}>
            <Text style={styles.tpLabel}>TP{i + 1}</Text>
            <TextInput
              style={[styles.numInput, styles.tpInput]}
              keyboardType="numeric"
              value={String(tp)}
              onChangeText={(t) => {
                const n = parseFloat(t);
                if (Number.isFinite(n)) updateTp(i, n);
              }}
            />
            {value.takeProfits.length > 1 && (
              <Pressable onPress={() => removeTp(i)} style={styles.removeBtn} hitSlop={6}>
                <Text style={styles.removeBtnText}>−</Text>
              </Pressable>
            )}
          </View>
        ))}
        {value.takeProfits.length < 10 && (
          <Pressable onPress={addTp} style={styles.addBtn} hitSlop={6}>
            <Text style={styles.addBtnText}>+ Add TP</Text>
          </Pressable>
        )}
      </Field>

      {value.leverage !== null && (
        <Text style={styles.signalLeverage}>Signal said: {value.leverage}×</Text>
      )}

      {sizing !== null && (
        <View style={styles.sizingBlock}>
          <Text style={styles.sizingLabel}>Sizing preview (read-only)</Text>
          <SizingRow label="Margin" value={`$${sizing.margin.toFixed(2)}`} />
          <SizingRow
            label="Leverage"
            value={
              sizing.leverage === sizing.maxLeverage
                ? `${sizing.leverage}× (at your cap)`
                : `${sizing.leverage}×`
            }
          />
          <SizingRow
            label="Risk"
            value={`$${sizing.risk.toFixed(2)} (${sizing.riskPct.toFixed(2)}% of account)`}
            warn={sizing.capBinds}
          />
          {sizing.capBinds && (
            <Text style={styles.warningText}>
              SL too tight for {sizing.intendedRiskPct}% risk budget at {sizing.maxLeverage}× cap — actual risk: {sizing.riskPct.toFixed(2)}%
            </Text>
          )}
        </View>
      )}

      {value.notes !== null && value.notes.length > 0 && (
        <Text style={styles.notes}>Notes: {value.notes}</Text>
      )}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldBody}>{children}</View>
    </View>
  );
}

function SizingRow({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.sizingRow}>
      <Text style={styles.sizingRowLabel}>{label}</Text>
      <Text style={[styles.sizingRowValue, warn && styles.sizingRowValueWarn]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: space.md,
    gap: space.md,
  },
  chipRow: { flexDirection: "row", gap: space.sm },
  chipNeutral: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipWarn: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  chipText: {
    fontSize: fontSize.xs - 1,
    color: colors.text,
    fontWeight: fontWeight.semibold,
  },
  field: { gap: space.sm },
  fieldLabel: {
    fontSize: fontSize.xs - 1,
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: fontWeight.semibold,
  },
  fieldBody: { gap: space.xs },
  readOnlyValue: { color: colors.text, fontFamily: fonts.mono, fontSize: fontSize.body },
  segmented: { flexDirection: "row", gap: space.xs },
  segment: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: "center",
  },
  segmentActive: { backgroundColor: colors.surface2, borderColor: colors.text },
  segmentText: { color: colors.muted, fontWeight: fontWeight.semibold },
  segmentTextActive: { color: colors.text },
  numInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: space.sm,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: fontSize.sm,
  },
  rangeHint: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fonts.mono },
  tpRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  tpLabel: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fonts.mono, width: 32 },
  tpInput: { flex: 1 },
  removeBtn: {
    width: 28, height: 28, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  removeBtnText: { color: colors.muted, fontSize: 18, fontWeight: fontWeight.semibold },
  addBtn: { paddingVertical: space.sm },
  addBtnText: { color: colors.muted, fontWeight: fontWeight.semibold },
  signalLeverage: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fonts.mono },
  sizingBlock: {
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(143,161,179,0.06)",
    gap: 4,
  },
  sizingLabel: {
    fontSize: fontSize.xs - 1,
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: fontWeight.semibold,
    marginBottom: space.xs,
  },
  sizingRow: { flexDirection: "row", justifyContent: "space-between" },
  sizingRowLabel: { color: colors.muted, fontSize: fontSize.sm },
  sizingRowValue: { color: colors.text, fontFamily: fonts.mono, fontSize: fontSize.sm },
  sizingRowValueWarn: { color: colors.warning },
  warningText: { color: colors.warning, fontSize: fontSize.xs, fontFamily: fonts.mono, marginTop: space.xs },
  notes: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fonts.mono, fontStyle: "italic" },
});

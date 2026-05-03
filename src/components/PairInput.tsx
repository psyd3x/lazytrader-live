import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { resolveToPythFeed, type ResolvedPair } from "../data/pairs";
import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

export interface PairInputProps {
  /** Raw text the user has typed. Parent owns this state. */
  value: string;
  onChangeText: (next: string) => void;
  /** Called when validation completes (on blur). null = invalid. */
  onResolve: (pair: ResolvedPair | null) => void;
}

export function PairInput({ value, onChangeText, onResolve }: PairInputProps) {
  const [resolved, setResolved] = useState<ResolvedPair | null>(null);
  const [touched, setTouched] = useState(false);

  const handleBlur = () => {
    setTouched(true);
    const r = resolveToPythFeed(value);
    setResolved(r);
    onResolve(r);
  };

  const chip = (() => {
    if (!touched || !value.trim()) return null;
    if (resolved && resolved.pyth) {
      return { text: `${resolved.base}/${resolved.quote} ✓`, ok: true };
    }
    return { text: "Unsupported pair", ok: false };
  })();

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Pair</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(t) => {
            onChangeText(t);
            if (touched) {
              // Live re-validate while editing after first blur
              const r = resolveToPythFeed(t);
              setResolved(r);
              onResolve(r);
            }
          }}
          onBlur={handleBlur}
          placeholder="$BTC, BTCUSDT, SOL/USD…"
          placeholderTextColor={`${colors.muted}80`}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {chip !== null && (
          <View style={[styles.chip, chip.ok ? styles.chipOk : styles.chipBad]}>
            <Text style={[styles.chipText, chip.ok ? styles.chipTextOk : styles.chipTextBad]}>
              {chip.text}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  label: {
    fontSize: fontSize.xs - 1,
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: fontWeight.semibold,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingRight: space.sm,
  },
  input: {
    flex: 1,
    padding: space.sm,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: fontSize.sm,
  },
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipOk: {
    backgroundColor: colors.successBg,
    borderColor: colors.success,
  },
  chipBad: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.danger,
  },
  chipText: {
    fontSize: fontSize.xs - 1,
    fontWeight: fontWeight.semibold,
  },
  chipTextOk: { color: colors.success },
  chipTextBad: { color: colors.danger },
});

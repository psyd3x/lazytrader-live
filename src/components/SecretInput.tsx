// src/components/SecretInput.tsx
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

export interface SecretInputProps {
  /** Current value (controlled). Empty string means no secret stored. */
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  /** Optional sub-label below input (e.g. status text). */
  helperText?: string;
  /** Called when user taps "Save". */
  onSave?: () => void;
  /** Called when user taps "Clear". Should clear value via onChangeText("") too. */
  onClear?: () => void;
  /** Whether Save button should show a busy state. */
  saving?: boolean;
  /** Disables Save button (e.g. when value unchanged from saved). */
  saveDisabled?: boolean;
}

export function SecretInput(props: SecretInputProps) {
  const {
    value, onChangeText, placeholder, helperText,
    onSave, onClear, saving = false, saveDisabled = false,
  } = props;
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? "Paste API key"}
          placeholderTextColor={`${colors.muted}80`}
          secureTextEntry={!revealed}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          onPress={() => setRevealed((r) => !r)}
          style={styles.revealBtn}
          hitSlop={8}
        >
          <Text style={styles.revealText}>{revealed ? "Hide" : "Reveal"}</Text>
        </Pressable>
      </View>
      {helperText !== undefined && <Text style={styles.helper}>{helperText}</Text>}
      <View style={styles.actions}>
        {onSave !== undefined && (
          <Pressable
            onPress={onSave}
            disabled={saveDisabled || saving}
            style={[styles.btn, (saveDisabled || saving) && styles.btnDisabled]}
          >
            <Text style={styles.btnText}>{saving ? "Saving…" : "Save"}</Text>
          </Pressable>
        )}
        {onClear !== undefined && value.length > 0 && (
          <Pressable onPress={onClear} style={[styles.btn, styles.btnSecondary]}>
            <Text style={[styles.btnText, styles.btnTextSecondary]}>Clear</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingRight: space.sm,
  },
  input: {
    flex: 1, padding: space.sm, color: colors.text,
    fontFamily: fonts.mono, fontSize: fontSize.sm,
  },
  revealBtn: { paddingHorizontal: space.sm, paddingVertical: 4 },
  revealText: {
    color: colors.muted, fontSize: fontSize.xs - 1,
    textTransform: "uppercase", letterSpacing: 1, fontWeight: fontWeight.semibold,
  },
  helper: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fonts.mono },
  actions: { flexDirection: "row", gap: space.sm },
  btn: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  btnDisabled: { opacity: 0.4 },
  btnSecondary: { backgroundColor: "transparent" },
  btnText: { color: colors.text, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  btnTextSecondary: { color: colors.muted },
});

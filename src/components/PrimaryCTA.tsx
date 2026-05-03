import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { colors, fontSize, fontWeight, radius, space } from "../theme";

interface Props {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary";
  loading?: boolean;
  disabled?: boolean;
}

/**
 * App-wide CTA button. Two variants:
 *  - primary   filled Solana-purple, glows softly. Use for the main action.
 *  - secondary outlined surface, calmer. Use for secondary actions like
 *              "Upload screenshot" alongside a primary "Verify".
 */
export function PrimaryCTA({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
}: Props) {
  const isPrimary = variant === "primary";
  const inert = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inert}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        pressed && !inert && (isPrimary ? styles.primaryPressed : styles.secondaryPressed),
        inert && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? "#fff" : colors.text} />
      ) : (
        <Text style={[styles.label, isPrimary ? styles.labelPrimary : styles.labelSecondary]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 13,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  primaryPressed: { opacity: 0.85 },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryPressed: { backgroundColor: colors.surface2 },
  disabled: { opacity: 0.55 },
  label: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.2,
  },
  labelPrimary: { color: "#fff" },
  labelSecondary: { color: colors.text },
});

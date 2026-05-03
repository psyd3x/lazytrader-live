import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ReactNode } from "react";

import { colors } from "../theme";

/**
 * Branded full-bleed backdrop used by every top-level screen.
 *
 * Renders the deep-navy base plus two corner washes (purple top-left,
 * green hint top-right) to give the app its Solana atmosphere without
 * needing radial gradients (which RN can't do natively).
 *
 * Children are rendered inside a SafeAreaView so the topbar / nav bar
 * cutouts don't overlap content.
 */
export function ScreenBackdrop({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      {/* Base */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />
      {/* Purple top-left wash */}
      <LinearGradient
        colors={["rgba(153, 69, 255, 0.18)", "rgba(153, 69, 255, 0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 0.5 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Green top-right hint */}
      <LinearGradient
        colors={["rgba(20, 241, 149, 0.10)", "rgba(20, 241, 149, 0)"]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.4, y: 0.4 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
});

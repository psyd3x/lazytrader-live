// src/screens/SettingsScreen.tsx
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { NetBadge } from "../components/NetBadge";
import { ScreenBackdrop } from "../components/ScreenBackdrop";
import { WalletChip } from "../components/WalletChip";
import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

export function SettingsScreen() {
  return (
    <ScreenBackdrop>
      <View style={styles.topbar}>
        <WalletChip state="disconnected" />
        <NetBadge network="devnet" />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.h1}>Settings</Text>

        <Section title="Wallet">
          <Row label="Status" right={<Badge text="Disconnected" />} />
          <Row label="Connect Phantom" right={<Text style={styles.muted}>—</Text>} />
        </Section>

        <Section title="Network">
          <Row label="Cluster" right={<Badge text="Devnet" warn />} />
          <Row label="RPC" right={<Text style={styles.mono}>api.devnet.solana.com</Text>} />
        </Section>

        <Section title="Risk">
          <Row label="Max risk per trade" right={<Text style={styles.mono}>1.0%</Text>} />
          <Row label="Max leverage" right={<Text style={styles.mono}>25×</Text>} />
          <Row label="Account balance" right={<Text style={styles.mono}>$1,000</Text>} />
        </Section>

        <Section title="Engine">
          <Row label="Version" right={<Text style={styles.mono}>smc · 1.0.0</Text>} />
          <Row label="Golden fixtures" right={<Text style={styles.mono}>27 / 27 ✓</Text>} />
        </Section>

        <Text style={styles.foot}>Editable settings land in M8.</Text>
      </ScrollView>
    </ScreenBackdrop>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, right }: { label: string; right: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View>{right}</View>
    </View>
  );
}

function Badge({ text, warn = false }: { text: string; warn?: boolean }) {
  return (
    <View style={[styles.badge, warn ? { backgroundColor: colors.warningBg } : { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }]}>
      <Text style={[styles.badgeText, warn && { color: colors.warning }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xs },
  body: { padding: space.md, paddingBottom: 80, gap: space.md },
  h1: { fontSize: 22, fontWeight: fontWeight.bold, color: colors.text, marginVertical: space.sm },
  section: {
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden",
  },
  sectionTitle: {
    paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: 4,
    fontSize: fontSize.xs - 1, color: colors.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: fontWeight.semibold,
  },
  row: {
    paddingHorizontal: space.md, paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(143,161,179,0.06)",
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  rowLabel: { color: colors.text, fontSize: fontSize.body },
  mono: { fontFamily: fonts.mono, fontSize: fontSize.xs, color: colors.muted },
  muted: { color: colors.muted, fontSize: fontSize.sm },
  badge: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontSize: fontSize.xs - 1, color: colors.muted },
  foot: { color: colors.muted, fontSize: fontSize.xs, textAlign: "center", paddingVertical: space.lg },
});

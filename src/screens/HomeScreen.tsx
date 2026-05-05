// src/screens/HomeScreen.tsx
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { NetBadge } from "../components/NetBadge";
import { PrimaryCTA } from "../components/PrimaryCTA";
import { ScreenBackdrop } from "../components/ScreenBackdrop";
import { WalletChip } from "../components/WalletChip";
import { useConnect } from "../wallet/useConnect";
import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

export function HomeScreen() {
  const nav = useNavigation<{ navigate: (n: string) => void }>();
  const { isConnected, isConnecting, connectAndSignIn } = useConnect();
  return (
    <ScreenBackdrop>
      <View style={styles.topbar}>
        <WalletChip />
        <NetBadge network="devnet" />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {!isConnected && (
          <View style={styles.connectCTA}>
            <Text style={styles.connectCTATitle}>Connect a wallet to start trading</Text>
            <Text style={styles.connectCTASubtitle}>
              Sign once with Phantom or Solflare — your keys never leave the wallet.
            </Text>
            <Pressable
              onPress={() => void connectAndSignIn()}
              disabled={isConnecting}
              style={styles.connectCTAButton}
            >
              <Text style={styles.connectCTAButtonText}>
                {isConnecting ? "Connecting…" : "Connect Wallet"}
              </Text>
            </Pressable>
          </View>
        )}
        <View style={styles.brand}>
          <LinearGradient
            colors={[colors.primary, colors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logo}
          >
            <Text style={styles.logoText}>LT</Text>
          </LinearGradient>
          <Text style={styles.title}>LazyTrader</Text>
          <Text style={styles.lede}>
            Verify Telegram trade signals against SMC structure before risking capital.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Last 24h</Text>
        <View style={styles.statGrid}>
          <Stat label="Signals scanned" value="—" sub="No history yet" />
          <Stat label="A+ / A rated" value="—" sub="History lands in M7" />
        </View>

        <Text style={styles.sectionLabel}>Last verified</Text>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No signals yet. Verify one to get started.</Text>
        </View>

        <View style={styles.cta}>
          <PrimaryCTA label="Verify a new signal" onPress={() => nav.navigate("Capture")} />
        </View>
      </ScrollView>
    </ScreenBackdrop>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xs },
  body: { padding: space.md, paddingBottom: 80, gap: space.md },

  brand: { alignItems: "center", paddingVertical: space.xxl },
  logo: { width: 56, height: 56, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", marginBottom: space.md },
  logoText: { color: "#fff", fontWeight: fontWeight.black, fontSize: 24 },
  title: { color: colors.text, fontSize: 24, fontWeight: fontWeight.bold, marginBottom: 6, letterSpacing: -0.4 },
  lede: { color: colors.muted, fontSize: fontSize.sm, textAlign: "center", lineHeight: 18, maxWidth: 260 },

  sectionLabel: {
    fontSize: fontSize.xs - 1, color: colors.muted, letterSpacing: 1,
    textTransform: "uppercase", fontWeight: fontWeight.semibold, marginTop: space.sm,
  },
  statGrid: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, padding: space.md,
  },
  statLabel: { fontSize: fontSize.xs - 1, color: colors.muted, letterSpacing: 1, textTransform: "uppercase" },
  statValue: { fontFamily: fonts.mono, fontSize: 18, color: colors.text, fontWeight: fontWeight.bold, marginTop: 4 },
  statSub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },

  empty: {
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, padding: space.md, alignItems: "center",
  },
  emptyText: { color: colors.muted, fontSize: fontSize.sm },

  cta: { marginTop: space.lg },

  // Wallet Connect CTA hero block (shown when disconnected)
  connectCTA: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primaryBg,
    padding: space.lg,
    alignItems: "center",
    gap: space.sm,
  },
  connectCTATitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    textAlign: "center",
  },
  connectCTASubtitle: {
    color: colors.muted,
    fontSize: fontSize.sm,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 280,
  },
  connectCTAButton: {
    marginTop: space.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.xl,
    alignItems: "center",
  },
  connectCTAButtonText: {
    color: colors.primaryFg,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
});

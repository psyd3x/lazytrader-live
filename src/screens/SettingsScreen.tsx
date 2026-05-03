// src/screens/SettingsScreen.tsx
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { NetBadge } from "../components/NetBadge";
import { ScreenBackdrop } from "../components/ScreenBackdrop";
import { SecretInput } from "../components/SecretInput";
import { WalletChip } from "../components/WalletChip";
import { fetchBirdeyeCandles, BirdeyeAuthError } from "../data/birdeye";
import {
  clearBirdeyeApiKey, getBirdeyeApiKey, setBirdeyeApiKey,
} from "../storage/secureSettings";
import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

const SOL_TEST_PAIR = {
  base: "SOL", quote: "USD",
  pyth: { pythSymbol: "Crypto.SOL/USD", pythFeedId: "" },
  birdeyeTokenAddress: "So11111111111111111111111111111111111111112",
};

export function SettingsScreen() {
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const k = await getBirdeyeApiKey();
      setSavedKey(k);
      setDraftKey(k ?? "");
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setStatus("Testing key…");
    try {
      // Validate by hitting Birdeye OHLCV for SOL (smallest meaningful request).
      const now = Math.floor(Date.now() / 1000);
      await fetchBirdeyeCandles({
        pair: SOL_TEST_PAIR,
        tf: "1H",
        fromUnix: now - 3600,
        toUnix: now,
        apiKey: draftKey.trim(),
      });
      await setBirdeyeApiKey(draftKey);
      setSavedKey(draftKey.trim());
      setStatus("Saved · key valid");
    } catch (e) {
      if (e instanceof BirdeyeAuthError) {
        setStatus("Key invalid — not saved");
      } else {
        // Network/rate-limit — save anyway with a warning. Spec §9.
        await setBirdeyeApiKey(draftKey);
        setSavedKey(draftKey.trim());
        setStatus(`Saved · couldn't verify (${(e as Error).message.slice(0, 60)})`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    try {
      await clearBirdeyeApiKey();
      setSavedKey(null);
      setDraftKey("");
      setStatus("Cleared");
    } catch (e) {
      setStatus(`Couldn't clear: ${(e as Error).message.slice(0, 60)}`);
    }
  };

  const fallbackEnabled = savedKey !== null && savedKey.length > 0;

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

        <Section title="Data Sources">
          <Row label="Primary" right={<Badge text="Pyth Benchmarks ●" />} />
          <Row
            label="Birdeye fallback"
            right={<Badge text={fallbackEnabled ? "● Enabled" : "○ Disabled"} />}
          />
          <View style={styles.cardBody}>
            <SecretInput
              value={draftKey}
              onChangeText={setDraftKey}
              placeholder="Birdeye API key"
              helperText={status ?? (fallbackEnabled ? "Key saved" : "Get a key at birdeye.so/developers")}
              onSave={handleSave}
              onClear={handleClear}
              saving={saving}
              saveDisabled={draftKey.trim() === (savedKey ?? "")}
            />
          </View>
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

        <Text style={styles.foot}>Editable risk settings land in M8.</Text>
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
  cardBody: {
    paddingHorizontal: space.md, paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(143,161,179,0.06)",
  },
  rowLabel: { color: colors.text, fontSize: fontSize.body },
  mono: { fontFamily: fonts.mono, fontSize: fontSize.xs, color: colors.muted },
  muted: { color: colors.muted, fontSize: fontSize.sm },
  badge: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontSize: fontSize.xs - 1, color: colors.muted },
  foot: { color: colors.muted, fontSize: fontSize.xs, textAlign: "center", paddingVertical: space.lg },
});

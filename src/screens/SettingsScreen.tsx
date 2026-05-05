// src/screens/SettingsScreen.tsx
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { NetBadge } from "../components/NetBadge";
import { ScreenBackdrop } from "../components/ScreenBackdrop";
import { SecretInput } from "../components/SecretInput";
import { WalletChip } from "../components/WalletChip";
import { fetchBirdeyeCandles, BirdeyeAuthError } from "../data/birdeye";
import { useConnect } from "../wallet/useConnect";
import { useUsdcBalance } from "../wallet/useUsdcBalance";
import { fetchClaudeParse } from "../parser/claudeAdapter";
import { fetchOpenAiParse } from "../parser/openaiAdapter";
import { LlmAuthError } from "../parser/llm";
import {
  clearBirdeyeApiKey, getBirdeyeApiKey, setBirdeyeApiKey,
  clearClaudeApiKey, getClaudeApiKey, setClaudeApiKey,
  clearOpenAiApiKey, getOpenAiApiKey, setOpenAiApiKey,
  getLlmProvider, setLlmProvider, type LlmProvider,
} from "../storage/secureSettings";
import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

const SOL_TEST_PAIR = {
  base: "SOL", quote: "USD",
  pyth: { pythSymbol: "Crypto.SOL/USD", pythFeedId: "" },
  birdeyeTokenAddress: "So11111111111111111111111111111111111111112",
};

export function SettingsScreen() {
  // Birdeye state (M3, unchanged)
  const [savedBirdeyeKey, setSavedBirdeyeKey] = useState<string | null>(null);
  const [draftBirdeyeKey, setDraftBirdeyeKey] = useState("");
  const [savingBirdeye, setSavingBirdeye] = useState(false);
  const [birdeyeStatus, setBirdeyeStatus] = useState<string | null>(null);

  // LLM state (M4)
  const [provider, setProvider] = useState<LlmProvider>("claude");
  const [savedClaudeKey, setSavedClaudeKey] = useState<string | null>(null);
  const [savedOpenAiKey, setSavedOpenAiKey] = useState<string | null>(null);
  const [draftLlmKey, setDraftLlmKey] = useState("");
  const [savingLlm, setSavingLlm] = useState(false);
  const [llmStatus, setLlmStatus] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const bk = await getBirdeyeApiKey();
      setSavedBirdeyeKey(bk);
      setDraftBirdeyeKey(bk ?? "");

      const p = (await getLlmProvider()) ?? "claude";
      setProvider(p);
      const ck = await getClaudeApiKey();
      const ok = await getOpenAiApiKey();
      setSavedClaudeKey(ck);
      setSavedOpenAiKey(ok);
      setDraftLlmKey((p === "claude" ? ck : ok) ?? "");
    })();
  }, []);

  // ─── Birdeye handlers (unchanged from M3) ────────────────
  const handleBirdeyeSave = async () => {
    setSavingBirdeye(true);
    setBirdeyeStatus("Testing key…");
    try {
      const now = Math.floor(Date.now() / 1000);
      await fetchBirdeyeCandles({
        pair: SOL_TEST_PAIR,
        tf: "1H",
        fromUnix: now - 3600,
        toUnix: now,
        apiKey: draftBirdeyeKey.trim(),
      });
      await setBirdeyeApiKey(draftBirdeyeKey);
      setSavedBirdeyeKey(draftBirdeyeKey.trim());
      setBirdeyeStatus("Saved · key valid");
    } catch (e) {
      if (e instanceof BirdeyeAuthError) {
        setBirdeyeStatus("Key invalid — not saved");
      } else {
        await setBirdeyeApiKey(draftBirdeyeKey);
        setSavedBirdeyeKey(draftBirdeyeKey.trim());
        setBirdeyeStatus(`Saved · couldn't verify (${(e as Error).message.slice(0, 60)})`);
      }
    } finally {
      setSavingBirdeye(false);
    }
  };
  const handleBirdeyeClear = async () => {
    try {
      await clearBirdeyeApiKey();
      setSavedBirdeyeKey(null);
      setDraftBirdeyeKey("");
      setBirdeyeStatus("Cleared");
    } catch (e) {
      setBirdeyeStatus(`Couldn't clear: ${(e as Error).message.slice(0, 60)}`);
    }
  };

  // ─── LLM handlers (M4) ───────────────────────────────────
  const handleProviderSwitch = async (next: LlmProvider) => {
    setProvider(next);
    await setLlmProvider(next);
    setDraftLlmKey((next === "claude" ? savedClaudeKey : savedOpenAiKey) ?? "");
    setLlmStatus(null);
  };

  const handleLlmSave = async () => {
    setSavingLlm(true);
    setLlmStatus("Testing key…");
    try {
      // Probe with a tiny request — both providers schema-validate the response,
      // so a 200 + parseable result confirms the key works for our use case.
      if (provider === "claude") {
        await fetchClaudeParse("LONG BTCUSDT entry 70000 SL 69000 TP 71000", draftLlmKey.trim());
        await setClaudeApiKey(draftLlmKey);
        setSavedClaudeKey(draftLlmKey.trim());
      } else {
        await fetchOpenAiParse("LONG BTCUSDT entry 70000 SL 69000 TP 71000", draftLlmKey.trim());
        await setOpenAiApiKey(draftLlmKey);
        setSavedOpenAiKey(draftLlmKey.trim());
      }
      setLlmStatus("Saved · key valid");
    } catch (e) {
      if (e instanceof LlmAuthError) {
        setLlmStatus("Key invalid — not saved");
      } else {
        // Network/rate-limit/schema — save anyway with a warning, mirrors Birdeye behavior
        if (provider === "claude") {
          await setClaudeApiKey(draftLlmKey);
          setSavedClaudeKey(draftLlmKey.trim());
        } else {
          await setOpenAiApiKey(draftLlmKey);
          setSavedOpenAiKey(draftLlmKey.trim());
        }
        setLlmStatus(`Saved · couldn't verify (${(e as Error).message.slice(0, 60)})`);
      }
    } finally {
      setSavingLlm(false);
    }
  };

  const handleLlmClear = async () => {
    try {
      if (provider === "claude") {
        await clearClaudeApiKey();
        setSavedClaudeKey(null);
      } else {
        await clearOpenAiApiKey();
        setSavedOpenAiKey(null);
      }
      setDraftLlmKey("");
      setLlmStatus("Cleared");
    } catch (e) {
      setLlmStatus(`Couldn't clear: ${(e as Error).message.slice(0, 60)}`);
    }
  };

  const birdeyeFallbackEnabled = savedBirdeyeKey !== null && savedBirdeyeKey.length > 0;
  const activeKey = provider === "claude" ? savedClaudeKey : savedOpenAiKey;
  const llmConfigured = activeKey !== null && activeKey.length > 0;
  const providerHelperUrl = provider === "claude" ? "console.anthropic.com" : "platform.openai.com";

  return (
    <ScreenBackdrop>
      <View style={styles.topbar}>
        <WalletChip />
        <NetBadge network="devnet" />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.h1}>Settings</Text>

        <WalletCard />

        <Section title="Network">
          <Row label="Cluster" right={<Badge text="Devnet" warn />} />
          <Row label="RPC" right={<Text style={styles.mono}>api.devnet.solana.com</Text>} />
        </Section>

        <Section title="Data Sources">
          <Row label="Primary" right={<Badge text="Pyth Benchmarks ●" />} />
          <Row label="Birdeye fallback" right={<Badge text={birdeyeFallbackEnabled ? "● Enabled" : "○ Disabled"} />} />
          <View style={styles.cardBody}>
            <SecretInput
              value={draftBirdeyeKey}
              onChangeText={setDraftBirdeyeKey}
              placeholder="Birdeye API key"
              helperText={birdeyeStatus ?? (birdeyeFallbackEnabled ? "Key saved" : "Get a key at birdeye.so/developers")}
              onSave={handleBirdeyeSave}
              onClear={handleBirdeyeClear}
              saving={savingBirdeye}
              saveDisabled={draftBirdeyeKey.trim() === (savedBirdeyeKey ?? "")}
            />
          </View>
        </Section>

        <Section title="AI Fallback">
          <Row
            label="Provider"
            right={
              <View style={styles.segmentRow}>
                <Pressable
                  style={[styles.segmentSm, provider === "claude" && styles.segmentSmActive]}
                  onPress={() => void handleProviderSwitch("claude")}
                >
                  <Text style={[styles.segmentSmText, provider === "claude" && styles.segmentSmTextActive]}>Claude</Text>
                </Pressable>
                <Pressable
                  style={[styles.segmentSm, provider === "gpt-4o-mini" && styles.segmentSmActive]}
                  onPress={() => void handleProviderSwitch("gpt-4o-mini")}
                >
                  <Text style={[styles.segmentSmText, provider === "gpt-4o-mini" && styles.segmentSmTextActive]}>OpenAI</Text>
                </Pressable>
              </View>
            }
          />
          <Row label="Status" right={<Badge text={llmConfigured ? "● Configured" : "○ Not configured"} />} />
          <View style={styles.cardBody}>
            <SecretInput
              value={draftLlmKey}
              onChangeText={setDraftLlmKey}
              placeholder={provider === "claude" ? "sk-ant-..." : "sk-..."}
              helperText={llmStatus ?? (llmConfigured ? "Key saved" : `Get a key at ${providerHelperUrl}`)}
              onSave={handleLlmSave}
              onClear={handleLlmClear}
              saving={savingLlm}
              saveDisabled={draftLlmKey.trim() === (activeKey ?? "")}
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

function WalletCard() {
  const { address, isConnected, isConnecting, connectAndSignIn, disconnect } = useConnect();
  const { balance, isLoading, refresh } = useUsdcBalance(address);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Wallet</Text>
      {isConnected && address ? (
        <>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Address</Text>
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.mono} numberOfLines={1}>{address}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>USDC balance</Text>
            <Text style={styles.mono}>
              {isLoading ? "…" : balance === null ? "—" : `$${balance.toFixed(2)}`}
            </Text>
          </View>
          <View style={styles.cardBody}>
            <Pressable onPress={() => void refresh()} style={styles.linkBtn}>
              <Text style={styles.linkBtnText}>Refresh balance</Text>
            </Pressable>
            <View style={{ height: space.sm }} />
            <Pressable onPress={() => void disconnect()} style={styles.dangerBtn}>
              <Text style={styles.dangerBtnText}>Disconnect wallet</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <View style={styles.cardBody}>
          <Pressable
            onPress={() => void connectAndSignIn()}
            disabled={isConnecting}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>
              {isConnecting ? "Connecting…" : "Connect Wallet"}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
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
  section: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" },
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
  segmentRow: { flexDirection: "row", gap: 4 },
  segmentSm: {
    paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg,
  },
  segmentSmActive: { backgroundColor: colors.surface2, borderColor: colors.text },
  segmentSmText: { color: colors.muted, fontSize: fontSize.xs - 1, fontWeight: fontWeight.semibold },
  segmentSmTextActive: { color: colors.text },
  // Wallet card buttons
  primaryBtn: {
    backgroundColor: colors.primaryBg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  linkBtn: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    alignItems: "center",
  },
  linkBtnText: { color: colors.muted, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  dangerBtn: {
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    alignItems: "center",
  },
  dangerBtnText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});

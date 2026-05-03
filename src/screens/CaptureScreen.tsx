// src/screens/CaptureScreen.tsx
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { DetailsAccordion, type DetailFactor } from "../components/DetailsAccordion";
import { FactorChips, type FactorChip, type FactorSeverity } from "../components/FactorChips";
import { MultiTimeframeDashboard, type DashboardRow } from "../components/MultiTimeframeDashboard";
import { NetBadge } from "../components/NetBadge";
import { PrimaryCTA } from "../components/PrimaryCTA";
import { RatingHeroCard } from "../components/RatingHeroCard";
import { ScreenBackdrop } from "../components/ScreenBackdrop";
import { SizingStrip } from "../components/SizingStrip";
import { UploadScreenshotButton } from "../components/UploadScreenshotButton";
import { WalletChip } from "../components/WalletChip";
import { makeBtcDemo } from "../data/demoData";
import { generateSignalVerification } from "../smc";
import type { SignalVerificationReport } from "../smc";
import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

/**
 * Capture screen — paste OR upload screenshot → SMC engine → branded
 * verify view (hybrid C composition: hero + dashboard + chips +
 * sizing strip + expandable details).
 *
 * Engine call path is unchanged from the M2 stub. Demo signal still
 * comes from `makeBtcDemo()` — live data feed lands in M3.
 */
export function CaptureScreen() {
  const demo = useMemo(() => makeBtcDemo(), []);
  const [signalText, setSignalText] = useState(demo.signalText);
  const [report, setReport] = useState<SignalVerificationReport | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const verify = () => {
    setAnalyzing(true);
    setErrorMsg(null);
    setReport(null);
    setTimeout(() => {
      try {
        const result = generateSignalVerification({
          signal: demo.signal,
          candleData: demo.candleData,
          currentPrice: demo.currentPrice,
          accountBalance: 1000,
          riskRules: { maxRiskPct: 1.0, maxLeverage: 25 },
        });
        setReport(result);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setAnalyzing(false);
      }
    }, 0);
  };

  return (
    <ScreenBackdrop>
      <View style={styles.topbar}>
        <WalletChip state="disconnected" />
        <NetBadge network="devnet" />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {report === null && (
          <>
            <Text style={styles.h1}>Capture</Text>
            <Text style={styles.subtitle}>
              Paste a signal or upload a screenshot. The SMC engine will rate it before you trade.
            </Text>

            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Signal text</Text>
              <TextInput
                style={styles.input}
                multiline
                value={signalText}
                onChangeText={setSignalText}
                placeholder="$BTC LONG&#10;Entry: 67,500&#10;SL: 67,050&#10;TP1: 68,200"
                placeholderTextColor={`${colors.muted}80`}
              />
            </View>

            <UploadScreenshotButton onText={setSignalText} />

            {errorMsg !== null && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>Engine error</Text>
                <Text style={styles.errorBody}>{errorMsg}</Text>
              </View>
            )}

            <PrimaryCTA label="Verify with SMC engine" onPress={verify} loading={analyzing} />
          </>
        )}

        {report !== null && <ReportView report={report} onReset={() => setReport(null)} />}
      </ScrollView>
    </ScreenBackdrop>
  );
}

function ReportView({ report, onReset }: { report: SignalVerificationReport; onReset: () => void }) {
  const heroProps = toHeroProps(report);
  const rows = toDashboardRows(report);
  const chips = toFactorChips(report);
  const sizing = toSizingStats(report);
  const detailFactors = toDetailFactors(report);

  return (
    <View style={{ gap: space.md }}>
      <RatingHeroCard {...heroProps} />
      <MultiTimeframeDashboard rows={rows} pair={report.signal.pair} />
      <FactorChips chips={chips} />
      {sizing !== null && <SizingStrip {...sizing} />}
      <DetailsAccordion justification={report.scoring.justification} factors={detailFactors} />
      <PrimaryCTA label="Confirm trade →" onPress={() => { /* wired in M5/M6 */ }} />
      <PrimaryCTA label="Verify another signal" variant="secondary" onPress={onReset} />
    </View>
  );
}

// ─── Engine → component adapters ─────────────────────────────────────────

function toHeroProps(r: SignalVerificationReport) {
  // Session tag: pull session label from the LTF analysis if present.
  // Engine doesn't expose a top-level session; fall back to OB hint.
  const ltfAnalysis = r.timeframeAnalyses["1m"] ?? r.timeframeAnalyses["5m"] ?? null;
  const obHint = ltfAnalysis?.nearestOb?.isInside === true ? "OB" : null;
  const tag = obHint !== null ? `INSIDE · ${obHint}` : undefined;

  return {
    rating: r.scoring.rating,
    scorePct: r.scoring.score,                 // already 0-100
    verdict: r.scoring.justification,
    side: (r.signal.direction === "long" ? "LONG" : "SHORT") as "LONG" | "SHORT",
    sizeMult: r.scoring.scoreMultiplier,
    sessionTag: tag,
  };
}

function toDashboardRows(r: SignalVerificationReport): DashboardRow[] {
  return Object.entries(r.timeframeAnalyses).map(([tf, a]) => ({
    tf,
    struct: a.structure.bias,
    structStrong: a.structure.bias !== 0 && (a.structure.labels.length >= 2),
    ob: a.nearestOb?.direction ?? 0,
    fvg: a.nearestFvg?.direction ?? 0,
    ema: a.ema.direction,
  }));
}

function toFactorChips(r: SignalVerificationReport): FactorChip[] {
  // Engine factor names → short display labels
  const labels: Record<string, string> = {
    timeframe_alignment: "TF",
    entry_quality: "entry",
    structure: "struct",
    risk_reward_quality: "R:R",
    htf_trend: "HTF",
    swing_position: "swing",
    zone_confluence: "zone",
  };
  return Object.entries(r.scoring.factors).map(([name, f]) => {
    const score = Math.round(f.score * 100);
    const sev: FactorSeverity = score >= 75 ? "good" : score >= 50 ? "ok" : "bad";
    return { label: labels[name] ?? name, score, severity: sev };
  });
}

function toSizingStats(r: SignalVerificationReport) {
  const ps = r.positionSizing;
  if (ps === null) return null;
  return {
    size: ps.positionSize,
    risk: ps.riskAmount,
    riskPct: ps.riskPct,
    slPct: ps.slDistancePct,
  };
}

function toDetailFactors(r: SignalVerificationReport): DetailFactor[] {
  return Object.entries(r.scoring.factors).map(([name, f]) => ({
    name: name.replace(/_/g, " "),
    score: Math.round(f.score * 100),
    detail: f.detail,
  }));
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xs },
  body: { padding: space.md, paddingBottom: 80, gap: space.md },

  h1: { fontSize: 22, fontWeight: fontWeight.bold, color: colors.text, letterSpacing: -0.4 },
  subtitle: { color: colors.muted, fontSize: fontSize.sm, lineHeight: 18 },

  inputCard: {
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, padding: space.md,
  },
  inputLabel: {
    fontSize: fontSize.xs - 1, color: colors.muted, letterSpacing: 1,
    textTransform: "uppercase", fontWeight: fontWeight.semibold, marginBottom: space.sm,
  },
  input: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: space.sm, minHeight: 110, color: colors.text,
    fontFamily: fonts.mono, fontSize: fontSize.sm, lineHeight: 18,
    textAlignVertical: "top",
  },

  errorBox: {
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.danger,
    backgroundColor: colors.dangerBg, padding: space.md,
  },
  errorTitle: { fontWeight: fontWeight.bold, color: colors.danger, marginBottom: 4 },
  errorBody: { color: colors.danger, fontFamily: fonts.mono, fontSize: fontSize.sm },
});

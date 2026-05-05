// src/screens/CaptureScreen.tsx
import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { DetailsAccordion, type DetailFactor } from "../components/DetailsAccordion";
import { FactorChips, type FactorChip, type FactorSeverity } from "../components/FactorChips";
import { MultiTimeframeDashboard, type DashboardRow } from "../components/MultiTimeframeDashboard";
import { NetBadge } from "../components/NetBadge";
import { PairInput } from "../components/PairInput";
import { ParsedSignalCard } from "../components/ParsedSignalCard";
import { PrimaryCTA } from "../components/PrimaryCTA";
import { RatingHeroCard } from "../components/RatingHeroCard";
import { ScreenBackdrop } from "../components/ScreenBackdrop";
import { SizingStrip } from "../components/SizingStrip";
import { UploadScreenshotButton } from "../components/UploadScreenshotButton";
import { WalletChip } from "../components/WalletChip";
import { fetchCandlesForEngine, latestClose, NoCandlesError } from "../data/feed";
import { resolveToPythFeed, type ResolvedPair } from "../data/pairs";
import { ParseError, parsePipeline } from "../parser/pipeline";
import type { ParsedSignal } from "../parser/schema";
import { generateSignalVerification } from "../smc";
import type { SignalInput, SignalVerificationReport } from "../smc";
import { computeSizingPreview } from "../smc/uiSizing";
import { colors, fonts, fontSize, fontWeight, radius, space } from "../theme";

const ACCOUNT_BALANCE = 1000;        // M8 makes editable
const MAX_RISK_PCT = 1.0;            // M8 makes editable
const MAX_LEVERAGE = 25;             // M8 makes editable

/**
 * Capture screen — paste/upload signal → Parse → editable card → Verify → engine.
 *
 * M4: live parser via parsePipeline (regex with LLM fallback). Sizing preview
 * is read-only and derived from edited fields + global risk settings.
 */
export function CaptureScreen() {
  const [pairText, setPairText] = useState("");
  const [resolvedPair, setResolvedPair] = useState<ResolvedPair | null>(null);
  const [signalText, setSignalText] = useState("");
  const [parsed, setParsed] = useState<ParsedSignal | null>(null);
  const [parsing, setParsing] = useState(false);
  const [llmInFlight, setLlmInFlight] = useState(false);
  const [parseErrorMsg, setParseErrorMsg] = useState<string | null>(null);
  const [report, setReport] = useState<SignalVerificationReport | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sizing = useMemo(
    () =>
      computeSizingPreview(parsed, {
        accountBalance: ACCOUNT_BALANCE,
        maxRiskPct: MAX_RISK_PCT,
        maxLeverage: MAX_LEVERAGE,
      }),
    [parsed],
  );

  const verifyDisabled =
    analyzing ||
    parsed === null ||
    resolvedPair === null ||
    resolvedPair.pyth === null ||
    sizing === null;

  const onParse = async () => {
    if (!signalText.trim()) return;
    setParsing(true);
    setParseErrorMsg(null);
    setParsed(null);
    setReport(null);
    abortRef.current = new AbortController();
    // pipeline runs regex synchronously first; LLM only fires on miss + key configured.
    // Defer the llmInFlight flag flip until after the regex pass would have completed.
    // ~50ms is well above any regex latency (<5ms typical) so this fires only when
    // we're actually waiting on the network LLM call.
    const llmFlightTimer = setTimeout(() => setLlmInFlight(true), 50);
    try {
      const result = await parsePipeline(signalText, abortRef.current.signal);
      if (result.ok) {
        setParsed(result.parsed);
        // Auto-fill PairInput if it was empty. PairInput's blur handler is the
        // user-facing resolve path; for the autofill case we synthesize the
        // resolve here so Verify enables without requiring the user to tap
        // into the pair field. Without this, resolvedPair stays null and the
        // Verify button silently no-ops (it's only opacity-dimmed when
        // disabled, which reads as "active" on a phone screen).
        if (!pairText.trim()) {
          setPairText(result.parsed.pair);
          setResolvedPair(resolveToPythFeed(result.parsed.pair));
        }
      } else {
        setParseErrorMsg(parseErrorToMessage(result.error, result.detail));
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setParseErrorMsg(null); // user cancelled — silent
      } else {
        setParseErrorMsg((e as Error).message);
      }
    } finally {
      clearTimeout(llmFlightTimer);
      setParsing(false);
      setLlmInFlight(false);
      abortRef.current = null;
    }
  };

  const onCancelParse = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setParsing(false);
    setLlmInFlight(false);
  };

  const verify = async () => {
    if (!parsed || !resolvedPair?.pyth || !sizing) return;
    setAnalyzing(true);
    setErrorMsg(null);
    setReport(null);
    try {
      const candleData = await fetchCandlesForEngine({ pair: resolvedPair });
      const currentPrice = latestClose(candleData);
      if (currentPrice === null) {
        setErrorMsg("Couldn't compute current price — no candles returned.");
        return;
      }
      const finalSignal: SignalInput = {
        pair: `${resolvedPair.base}${resolvedPair.quote}`,
        direction: parsed.direction,
        entry: parsed.entry,
        stopLoss: parsed.stopLoss,
        takeProfits: parsed.takeProfits,
        leverage: sizing.leverage,
      };
      const result = generateSignalVerification({
        signal: finalSignal,
        candleData,
        currentPrice,
        accountBalance: ACCOUNT_BALANCE,
        riskRules: { maxRiskPct: MAX_RISK_PCT, maxLeverage: MAX_LEVERAGE },
      });
      setReport(result);
    } catch (e) {
      setErrorMsg(toErrorMessage(e));
    } finally {
      setAnalyzing(false);
    }
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
              Paste a signal, tap Parse, review, then Verify against live data.
            </Text>

            <View style={styles.inputCard}>
              <PairInput value={pairText} onChangeText={setPairText} onResolve={setResolvedPair} />
              <View style={styles.spacer} />
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

            <View style={styles.parseRow}>
              <Pressable
                onPress={onParse}
                disabled={parsing || !signalText.trim()}
                style={[styles.parseBtn, (parsing || !signalText.trim()) && styles.parseBtnDisabled]}
              >
                <Text style={styles.parseBtnText}>{parsing ? "Parsing…" : "Parse signal"}</Text>
              </Pressable>
              {parsing && llmInFlight && (
                <Pressable onPress={onCancelParse} style={[styles.parseBtn, styles.parseBtnSecondary]}>
                  <Text style={[styles.parseBtnText, styles.parseBtnTextSecondary]}>Cancel</Text>
                </Pressable>
              )}
            </View>

            {parseErrorMsg !== null && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>Parser error</Text>
                <Text style={styles.errorBody}>{parseErrorMsg}</Text>
              </View>
            )}

            {parsed !== null && (
              <ParsedSignalCard
                value={parsed}
                onChange={setParsed}
                sizing={sizing}
              />
            )}

            {errorMsg !== null && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>Engine error</Text>
                <Text style={styles.errorBody}>{errorMsg}</Text>
              </View>
            )}

            <PrimaryCTA
              label={analyzing ? "Fetching candles…" : "Verify with SMC engine"}
              onPress={verify}
              loading={analyzing}
              disabled={verifyDisabled}
            />
          </>
        )}

        {report !== null && <ReportView report={report} onReset={() => { setReport(null); setParsed(null); setSignalText(""); setPairText(""); }} />}
      </ScrollView>
    </ScreenBackdrop>
  );
}

function parseErrorToMessage(err: ParseError, detail?: string): string {
  switch (err) {
    case ParseError.NoLlmConfig:
      return "AI fallback not configured — set up Claude or OpenAI in Settings, or use a signal format the regex understands.";
    case ParseError.AuthInvalid:
      return "AI key invalid — check Settings.";
    case ParseError.RateLimited:
      return "AI rate-limited — try again in a moment.";
    case ParseError.Malformed:
      return `AI returned malformed data${detail ? ` (${detail.slice(0, 80)})` : ""} — try paste again.`;
    case ParseError.Network:
      return `Couldn't reach AI${detail ? ` (${detail.slice(0, 80)})` : ""} — check your network.`;
  }
}

function toErrorMessage(e: unknown): string {
  if (e instanceof NoCandlesError) {
    return "Couldn't fetch data — Pyth failed and no Birdeye fallback configured. Add a Birdeye key in Settings to enable fallback.";
  }
  if (e instanceof Error) return e.message;
  return String(e);
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

// ─── Engine → component adapters (UNCHANGED from M3) ──────
function toHeroProps(r: SignalVerificationReport) {
  const ltfAnalysis = r.timeframeAnalyses["1m"] ?? r.timeframeAnalyses["5m"] ?? null;
  const obHint = ltfAnalysis?.nearestOb?.isInside === true ? "OB" : null;
  const tag = obHint !== null ? `INSIDE · ${obHint}` : undefined;
  return {
    rating: r.scoring.rating,
    scorePct: r.scoring.score,
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
  return { size: ps.positionSize, risk: ps.riskAmount, riskPct: ps.riskPct, slPct: ps.slDistancePct };
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
  spacer: { height: space.md },
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
  parseRow: { flexDirection: "row", gap: space.sm },
  parseBtn: {
    flex: 1, paddingVertical: space.sm, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
    alignItems: "center",
  },
  parseBtnDisabled: { opacity: 0.4 },
  parseBtnSecondary: { backgroundColor: "transparent" },
  parseBtnText: { color: colors.text, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  parseBtnTextSecondary: { color: colors.muted },
  errorBox: {
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.danger,
    backgroundColor: colors.dangerBg, padding: space.md,
  },
  errorTitle: { fontWeight: fontWeight.bold, color: colors.danger, marginBottom: 4 },
  errorBody: { color: colors.danger, fontFamily: fonts.mono, fontSize: fontSize.sm },
});

import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { generateSignalVerification } from "../smc";
import type { SignalVerificationReport } from "../smc";
import { makeBtcDemo } from "../data/demoData";

/**
 * Capture screen — stub flow that wires the SMC engine end-to-end.
 *
 * For now we feed the engine **synthetic** candles + a hard-coded BTC long
 * signal. The TextInput shows the signal in a human-readable form (will be
 * replaced by OCR/parser output in M4). Pressing "Verify" runs the full
 * pipeline (analyze 7 TFs → confluence → score → position size).
 *
 * No styling polish — that's M8. Just enough to confirm the engine works
 * inside the RN runtime and renders results.
 */
export default function CaptureScreen() {
  const demo = useMemo(() => makeBtcDemo(), []);
  const [signalText, setSignalText] = useState(demo.signalText);
  const [report, setReport] = useState<SignalVerificationReport | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const verify = () => {
    setAnalyzing(true);
    setErrorMsg(null);
    setReport(null);
    // Run on next tick so the spinner has a chance to render. The engine
    // itself is sync — for these demo sizes (~120 bars × 7 TFs) it finishes
    // in <100 ms even on a phone-class CPU.
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
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Capture</Text>
      <Text style={styles.subtitle}>
        Stub: synthetic candles + hard-coded BTC long. Real OCR + live data
        feed land in M3/M4.
      </Text>

      <Text style={styles.label}>Signal text</Text>
      <TextInput
        style={styles.input}
        multiline
        value={signalText}
        onChangeText={setSignalText}
        placeholder="Paste signal here..."
        placeholderTextColor="#999"
      />

      <Pressable
        onPress={verify}
        disabled={analyzing}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
          analyzing && styles.buttonDisabled,
        ]}
      >
        {analyzing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Verify with SMC engine</Text>
        )}
      </Pressable>

      {errorMsg !== null && (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Engine error</Text>
          <Text style={styles.errorBody}>{errorMsg}</Text>
        </View>
      )}

      {report !== null && <ReportPanel report={report} />}
    </ScrollView>
  );
}

function ReportPanel({ report }: { report: SignalVerificationReport }) {
  const { scoring, confluence, positionSizing } = report;
  const ratingColor = ratingToColor(scoring.rating);

  return (
    <View style={styles.report}>
      <View style={styles.headlineRow}>
        <View style={[styles.ratingChip, { backgroundColor: ratingColor }]}>
          <Text style={styles.ratingText}>{scoring.rating}</Text>
        </View>
        <View style={styles.headlineMeta}>
          <Text style={styles.bias}>{confluence.bias.label}</Text>
          <Text style={styles.metaLine}>
            Score {scoring.score} / 100  ·  Bias {confluence.bias.percentage.toFixed(1)}%
          </Text>
          <Text style={styles.metaLine}>
            Entry: {scoring.entryStatus}  ·  R:R {scoring.riskReward.toFixed(2)}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Justification</Text>
        <Text style={styles.body}>{scoring.justification}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Per-factor breakdown</Text>
        {Object.entries(scoring.factors).map(([name, factor]) => (
          <View key={name} style={styles.factorRow}>
            <View style={styles.factorHeader}>
              <Text style={styles.factorName}>{name.replace(/_/g, " ")}</Text>
              <Text style={styles.factorScore}>
                {(factor.score * 100).toFixed(0)}
              </Text>
            </View>
            <Text style={styles.factorDetail}>{factor.detail}</Text>
          </View>
        ))}
      </View>

      {positionSizing !== null && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Position sizing</Text>
          <Text style={styles.body}>
            Size: ${positionSizing.positionSize.toFixed(2)}  (with leverage){"\n"}
            Risk: ${positionSizing.riskAmount.toFixed(2)}  ({positionSizing.riskPct.toFixed(2)}% of capital){"\n"}
            SL distance: {positionSizing.slDistancePct.toFixed(2)}%
          </Text>
        </View>
      )}
    </View>
  );
}

function ratingToColor(rating: string): string {
  switch (rating) {
    case "A+":
      return "#22c55e";
    case "A":
      return "#84cc16";
    case "B":
      return "#eab308";
    case "C":
      return "#f97316";
    default:
      return "#ef4444";
  }
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: "#fff",
  },
  container: {
    padding: 24,
    paddingBottom: 64,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#666",
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#444",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    minHeight: 140,
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    fontFamily: "Courier",
    color: "#111",
    textAlignVertical: "top",
  },
  button: {
    marginTop: 16,
    backgroundColor: "#111",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonPressed: {
    backgroundColor: "#333",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  errorBox: {
    marginTop: 16,
    backgroundColor: "#fee2e2",
    borderColor: "#ef4444",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  errorTitle: {
    fontWeight: "700",
    color: "#991b1b",
    marginBottom: 4,
  },
  errorBody: {
    color: "#991b1b",
    fontFamily: "Courier",
    fontSize: 13,
  },
  report: {
    marginTop: 24,
  },
  headlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  ratingChip: {
    width: 64,
    height: 64,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  ratingText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#fff",
  },
  headlineMeta: {
    flex: 1,
  },
  bias: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
  },
  metaLine: {
    fontSize: 13,
    color: "#555",
    marginTop: 2,
  },
  section: {
    marginTop: 18,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#444",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: "#222",
  },
  factorRow: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e4e4e7",
  },
  factorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  factorName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111",
    textTransform: "capitalize",
  },
  factorScore: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111",
    fontFamily: "Courier",
  },
  factorDetail: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
});

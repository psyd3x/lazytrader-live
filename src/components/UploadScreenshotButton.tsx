import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { colors, fontSize, fontWeight, radius, space } from "../theme";
import { recognizeTextFromImage } from "../input/ocr";

interface Props {
  /** Called with the OCR'd text once recognition succeeds. */
  onText: (text: string) => void;
}

/**
 * Secondary CTA: pick a screenshot → OCR it → hand text back to the
 * parent (which dumps it into the paste TextInput for user review).
 *
 * No image is persisted by the app. The picked URI lives only in the
 * temp picker cache and is dropped after OCR completes.
 */
export function UploadScreenshotButton({ onText }: Props) {
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Grant photos access to upload a screenshot.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        // New SDK 54 / expo-image-picker 17.x API — MediaTypeOptions is deprecated
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        quality: 1,
      });
      if (result.canceled || result.assets.length === 0) return;
      const uri = result.assets[0].uri;
      const text = await recognizeTextFromImage(uri);
      if (text.length === 0) {
        Alert.alert("No text found", "Couldn't read any text from that image. Try a sharper screenshot or paste the signal instead.");
        return;
      }
      onText(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert("Upload failed", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.btn,
        pressed && !busy && styles.pressed,
        busy && styles.busy,
      ]}
    >
      <View style={styles.row}>
        <Ionicons name="image-outline" size={18} color={colors.text} />
        <Text style={styles.label}>{busy ? "Reading…" : "Upload screenshot"}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 12,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { backgroundColor: colors.surface2 },
  busy: { opacity: 0.6 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.semibold },
});

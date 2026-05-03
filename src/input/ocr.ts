import TextRecognition from "@react-native-ml-kit/text-recognition";

/**
 * Run on-device OCR over a local image URI and return the recognised text.
 *
 * Thin wrapper. The full M4 parser pipeline (regex → NuExtract → schema)
 * lives in src/parser/ — this file only does raw `imageUri → string`.
 *
 * @param imageUri - "file://…" URI as returned by expo-image-picker.
 * @returns the joined text from all recognised blocks (newline-separated),
 *   or "" if nothing was recognised.
 * @throws if the image can't be decoded or ML Kit fails internally.
 */
export async function recognizeTextFromImage(
  imageUri: string
): Promise<string> {
  const result = await TextRecognition.recognize(imageUri);
  // result.blocks[].text is the per-block recognised text.
  return result.blocks.map((b) => b.text).join("\n").trim();
}

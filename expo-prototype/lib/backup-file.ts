import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { Platform } from "react-native";

export async function pickBackup(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain"],
    // Read the URI authorized by the Android picker. Expo Go cannot read its cache copy.
    copyToCacheDirectory: Platform.OS !== "android"
  });
  if (result.canceled) return null;
  return new File(result.assets[0].uri).text();
}

export async function saveBackupFile(json: string): Promise<void> {
  if (!await isAvailableAsync()) throw new Error("Share unavailable");
  const file = new File(Paths.cache, `lovelog-backup-${Date.now()}.json`);
  file.create();
  await file.write(json);
  await shareAsync(file.uri, { mimeType: "application/json", UTI: "public.json" });
}

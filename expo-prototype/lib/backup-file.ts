import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";

export async function pickBackup(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain"],
    copyToCacheDirectory: true
  });
  if (result.canceled) return null;
  return new File(result.assets[0].uri).text();
}

export async function saveBackupFile(json: string): Promise<void> {
  if (!await isAvailableAsync()) throw new Error("Share unavailable");
  const file = new File(Paths.cache, `lovelog-backup-${Date.now()}.json`);
  file.create();
  file.write(json);
  await shareAsync(file.uri, { mimeType: "application/json", UTI: "public.json" });
}

import * as DocumentPicker from "expo-document-picker";

export async function pickBackup(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain"],
    base64: false
  });
  if (result.canceled) return null;
  const file = result.assets[0].file;
  if (!file) throw new Error("No backup file");
  return file.text();
}

export async function saveBackupFile(json: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "lovelog-backup.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

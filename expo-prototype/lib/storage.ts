import { SQLiteStorage } from "expo-sqlite/kv-store";

const storage = new SQLiteStorage("lovelog-expo-spike");
const key = "current";

export function loadSnapshot(): Promise<string | null> {
  return storage.getItemAsync(key);
}

export function saveSnapshot(json: string): Promise<void> {
  return storage.setItemAsync(key, json);
}

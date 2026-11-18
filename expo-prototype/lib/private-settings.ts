import { getItemAsync, setItemAsync, deleteItemAsync } from "expo-secure-store";

export function loadPrivate(key: string) {
  return getItemAsync(key);
}

export function savePrivate(key: string, value: string | null) {
  return value === null ? deleteItemAsync(key) : setItemAsync(key, value);
}

import { z } from "zod";
import type { StoredBackup } from "./backup";
import type { VoiceSettings } from "./companion-voice";
import { loadPrivate, savePrivate } from "./private-settings";

const savedKey = z.object({ key: z.string(), base: z.string() });
const keyName = (provider: string) => `lovelog-garden-voice-${provider}`;
const baseOf = (settings: VoiceSettings) => settings.base?.trim().replace(/\/+$/, "") ?? "";

export function voiceSettingsFrom(settings: StoredBackup["settings"]): VoiceSettings {
  const provider = settings.aiProvider === "qwen" ? "qwen" : "deepseek";
  const model = provider === "qwen" ? settings.qwenChatModel : settings.deepSeekModel;
  const base = provider === "qwen" ? settings.qwenBaseUrl : settings.deepSeekBaseUrl;
  return { provider, model: typeof model === "string" ? model : undefined, base: typeof base === "string" ? base : undefined };
}

export async function loadVoiceKey(settings: VoiceSettings) {
  const raw = await loadPrivate(keyName(settings.provider));
  if (!raw) return null;
  const result = savedKey.safeParse(JSON.parse(raw));
  return result.success && result.data.base === baseOf(settings) ? result.data.key : null;
}

export function storeVoiceKey(settings: VoiceSettings, key: string | null) {
  return savePrivate(keyName(settings.provider), key ? JSON.stringify({ key, base: baseOf(settings) }) : null);
}

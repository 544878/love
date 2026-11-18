import { z } from "zod";
import { actionLabels, type CareAction, type Stage } from "./companion.ts";

export type VoiceProvider = "deepseek" | "qwen";

const defaults = {
  deepseek: { base: "https://api.deepseek.com", model: "deepseek-v4-pro", label: "DeepSeek" },
  qwen: { base: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-max", label: "千问" }
};

const localLines: Record<CareAction, string> = {
  feed: "吃饱啦，我去窗边晒会儿太阳。",
  pet: "呼噜呼噜，再摸一下也可以。",
  visit: "我给你留了窗边的位置。"
};

export type VoiceSettings = { provider: VoiceProvider; model?: string; base?: string };
export type VoiceLine = { text: string; source: string };
const responseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().trim().min(1) }) })).min(1)
});

export function localVoice(action: CareAction): VoiceLine {
  return { text: localLines[action], source: "本地台词" };
}

export async function companionVoice(
  settings: VoiceSettings, key: string | null, stage: Stage, action: CareAction, send = fetch
): Promise<VoiceLine> {
  if (!key) return localVoice(action);
  const provider = defaults[settings.provider];
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10_000);
  try {
    const base = new URL(settings.base || provider.base);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) return localVoice(action);
    const endpoint = `${base.href.replace(/\/+$/, "")}/chat/completions`;
    const response = await send(endpoint, {
      method: "POST",
      redirect: "error",
      signal: abort.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: settings.model || provider.model,
        max_tokens: 160,
        messages: [
          { role: "system", content: "你是一只住在窗边的小猫。用一句不超过三十字的简短中文回应照顾你的人。只写台词。" },
          { role: "user", content: `成长阶段：${stage}\n照顾动作：${actionLabels[action]}` }
        ]
      })
    });
    if (!response.ok) return localVoice(action);
    const text = responseSchema.parse(await response.json()).choices[0].message.content;
    return { text: text.slice(0, 100), source: provider.label };
  } catch {
    return localVoice(action);
  } finally {
    clearTimeout(timer);
  }
}

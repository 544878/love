import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { BackupPanel } from "../lib/backup-panel";
import { useBackup } from "../lib/backup-state";
import type { VoiceProvider } from "../lib/companion-voice";
import { useGarden } from "../lib/garden-state";
import { Action, Field, Heading, Notice, Page, ui } from "../lib/ui";
import { loadVoiceKey, storeVoiceKey, voiceSettingsFrom } from "../lib/voice-settings";

function CloudSettings() {
  const { configured, session, status, syncing, connect, disconnect, refresh } = useGarden();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [space, setSpace] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");

  async function login() {
    setWorking(true);
    setNotice("");
    try {
      await connect(username.trim(), password, space.trim(), inviteCode.trim());
      setPassword("");
      setInviteCode("");
    } catch {
      setNotice("加入失败。请检查账号、邀请码和网络。");
    } finally {
      setWorking(false);
    }
  }

  async function logout() {
    setWorking(true);
    try {
      await disconnect();
      setNotice("已退出共享空间。");
    } catch {
      setNotice("退出状态未能保存，请重试。");
    } finally {
      setWorking(false);
    }
  }

  return <View style={ui.card}>
    <Text style={ui.section}>共享空间</Text>
    {!configured ? <Notice>同步服务尚未配置。仍可在本机记录。</Notice> : session
      ? <>
          <Text style={ui.text}>{session.spaceId}</Text>
          {session.inviteCode && <Text selectable style={ui.text}>邀请码 {session.inviteCode}</Text>}
          <Notice>{syncing ? "正在同步…" : status === "offline" ? "连接中断。记录保留在本机。"
            : status === "error" ? "同步未完成，请重试。" : "已加入共享空间"}</Notice>
          <View style={ui.row}>
            <Action label="立即同步" disabled={syncing} onPress={() => void refresh()} />
            <Action label="退出空间" disabled={working} onPress={() => void logout()} />
          </View>
        </>
      : <>
          <Field label="账号" value={username} onChangeText={setUsername} autoCapitalize="none" />
          <Field label="密码" value={password} onChangeText={setPassword} secureTextEntry />
          <Field label="共享空间名称" value={space} onChangeText={setSpace} autoCapitalize="none" />
          <Field label="邀请码（加入时填写）" value={inviteCode} onChangeText={setInviteCode} autoCapitalize="none" />
          <Action label="加入或创建空间" primary disabled={working || username.trim().length < 3 || password.length < 8}
            onPress={() => void login()} />
        </>}
    {notice ? <Notice>{notice}</Notice> : null}
  </View>;
}

function VoiceSettings() {
  const { state, update } = useBackup();
  const [provider, setProvider] = useState<VoiceProvider>("deepseek");
  const [model, setModel] = useState("");
  const [base, setBase] = useState("");
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const settings = state.status === "ready" ? state.data.settings : undefined;

  useEffect(() => {
    if (!settings) return;
    const selection = voiceSettingsFrom(settings);
    setProvider(selection.provider);
    setModel(selection.model ?? "");
    setBase(selection.base ?? "");
  }, [settings?.aiProvider, settings?.qwenChatModel, settings?.qwenBaseUrl, settings?.deepSeekModel, settings?.deepSeekBaseUrl]);

  useEffect(() => {
    let active = true;
    loadVoiceKey({ provider, base }).then((value) => { if (active) setHasKey(Boolean(value)); }).catch(() => {});
    return () => { active = false; };
  }, [provider, base]);

  function choose(next: VoiceProvider) {
    if (!settings) return;
    const picked = voiceSettingsFrom({ ...settings, aiProvider: next });
    setProvider(next);
    setModel(picked.model ?? "");
    setBase(picked.base ?? "");
    setKey("");
    setNotice("");
  }

  async function save() {
    setSaving(true);
    setNotice("");
    try {
      const selection = { provider, base: base.trim(), model: model.trim() };
      if (selection.base) {
        const endpoint = new URL(selection.base);
        if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
          setNotice("服务地址必须是 HTTPS 地址。");
          return;
        }
      }
      if (key.trim()) await storeVoiceKey(selection, key.trim());
      await update((data) => ({
        ...data, settings: { ...data.settings, aiProvider: provider, ...(provider === "qwen"
          ? { qwenChatModel: selection.model, qwenBaseUrl: selection.base }
          : { deepSeekModel: selection.model, deepSeekBaseUrl: selection.base }) }
      }));
      setHasKey(Boolean(await loadVoiceKey(selection)));
      setKey("");
      setNotice("已保存伙伴台词设置。");
    } catch {
      setNotice("未能保存设置。请检查服务地址。");
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    try {
      await storeVoiceKey({ provider, base }, null);
      setKey("");
      setHasKey(false);
      setNotice("已清除本机密钥。");
    } catch {
      setNotice("未能清除密钥。");
    }
  }

  return <View style={ui.card}>
    <Text style={ui.section}>伙伴台词</Text>
    <View style={ui.row}>
      <Action label="DeepSeek" primary={provider === "deepseek"} onPress={() => choose("deepseek")} />
      <Action label="千问" primary={provider === "qwen"} onPress={() => choose("qwen")} />
    </View>
    <Field label="模型（可留空）" value={model} onChangeText={setModel} autoCapitalize="none" />
    <Field label="服务地址（可留空）" value={base} onChangeText={setBase} autoCapitalize="none" />
    <Field label={hasKey ? "密钥已保存，可填写新密钥" : "本机 API 密钥"} value={key} onChangeText={setKey} secureTextEntry autoCapitalize="none" />
    <Notice>密钥只存本机。未配置或连接失败时使用本地台词。</Notice>
    <View style={ui.row}>
      <Action label="保存台词设置" disabled={saving} onPress={() => void save()} />
      {hasKey && <Action label="清除密钥" disabled={saving} onPress={() => void clear()} />}
    </View>
    {notice ? <Notice>{notice}</Notice> : null}
  </View>;
}

export default function Settings() {
  const { state } = useBackup();
  if (state.status !== "ready") return null;
  return <Page>
    <Heading title="设置" />
    <CloudSettings />
    <VoiceSettings />
    <BackupPanel data={state.data} />
  </Page>;
}

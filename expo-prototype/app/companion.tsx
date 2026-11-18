import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useBackup } from "../lib/backup-state";
import { actions, actionLabels, allCare, careScore, growthStage, type CareAction } from "../lib/companion";
import { companionVoice, localVoice, type VoiceLine } from "../lib/companion-voice";
import { Habitat } from "../lib/garden-components";
import { useGarden } from "../lib/garden-state";
import { loadVoiceKey, voiceSettingsFrom } from "../lib/voice-settings";
import { Action, color, Heading, Notice, Page, Shortcut, ui } from "../lib/ui";

export default function CompanionPage() {
  const garden = useGarden();
  const { state } = useBackup();
  const [notice, setNotice] = useState("");
  const [line, setLine] = useState<VoiceLine>();
  const [speaking, setSpeaking] = useState(false);
  const [acting, setActing] = useState(false);
  const [lastAction, setLastAction] = useState<CareAction>("visit");
  const { session, progress, status, syncing, today } = garden;
  const points = progress ? careScore(progress) : 0;
  const stage = growthStage(points);
  const todayRecords = progress ? allCare(progress).filter((record) => record.day === today) : [];
  const binding = session?.binding;
  const canCare = binding && progress?.id === binding.id;

  async function handleCare(action: CareAction) {
    setActing(true);
    setLastAction(action);
    setLine(undefined);
    try {
      const result = await garden.care(action);
      setNotice(result === "recorded" ? "已记下这次照顾。" : result === "already"
        ? `${actionLabels[action]} · 今天你的照顾已经记分。` : "请先同步共享空间。");
    } catch {
      setNotice("照顾记录未能保存，请重试。");
    } finally {
      setActing(false);
    }
  }

  async function speak() {
    if (state.status !== "ready") return;
    const settings = voiceSettingsFrom(state.data.settings);
    setSpeaking(true);
    try {
      const key = await loadVoiceKey(settings);
      setLine(await companionVoice(settings, key, stage, lastAction));
    } catch {
      setLine(localVoice(lastAction));
    } finally {
      setSpeaking(false);
    }
  }

  return <Page>
    <Heading title="共同养猫" detail="窗边小院" />
    <View style={ui.row}>
      <Habitat compact />
      <View style={[ui.card, styles.status]}>
        <Text style={ui.section}>{progress ? stage : "待领养"}</Text>
        {progress && <Text style={ui.text}>{points} 点</Text>}
        <Notice>{syncing ? "正在同步…" : (progress?.pending.length || status === "offline") ? "待同步"
          : progress ? (status === "error" ? "同步未完成" : "已同步") : "两个人一起照顾"}</Notice>
      </View>
    </View>
    {!session && <Shortcut href="/settings" label="加入共享空间" detail="两位成员加入同一空间后可以领养" />}
    {session && !progress && <View style={ui.card}>
      <Notice>{status === "unsupported" ? "当前服务器还不支持伙伴。"
        : status === "pair-required" ? "共享空间需要正好两位成员。"
        : status === "offline" || status === "error" ? "暂时无法连接共享空间。"
        : "领养后，照顾日期以本机当前时区为准。"}</Notice>
      {status === "available" && <Action label="一起领养" primary disabled={syncing} onPress={() => void garden.refresh(true)} />}
    </View>}
    {progress && <View style={ui.card}>
      <Text style={ui.section}>今日照料</Text>
      {(["A", "B"] as const).map((slot) => {
        const item = todayRecords.find((record) => record.slot === slot);
        return <View key={slot} style={[ui.split, styles.line]}>
          <Text style={ui.text}>{slot === binding?.slot ? "你" : "对方"}</Text>
          <Text style={ui.muted}>{item ? actionLabels[item.action] : "待照顾"}</Text>
        </View>;
      })}
      <View style={styles.actions}>
        {actions.map((action) => <Action key={action} label={actionLabels[action]} disabled={!canCare || acting}
          style={styles.care} onPress={() => void handleCare(action)} />)}
      </View>
      {notice ? <Notice>{notice}</Notice> : null}
    </View>}
    {progress && <View style={ui.card}>
      <Action label={speaking ? "正在想一句…" : "听它说一句"} primary disabled={speaking} onPress={() => void speak()} />
      {line && <Notice>{line.text} · {line.source}</Notice>}
    </View>}
    {session && <Action label="同步进度" disabled={syncing} onPress={() => void garden.refresh()} />}
  </Page>;
}

const styles = StyleSheet.create({
  status: { backgroundColor: color.soft, minWidth: 106, minHeight: 170, justifyContent: "center" },
  line: { borderBottomWidth: 1, borderBottomColor: color.line, minHeight: 42 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  care: { flexGrow: 1 }
});

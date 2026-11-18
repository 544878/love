import { useState } from "react";
import { Text, View } from "react-native";
import { z } from "zod";
import { localDate } from "../../../src/date";
import type { CouplePost } from "../../../src/types";
import { useBackup } from "../../lib/backup-state";
import { useGarden } from "../../lib/garden-state";
import { recordId } from "../../lib/record-id";
import { visibleShared } from "../../lib/shared-records";
import { Action, Field, Heading, Notice, Page, ui } from "../../lib/ui";

const course = z.object({ id: z.string(), title: z.string(), weekday: z.number(), startTime: z.string(), endTime: z.string() });
const game = z.looseObject({
  id: z.string(), prompt: z.string(), answer: z.string(), revealed: z.boolean()
});
const weekdays = ["日", "一", "二", "三", "四", "五", "六"];

export default function Memories() {
  const { state, update, saving } = useBackup();
  const garden = useGarden();
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  if (state.status !== "ready") return null;
  const { data } = state;
  const posts = visibleShared(data.couplePosts, garden.session).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function post() {
    if (!text.trim()) return;
    const row: CouplePost = {
      id: recordId("post"), text: text.trim(), author: garden.session?.username || data.settings.ownerName || "你",
      date: localDate(), createdAt: new Date().toISOString()
    };
    try {
      if (await garden.writeShared("couplePosts", row)) setText("");
    } catch {
      setNotice("未能保存这条回忆。");
    }
  }

  return <Page>
    <Heading title="共享回忆" />
    <View style={ui.card}>
      <Text style={ui.section}>动态</Text>
      <Field label="记下这一刻" value={text} onChangeText={setText} multiline />
      <Action label="保存动态" primary disabled={!text.trim() || saving} onPress={() => void post()} />
      {notice ? <Notice>{notice}</Notice> : null}
      {posts.map((row) => <View key={row.id}>
        <Text style={ui.muted}>{row.author} · {row.date}</Text>
        <Text style={ui.text}>{row.text}</Text>
      </View>)}
    </View>
    <View style={ui.card}>
      <Text style={ui.section}>共同课表</Text>
      {data.sharedCourses.length === 0 && <Notice>还没有课程。</Notice>}
      {data.sharedCourses.map((value) => {
        const row = course.safeParse(value);
        if (!row.success) return null;
        const { id, title, weekday, startTime, endTime } = row.data;
        return <Text key={id} style={ui.text}>{title} · 周{weekdays[weekday]} {startTime}–{endTime}</Text>;
      })}
    </View>
    <View style={ui.card}>
      <Text style={ui.section}>小游戏</Text>
      {data.coupleGames.length === 0 && <Notice>还没有小游戏。</Notice>}
      {data.coupleGames.map((value) => {
        const row = game.safeParse(value);
        if (!row.success) return null;
        const { id, prompt, answer, revealed } = row.data;
        return <View key={id}>
          <Text style={ui.text}>{prompt}</Text>
          {revealed ? <Text style={ui.muted}>{answer}</Text> : <Action label="查看答案" disabled={saving}
            onPress={() => void update((current) => ({
              ...current, coupleGames: current.coupleGames.map((item) => {
                const saved = game.safeParse(item);
                return saved.success && saved.data.id === id ? { ...saved.data, revealed: true } : item;
              })
            })).catch(() => setNotice("未能保存小游戏。"))} />}
        </View>;
      })}
    </View>
  </Page>;
}

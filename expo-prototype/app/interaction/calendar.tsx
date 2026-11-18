import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { z } from "zod";
import { friendlyDate, localDate } from "../../../src/date";
import type { CoupleEvent } from "../../../src/types";
import { useBackup } from "../../lib/backup-state";
import { useGarden } from "../../lib/garden-state";
import { recordId } from "../../lib/record-id";
import { visibleShared } from "../../lib/shared-records";
import { Action, Field, Heading, Notice, Page, ui } from "../../lib/ui";

export default function Calendar() {
  const { day } = useLocalSearchParams<{ day?: string }>();
  const selectedDay = z.string().date().safeParse(day);
  const { state, saving } = useBackup();
  const garden = useGarden();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(selectedDay.success ? selectedDay.data : localDate());
  const [kind, setKind] = useState<"anniversary" | "date">("anniversary");
  const [notice, setNotice] = useState("");
  if (state.status !== "ready") return null;

  const events = visibleShared(state.data.coupleEvents, garden.session)
    .filter((event) => !selectedDay.success || event.date === selectedDay.data)
    .sort((a, b) => a.date.localeCompare(b.date));

  async function add() {
    const day = z.string().date().safeParse(date.trim());
    if (!day.success) {
      setNotice("请输入有效日期，例如 2027-05-20。");
      return;
    }
    if (!title.trim()) return;
    const stamp = new Date().toISOString();
    const event: CoupleEvent = {
      id: recordId("event"), date: day.data, title: title.trim(), kind, note: "", createdAt: stamp, updatedAt: stamp
    };
    try {
      if (await garden.writeShared("coupleEvents", event)) {
        setTitle("");
        setNotice("已记下这一天。");
      }
    } catch {
      setNotice("事件未能保存。请重试。");
    }
  }

  return <Page>
    <Heading title="共同日历" detail={selectedDay.success ? friendlyDate(selectedDay.data) : undefined} />
    <View style={ui.card}>
      <Field label="事件名称" value={title} onChangeText={setTitle} />
      <Field label="日期 YYYY-MM-DD" value={date} onChangeText={setDate} />
      <View style={ui.row}>
        <Action label="纪念日" primary={kind === "anniversary"} onPress={() => setKind("anniversary")} />
        <Action label="约会" primary={kind === "date"} onPress={() => setKind("date")} />
      </View>
      <Action label="保存事件" disabled={saving || !title.trim()} onPress={() => void add()} />
      {notice ? <Notice>{notice}</Notice> : null}
    </View>
    {events.length === 0 && <Notice>没有安排。</Notice>}
    {events.map((event) => <View key={event.id} style={ui.card}>
      <Text style={ui.section}>{event.title}</Text>
      <Text style={ui.muted}>{event.date}{event.startTime ? ` · ${event.startTime}` : ""}</Text>
      {event.note ? <Text style={ui.text}>{event.note}</Text> : null}
    </View>)}
  </Page>;
}

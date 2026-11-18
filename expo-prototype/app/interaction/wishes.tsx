import { useState } from "react";
import { Text, View } from "react-native";
import { localDate } from "../../../src/date";
import type { FeedWish } from "../../../src/types";
import { useBackup } from "../../lib/backup-state";
import { useGarden } from "../../lib/garden-state";
import { recordId } from "../../lib/record-id";
import { visibleShared, type wishSchema } from "../../lib/shared-records";
import { Action, Field, Heading, Notice, Page, Shortcut, ui } from "../../lib/ui";
import type { z } from "zod";

const labels = { requested: "待接受", accepted: "已接受", delivered: "已送达" };

export default function Wishes() {
  const { state, saving } = useBackup();
  const garden = useGarden();
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState("");
  if (state.status !== "ready") return null;
  const data = state.data;
  const wishes = visibleShared(data.feedWishes, garden.session).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function save(wish: FeedWish | z.infer<typeof wishSchema>) {
    try {
      return await garden.writeShared("feedWishes", wish);
    } catch {
      setNotice("愿望未能保存。");
      return false;
    }
  }

  async function add() {
    const craving = title.trim();
    if (!craving) return;
    const now = new Date().toISOString();
    if (await save({
      id: recordId("wish"), craving, author: garden.session?.username || data.settings.ownerName || "你",
      note: "", priority: "normal", date: localDate(), fulfilled: false, status: "requested", createdAt: now, updatedAt: now
    })) setTitle("");
  }

  return <Page>
    <Heading title="投喂愿望" />
    <View style={ui.card}>
      <Field label="想吃什么" value={title} onChangeText={setTitle} />
      <Action label="记下愿望" primary disabled={!title.trim() || saving} onPress={() => void add()} />
      {notice ? <Notice>{notice}</Notice> : null}
    </View>
    {wishes.map((wish) => {
      const status = wish.status ?? (wish.fulfilled ? "delivered" : "requested");
      return <View key={wish.id} style={ui.card}>
        <Text style={ui.section}>{wish.craving}</Text>
        <Text style={ui.muted}>{labels[status]} · {wish.date}</Text>
        {wish.note ? <Text style={ui.text}>{wish.note}</Text> : null}
        {status === "delivered"
          ? <Shortcut href="/companion" label="陪它一下" detail="去窗边小院" />
          : <Action label={status === "requested" ? "接受愿望" : "标记已送达"} disabled={saving}
              onPress={() => void save({ ...wish, status: status === "requested" ? "accepted" : "delivered",
                fulfilled: status === "accepted", updatedAt: new Date().toISOString() })} />}
      </View>;
    })}
  </Page>;
}

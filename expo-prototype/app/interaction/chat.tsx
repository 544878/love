import * as ImagePicker from "expo-image-picker";
import { useRef, useState, type ComponentRef } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { CoupleChatMessage } from "../../../src/types";
import { useBackup } from "../../lib/backup-state";
import { AnniversaryNote } from "../../lib/garden-components";
import { useGarden } from "../../lib/garden-state";
import { recordId } from "../../lib/record-id";
import { visibleShared } from "../../lib/shared-records";
import { Action, color, radius, ui } from "../../lib/ui";

function showTime(timestamp: string): string {
  const time = new Date(timestamp);
  return Number.isNaN(time.getTime())
    ? ""
    : time.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function Chat() {
  const { state, saving } = useBackup();
  const garden = useGarden();
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const list = useRef<ComponentRef<typeof ScrollView>>(null);
  if (state.status !== "ready") return null;

  const { data } = state;
  const sender = garden.session?.username || data.settings.ownerName || "你";
  const recipient = data.settings.partnerName || "我们俩";
  const messages = visibleShared(data.coupleMessages, garden.session).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  async function send(photo?: { id: string; dataUrl: string }) {
    const text = draft.trim();
    if (!text && !photo) return;
    const item: CoupleChatMessage = {
      id: recordId("chat"), author: sender, type: photo ? "image" : "text",
      text, createdAt: new Date().toISOString(), photoId: photo?.id
    };
    setMessage("");
    try {
      if (await garden.writeShared("coupleMessages", item, photo)) setDraft("");
    } catch {
      setMessage("未能保存消息。请重试。");
    }
  }

  async function pickPhoto() {
    setPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.7 });
      const asset = result.assets?.[0];
      if (!asset?.base64) return;
      await send({ id: recordId("photo"), dataUrl: `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}` });
    } catch {
      setMessage("未能读取照片。请重试。");
    } finally {
      setPicking(false);
    }
  }

  return (
    <KeyboardAvoidingView style={ui.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[ui.split, styles.header]}>
        <View>
          <Text style={ui.muted}>互动</Text>
          <Text accessibilityRole="header" style={ui.header}>聊天</Text>
        </View>
        <Text style={styles.contact}>{recipient}</Text>
      </View>

      <ScrollView
        ref={list}
        style={ui.page}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
      >
        {messages.length === 0 && <Text style={ui.muted}>还没有消息。</Text>}
        {messages.map((item) => {
          const own = item.author === sender;
          const source = item.type === "image" && item.photoId ? data.photos[item.photoId] : undefined;
          const photo = source?.startsWith("data:image/") ? source : undefined;
          return (
            <View key={item.id} style={[styles.message, own && styles.own]}>
              <Text style={ui.muted}>{item.author} · {showTime(item.createdAt)}</Text>
              <View style={[styles.bubble, own && styles.ownBubble]}>
                {photo ? <Image accessibilityLabel="聊天图片" source={{ uri: photo }} style={styles.image} resizeMode="contain" />
                  : <Text style={ui.text}>{item.text || "图片不可用"}</Text>}
              </View>
            </View>
          );
        })}
        <AnniversaryNote data={data} />
      </ScrollView>

      <View style={styles.composer}>
        <Text style={ui.muted}>{garden.session ? (garden.status === "offline" ? "消息待同步" : "共享空间") : "消息仅保存在本机"}</Text>
        <View style={ui.row}>
          <Action label="照片" disabled={saving || picking} onPress={() => void pickPhoto()} />
          <TextInput
            accessibilityLabel="消息"
            multiline
            placeholder="写一条消息"
            placeholderTextColor={color.muted}
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            editable={!saving}
          />
          <Action label="发送" primary disabled={saving || !draft.trim()} onPress={() => void send()} />
        </View>
        {message !== "" && <Text accessibilityLiveRegion="polite" style={ui.muted}>{message}</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { margin: 20, marginBottom: 0, borderRadius: radius.card, backgroundColor: color.soft, padding: 15 },
  contact: { color: color.primary, fontSize: 15, fontWeight: "700", backgroundColor: color.soft, padding: 10, borderRadius: 12 },
  messages: { gap: 18, padding: 22 },
  message: { alignItems: "flex-start", alignSelf: "flex-start", maxWidth: "84%", gap: 5 },
  own: { alignItems: "flex-end", alignSelf: "flex-end" },
  bubble: { backgroundColor: color.surface, borderColor: color.line, borderWidth: 1, borderRadius: radius.card, paddingVertical: 10, paddingHorizontal: 14 },
  ownBubble: { backgroundColor: color.soft, borderColor: color.soft },
  image: { width: 140, height: 120 },
  composer: { backgroundColor: color.surface, borderColor: color.line, borderTopWidth: 1, paddingHorizontal: 22, paddingVertical: 12, gap: 5 },
  input: {
    flex: 1, minHeight: 48, maxHeight: 112, paddingHorizontal: 13, paddingVertical: 10,
    borderRadius: radius.card, borderColor: color.inputLine, borderWidth: 1, color: color.text, fontSize: 16
  }
});

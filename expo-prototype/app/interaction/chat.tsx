import { useRef, useState, type ComponentRef } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { CoupleChatMessage } from "../../../src/types";
import { useBackup } from "../../lib/backup-state";
import { Action, color, ui } from "../../lib/ui";

function showTime(timestamp: string): string {
  const time = new Date(timestamp);
  return Number.isNaN(time.getTime())
    ? ""
    : time.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function Chat() {
  const { state, save, saving } = useBackup();
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const list = useRef<ComponentRef<typeof ScrollView>>(null);
  if (state.status !== "ready") return null;

  const { data } = state;
  const sender = data.settings.ownerName || "示例A";
  const recipient = data.settings.partnerName || "示例B";
  const messages = [...data.coupleMessages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  async function send() {
    const text = draft.trim();
    if (!text) return;
    const createdAt = new Date().toISOString();
    const item: CoupleChatMessage = {
      id: `local-${createdAt}-${data.coupleMessages.length}`, author: sender, type: "text", text, createdAt
    };
    setMessage("");
    try {
      if (await save({ ...data, coupleMessages: [...data.coupleMessages, { ...item }] })) {
        setDraft("");
      }
    } catch {
      setMessage("未能保存消息。请重试。");
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
      </ScrollView>

      <View style={styles.composer}>
        <Text style={ui.muted}>消息仅保存在本机</Text>
        <View style={ui.row}>
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
          <Action label="发送" primary disabled={saving || !draft.trim()} onPress={send} />
        </View>
        {message !== "" && <Text accessibilityLiveRegion="polite" style={ui.muted}>{message}</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { borderBottomWidth: 1, borderColor: color.line, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 17 },
  contact: { color: color.primary, fontSize: 15, fontWeight: "700", backgroundColor: color.soft, padding: 10, borderRadius: 12 },
  messages: { gap: 18, padding: 22 },
  message: { alignItems: "flex-start", alignSelf: "flex-start", maxWidth: "84%", gap: 5 },
  own: { alignItems: "flex-end", alignSelf: "flex-end" },
  bubble: { backgroundColor: color.surface, borderColor: color.line, borderWidth: 1, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14 },
  ownBubble: { backgroundColor: color.soft, borderColor: color.soft },
  image: { width: 140, height: 120 },
  composer: { backgroundColor: color.surface, borderColor: color.line, borderTopWidth: 1, paddingHorizontal: 22, paddingVertical: 12, gap: 5 },
  input: {
    flex: 1, minHeight: 48, maxHeight: 112, paddingHorizontal: 13, paddingVertical: 10,
    borderRadius: 14, borderColor: color.line, borderWidth: 1, color: color.text, fontSize: 16
  }
});

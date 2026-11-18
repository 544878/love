import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { friendlyDate, localDate, parseLocalDate } from "../../src/date";
import type { CheckIn } from "../../src/types";
import { BackupPanel } from "../lib/backup-panel";
import { useBackup } from "../lib/backup-state";
import { color, ui } from "../lib/ui";

export default function Today() {
  const { state, save, saving } = useBackup();
  const [message, setMessage] = useState("");
  if (state.status !== "ready") return null;

  const { data } = state;
  const today = localDate();
  const weekday = parseLocalDate(today).getDay();
  const habits = data.habits.filter((habit) => habit.days.includes(weekday));
  const checkIns = data.checkIns.filter((item) => item.date === today);
  const completed = habits.filter((habit) => checkIns.some((item) => item.habitId === habit.id && item.completed)).length;
  const todos = data.todos.filter((todo) => todo.startDate <= today && (!todo.endDate || today <= todo.endDate));
  const report = data.reports.find((item) => item.date === today);

  async function toggleHabit(habitId: string, target: number) {
    const prior = checkIns.find((item) => item.habitId === habitId);
    const done = !prior?.completed;
    const stamp = new Date().toISOString();
    const next: CheckIn = {
      id: prior?.id ?? `${habitId}-${today}`,
      habitId, date: today, value: done ? target : 0, note: "",
      completed: done, updatedAt: stamp
    };
    setMessage("");
    try {
      await save({
        ...data,
        checkIns: prior
          ? data.checkIns.map((item) => item.id === prior.id ? { ...item, value: next.value, completed: done, updatedAt: stamp } : item)
          : [...data.checkIns, { ...next }]
      });
    } catch {
      setMessage("未能保存打卡。请重试。");
    }
  }

  return (
    <ScrollView style={ui.page} contentContainerStyle={ui.content}>
      <View style={ui.split}>
        <Text accessibilityRole="header" style={ui.header}>今日</Text>
        <Text style={ui.muted}>{friendlyDate(today)}</Text>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroLabel}>今日任务</Text>
        <Text style={styles.total}>已完成 {completed} / {habits.length}</Text>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: Math.max(habits.length, 1), now: completed }} style={styles.track}>
          <View style={[styles.progress, { width: `${habits.length ? completed / habits.length * 100 : 0}%` }]} />
        </View>
      </View>

      <View style={ui.card}>
        <Text accessibilityRole="header" style={ui.section}>习惯打卡</Text>
        {habits.length === 0 && <Text style={ui.muted}>今天没有安排习惯。</Text>}
        {habits.map((habit) => {
          const checkIn = checkIns.find((item) => item.habitId === habit.id);
          const done = Boolean(checkIn?.completed);
          return (
            <Pressable
              key={habit.id}
              accessibilityRole="checkbox"
              accessibilityLabel={habit.name}
              aria-checked={done}
              disabled={saving}
              onPress={() => toggleHabit(habit.id, habit.target)}
              style={({ pressed }) => [ui.split, styles.habit, pressed && styles.pressed]}
            >
              <View style={ui.row}>
                <Text style={[styles.checkbox, done && styles.checked]}>{done ? "✓" : ""}</Text>
                <Text style={ui.text}>{habit.name}</Text>
              </View>
              <Text style={ui.muted}>{checkIn?.value ?? 0} / {habit.target} {habit.unit}</Text>
            </Pressable>
          );
        })}
        {message !== "" && <Text accessibilityLiveRegion="polite" style={ui.muted}>{message}</Text>}
      </View>

      <View style={ui.card}>
        <Text accessibilityRole="header" style={ui.section}>待办</Text>
        {todos.length === 0 && <Text style={ui.muted}>今天没有待办。</Text>}
        {todos.map((todo) => (
          <Text key={todo.id} style={ui.text}>{todo.title} · {todo.completedDates.includes(today) ? "已完成" : "待完成"}</Text>
        ))}
      </View>

      <View style={ui.card}>
        <Text accessibilityRole="header" style={ui.section}>今日日记</Text>
        <Text style={ui.text}>{report?.lifeNote || "今天还没有日记。"}</Text>
      </View>

      <BackupPanel data={data} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: color.soft, borderRadius: 24, padding: 22, gap: 12 },
  heroLabel: { color: color.primary, fontSize: 15, fontWeight: "600" },
  total: { color: color.text, fontSize: 27, fontWeight: "700" },
  track: { height: 8, borderRadius: 4, backgroundColor: "#efc8d5", overflow: "hidden" },
  progress: { height: 8, borderRadius: 4, backgroundColor: color.primary },
  habit: { minHeight: 48, borderTopWidth: 1, borderColor: color.line, paddingVertical: 8 },
  pressed: { backgroundColor: color.background },
  checkbox: {
    borderWidth: 1, borderColor: color.primary, borderRadius: 8,
    width: 24, height: 24, textAlign: "center", lineHeight: 22, color: color.surface
  },
  checked: { backgroundColor: color.primary }
});

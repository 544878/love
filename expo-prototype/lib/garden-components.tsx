import { StyleSheet, Text, View } from "react-native";
import { friendlyDate, localDate } from "../../src/date";
import type { StoredBackup } from "./backup";
import { allCare, careScore, growthStage, type Progress } from "./companion";
import { useGarden } from "./garden-state";
import { visibleShared } from "./shared-records";
import { color, radius, Shortcut, ui } from "./ui";

export function Habitat({ compact = false }: { compact?: boolean }) {
  return <View style={[styles.window, compact && styles.compact]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={styles.sun} />
    <View style={styles.hill} />
    <View style={styles.sill} />
  </View>;
}

export function ProgressCard({ progress }: { progress?: Progress }) {
  const points = progress ? careScore(progress) : 0;
  return <View style={[ui.card, ui.split]}>
    <View style={styles.copy}>
      <Text style={ui.section}>一起照顾</Text>
      <Text style={ui.muted}>{progress ? `小院 · ${growthStage(points)}` : "在共享空间领养一只伙伴"}</Text>
    </View>
    {progress && <Text style={styles.count}>{points} <Text style={ui.muted}>点</Text></Text>}
  </View>;
}

export function CareShortcut() {
  const { progress, today } = useGarden();
  const completed = progress ? allCare(progress).filter((record) => record.day === today).length : 0;
  return <Shortcut href="/companion" label="去看伙伴" detail={progress ? `今日照顾 ${completed} / 2` : "共同照顾"} style={styles.fill} />;
}

export function AnniversaryNote({ data }: { data: StoredBackup }) {
  const { session } = useGarden();
  const today = localDate();
  const event = visibleShared(data.coupleEvents, session).filter((row) => row.kind === "anniversary" && row.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || "").localeCompare(b.startTime || ""))[0];
  if (!event) return null;
  const date = event.date === today ? "今天" : friendlyDate(event.date);
  return <Shortcut href={{ pathname: "/interaction/calendar", params: { day: event.date } }}
    label={event.title} detail={event.startTime ? `${date} · ${event.startTime}` : date} appointment />;
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  copy: { flex: 1 },
  count: { fontSize: 39, fontWeight: "600", color: color.primary },
  window: {
    height: 187, backgroundColor: color.soft, overflow: "hidden",
    borderTopLeftRadius: radius.feature, borderTopRightRadius: radius.feature,
    borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card,
    borderColor: color.line, borderWidth: 1
  },
  compact: { height: 170, borderTopLeftRadius: 80, borderTopRightRadius: 80, flex: 1 },
  sun: { width: 76, height: 76, borderRadius: 38, backgroundColor: color.clay, top: 36, right: "14%", position: "absolute" },
  hill: {
    height: 113, borderTopLeftRadius: 90, borderTopRightRadius: 130,
    left: "-8%", right: "18%", bottom: -40, backgroundColor: color.line, position: "absolute"
  },
  sill: { left: 0, right: 0, bottom: 0, height: 9, backgroundColor: color.clay, position: "absolute" }
});

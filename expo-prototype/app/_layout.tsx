import { Link, Slot, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { BackupProvider, useBackup } from "../lib/backup-state";
import { GardenProvider } from "../lib/garden-state";
import { color, Notice, radius, ui } from "../lib/ui";

const tabs = [
  { href: "/", label: "今日", icon: "⌂" },
  { href: "/interaction", label: "互动", icon: "○" },
  { href: "/companion", label: "伙伴", icon: "✦" }
] as const;

function AppShell() {
  const pathname = usePathname();
  const { state } = useBackup();

  return <SafeAreaView style={styles.safeArea}>
    <View style={styles.shell}>
      <StatusBar style="dark" />
      <View style={styles.bar}>
        <Link href="/" style={styles.wordmark}>LoveLog</Link>
        <Link href="/settings" style={styles.settings}>设置</Link>
      </View>
      <View style={ui.page}>
        <Slot />
        {state.status !== "ready" && <View style={styles.loading}>
          <Notice>{state.status === "loading" ? "正在读取日记…" : "无法读取本机日记。请检查存储权限后重新打开。"}</Notice>
        </View>}
      </View>
      <View accessibilityRole={Platform.OS === "web" ? "navigation" : undefined} style={styles.navigation}>
        {tabs.map(({ href, label, icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return <Link key={href} href={href} replace asChild>
            <Pressable aria-current={active ? "page" : undefined} accessibilityLabel={label}
              style={StyleSheet.flatten([styles.tab, active && styles.selected])}>
              <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.icon}>{icon}</Text>
              <Text style={styles.tabText}>{label}</Text>
            </Pressable>
          </Link>;
        })}
      </View>
    </View>
  </SafeAreaView>;
}

export default function RootLayout() {
  return <SafeAreaProvider><BackupProvider><GardenProvider><AppShell /></GardenProvider></BackupProvider></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.background },
  shell: { flex: 1, width: "100%", maxWidth: 560, alignSelf: "center" },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", padding: 22 },
  bar: {
    minHeight: 62, borderBottomWidth: 1, borderBottomColor: color.line,
    paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between"
  },
  wordmark: { color: color.primary, fontSize: 17, fontWeight: "800", paddingVertical: 12 },
  settings: {
    color: color.muted, fontSize: 14, paddingVertical: 12, paddingHorizontal: 13,
    borderWidth: 1, borderColor: color.inputLine, borderRadius: radius.small, overflow: "hidden"
  },
  navigation: {
    flexDirection: "row", gap: 4, marginHorizontal: 13, marginVertical: 7, padding: 5,
    borderRadius: radius.card, backgroundColor: color.surface, elevation: 1,
    shadowColor: color.shadow, shadowOffset: { width: 0, height: 3 }, shadowRadius: 10, shadowOpacity: 0.09
  },
  tab: { flex: 1, minHeight: 51, alignItems: "center", justifyContent: "center", borderRadius: radius.card },
  selected: { backgroundColor: color.soft },
  tabText: { fontSize: 13, fontWeight: "600", color: color.primary },
  icon: { fontSize: 19, lineHeight: 21, color: color.primary }
});

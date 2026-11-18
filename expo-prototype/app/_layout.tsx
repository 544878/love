import { Link, Slot, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { BackupProvider, useBackup } from "../lib/backup-state";
import { color, ui } from "../lib/ui";

function AppShell() {
  const pathname = usePathname();
  const { state } = useBackup();
  const today = pathname === "/";

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.shell}>
        <StatusBar style="dark" />
        <View style={ui.page}>
          <Slot />
          {state.status !== "ready" && (
            <View style={styles.loading}>
              <Text accessibilityLiveRegion="polite" style={ui.text}>
                {state.status === "loading" ? "正在读取日记…" : "无法读取本机日记。请检查存储权限后重新打开。"}
              </Text>
            </View>
          )}
        </View>
        <View accessibilityRole="navigation" style={styles.navigation}>
          <Link href="/" replace asChild>
            <Pressable aria-current={today ? "page" : undefined} style={StyleSheet.flatten([styles.tab, today && styles.selected])}>
              <Text style={[styles.tabText, today && styles.selectedText]}>今日</Text>
            </Pressable>
          </Link>
          <Link href="/interaction/chat" replace asChild>
            <Pressable aria-current={today ? undefined : "page"} style={StyleSheet.flatten([styles.tab, !today && styles.selected])}>
              <Text style={[styles.tabText, !today && styles.selectedText]}>互动</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <BackupProvider>
        <AppShell />
      </BackupProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.background },
  shell: { flex: 1, width: "100%", maxWidth: 560, alignSelf: "center" },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", padding: 22 },
  navigation: {
    flexDirection: "row", gap: 10, paddingHorizontal: 22, paddingVertical: 8,
    borderTopColor: color.line, borderTopWidth: 1, backgroundColor: color.surface
  },
  tab: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  selected: { backgroundColor: color.soft },
  tabText: { fontSize: 15, fontWeight: "600", color: color.muted },
  selectedText: { color: color.primary }
});

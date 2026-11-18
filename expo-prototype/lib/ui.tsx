import { Link, type Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import type { ReactNode } from "react";

export const color = {
  background: "#F5F4E7",
  surface: "#FFFAF0",
  soft: "#E0EACB",
  text: "#253528",
  muted: "#485947",
  primary: "#314C31",
  clay: "#F5DECC",
  clayText: "#5C3827",
  line: "#CCD6BC",
  inputLine: "#78866E",
  shadow: "#34482C",
  green: "#314C31"
};
export const radius = { card: 25, small: 18, feature: 64 };

export const ui = StyleSheet.create({
  page: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 22, gap: 15 },
  header: { fontSize: 32, lineHeight: 38, fontWeight: "700", color: color.text },
  section: { fontSize: 18, lineHeight: 24, fontWeight: "700", color: color.text },
  text: { fontSize: 16, lineHeight: 24, color: color.text },
  muted: { fontSize: 13, lineHeight: 18, color: color.muted },
  card: { backgroundColor: color.surface, borderColor: color.line, borderWidth: 1, borderRadius: radius.card, padding: 16, gap: 9 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  split: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  input: {
    minHeight: 48, borderRadius: radius.card, borderWidth: 1,
    borderColor: color.inputLine, backgroundColor: color.surface, color: color.text, paddingHorizontal: 14, fontSize: 16
  }
});

export function Page({ children }: { children: ReactNode }) {
  return <ScrollView style={ui.page} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}

export function Heading({ title, detail }: { title: string; detail?: string }) {
  return <View>
    <Text accessibilityRole="header" style={ui.header}>{title}</Text>
    {detail ? <Text style={ui.muted}>{detail}</Text> : null}
  </View>;
}

export function Field({ label, ...input }: TextInputProps & { label: string }) {
  return <View style={styles.field}>
    <Text style={ui.muted}>{label}</Text>
    <TextInput {...input} accessibilityLabel={label} placeholderTextColor={color.muted} style={[ui.input, input.style]} />
  </View>;
}

export function Notice({ children }: { children: ReactNode }) {
  return <Text accessibilityLiveRegion="polite" aria-live="polite" style={ui.muted}>{children}</Text>;
}

export function Action({ label, onPress, disabled, primary, style }: {
  label: string; onPress: () => void; disabled?: boolean; primary?: boolean; style?: StyleProp<ViewStyle>;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [
      styles.button, primary && styles.primary, (pressed || disabled) && styles.dim, style
    ]}>
    <Text style={[styles.label, primary && styles.onPrimary]}>{label}</Text>
  </Pressable>;
}

export function Shortcut({ href, label, detail, appointment, style }: {
  href: Href; label: string; detail: string; appointment?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const box = StyleSheet.flatten([ui.card, styles.shortcut, appointment && styles.appointment, style]);
  return <Link href={href} asChild>
    <Pressable style={box} accessibilityLabel={`${label}，${detail}`}>
      <Text style={[ui.section, appointment && styles.appointmentText]}>{label}</Text>
      <Text style={[ui.muted, appointment && styles.appointmentText]}>{detail}</Text>
    </Pressable>
  </Link>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48, alignItems: "center", justifyContent: "center",
    borderRadius: radius.card, paddingHorizontal: 14, backgroundColor: color.soft, borderWidth: 1, borderColor: color.soft
  },
  primary: { backgroundColor: color.primary, borderColor: color.primary },
  label: { color: color.primary, fontSize: 14, fontWeight: "700", textAlign: "center" },
  onPrimary: { color: color.surface },
  dim: { opacity: 0.58 },
  field: { gap: 4 },
  shortcut: { backgroundColor: color.soft, gap: 4, minHeight: 62, justifyContent: "center" },
  appointment: { backgroundColor: color.clay, borderColor: color.clay },
  appointmentText: { color: color.clayText }
});

import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

export const color = {
  background: "#fdf7f7",
  surface: "#ffffff",
  text: "#342129",
  muted: "#6f555d",
  primary: "#a83254",
  soft: "#fbe6ed",
  line: "#ebd5d8",
  green: "#2b6b55"
};

export const ui = StyleSheet.create({
  page: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 28, paddingBottom: 24, gap: 18 },
  header: { fontSize: 32, fontWeight: "700", color: color.text },
  section: { fontSize: 17, fontWeight: "700", color: color.text },
  text: { fontSize: 15, lineHeight: 23, color: color.text },
  muted: { fontSize: 14, lineHeight: 21, color: color.muted },
  card: { backgroundColor: color.surface, borderColor: color.line, borderWidth: 1, borderRadius: 20, padding: 17, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  split: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }
});

export function Action({ label, onPress, disabled, primary, style }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.primary,
        (pressed || disabled) && styles.dim,
        style
      ]}
    >
      <Text style={[styles.label, primary && styles.onPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48, alignItems: "center", justifyContent: "center",
    borderRadius: 14, paddingHorizontal: 14, backgroundColor: color.soft
  },
  primary: { backgroundColor: color.primary },
  label: { color: color.primary, fontSize: 14, fontWeight: "700" },
  onPrimary: { color: color.surface },
  dim: { opacity: 0.55 }
});

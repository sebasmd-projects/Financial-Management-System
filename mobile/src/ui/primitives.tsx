import { type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type TextStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { radius, space, targetMin, type } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const c = useTheme();
  const body = <View style={styles.screenBody}>{children}</View>;
  return <SafeAreaView style={[styles.fill, { backgroundColor: c.canvas }]}>{scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>{body}</ScrollView> : body}</SafeAreaView>;
}

type TextKind = keyof typeof type;
export function AppText({ kind = "body", tone = "primary", style, children, ...rest }: { kind?: TextKind; tone?: "primary" | "secondary" | "negative" | "positive" | "tertiary"; style?: TextStyle; children: ReactNode; accessibilityRole?: "header" | "alert" | "text"; accessibilityLiveRegion?: "polite" | "assertive" | "none"; selectable?: boolean }) {
  const c = useTheme();
  const color = { primary: c.textPrimary, secondary: c.textSecondary, tertiary: c.textTertiary, negative: c.negative, positive: c.positive }[tone];
  return (
    <Text {...rest} style={[type[kind], { color }, style]}>
      {children}
    </Text>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <AppText kind="titleL" accessibilityRole="header">
      {children}
    </AppText>
  );
}

/** Error o aviso: el lector de pantalla lo anuncia. */
export function Notice({ children, tone = "negative" }: { children: ReactNode; tone?: "negative" | "secondary" | "positive" }) {
  return (
    <AppText kind="bodyS" tone={tone} accessibilityRole="alert" accessibilityLiveRegion="polite">
      {children}
    </AppText>
  );
}

export function Button({ label, onPress, kind = "primary", busy = false, disabled = false }: { label: string; onPress: () => void; kind?: "primary" | "secondary" | "danger" | "ghost"; busy?: boolean; disabled?: boolean }) {
  const c = useTheme();
  const off = disabled || busy;
  const bg = { primary: c.primary, secondary: c.surface2, danger: c.negative, ghost: "transparent" }[kind];
  const fg = { primary: c.onPrimary, secondary: c.textPrimary, danger: c.canvas, ghost: c.primary }[kind];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: off, busy }} disabled={off} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: off ? 0.55 : pressed ? 0.85 : 1 }]}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[type.titleS, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, ...input }: TextInputProps & { label: string; error?: string | null }) {
  const c = useTheme();
  return (
    <View style={styles.field}>
      <AppText kind="label" tone="secondary">
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        {...input}
        style={[type.body, styles.input, { color: c.textPrimary, backgroundColor: c.surface, borderColor: error ? c.negative : c.borderStrong }]}
      />
      {error ? <Notice>{error}</Notice> : null}
    </View>
  );
}

export function Check({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (next: boolean) => void }) {
  const c = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} accessibilityLabel={label} onPress={() => onChange(!value)} style={styles.check}>
      <View style={[styles.box, { borderColor: c.borderStrong, backgroundColor: value ? c.primary : c.surface }]}>{value ? <Text style={{ color: c.onPrimary, fontWeight: "700" }}>✓</Text> : null}</View>
      <View style={styles.fill}>
        <AppText>{label}</AppText>
        {hint ? (
          <AppText kind="caption" tone="secondary">
            {hint}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

export function Card({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>{children}</View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1 },
  screenBody: { flex: 1, padding: space[16], gap: space[16] },
  button: { minHeight: targetMin, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: space[16] },
  field: { gap: space[4] },
  input: { minHeight: targetMin, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: space[12] },
  check: { flexDirection: "row", gap: space[12], alignItems: "flex-start", minHeight: targetMin, paddingVertical: space[4] },
  box: { width: 24, height: 24, borderRadius: radius.xs, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: space[2] },
  card: { borderWidth: 1, borderRadius: radius.md, padding: space[16], gap: space[8] },
});

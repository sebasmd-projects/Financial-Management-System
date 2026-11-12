import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { formatPeriod, periodOf, shiftPeriod, todayBogota } from "@core/dates";
import { usePhase } from "@/auth/use-session";
import { hiddenStore, useHidden } from "@/features/common/hidden";
import { paths } from "@/features/common/paths";
import { useResource } from "@/features/common/use-resource";
import { startQuickAdd } from "@/features/quick-add/store";
import { scopedPath } from "@/features/scope/scope";
import { ScopeSwitcher } from "@/features/scope/switcher";
import { useScope } from "@/features/scope/store";
import { bellCount, type NotificationList } from "@/features/notifications/logic";
import { fromApiAmount } from "@/features/quick-add/keypad-logic";
import { Money } from "@/ui/money";
import { SummaryView } from "@/features/summary/view";
import type { Dashboard, Summary } from "@/features/summary/logic";
import { es } from "@/i18n/es";
import { radius, space, targetMin, type } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";
import { AppText, Button, Card, Chip, Notice } from "@/ui/primitives";

const t = es.summary;
const PERIODS_BACK = 11;

/**
 * Resumen financiero (diseño §2): el tablero del servidor (`GET dashboard`) según el ámbito (Personal, Hogar o Ambos). El periodo,
 * el ojo de «ocultar montos» y el ámbito viven en memoria. Los atajos abren el alta rápida con los datos de la plantilla en
 * memoria (la ruta no lleva monto).
 */
export default function Home() {
  const c = useTheme();
  const router = useRouter();
  const phase = usePhase();
  const scope = useScope();
  const hidden = useHidden();
  const today = todayBogota();
  const current = periodOf(today);
  const [period, setPeriod] = useState(current);
  const past = period !== current;
  const both = scope.kind === "both" ? scope : null;
  const dashboard = useResource<Dashboard>(both ? null : scopedPath(paths.dashboard(past ? period : undefined), scope));
  const summary = useResource<Summary>(both ? paths.summaryBoth(both.id, past ? period : undefined) : null);
  const unread = useResource<NotificationList>(paths.notifications(true)).data?.unread ?? 0;
  const active = both ? summary : dashboard;
  const refreshing = active.loading && active.data !== null;

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: c.canvas }]}>
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={active.reload} />}>
        <View style={styles.header}>
          <AppText kind="titleL" accessibilityRole="header">
            {phase.name === "ready" ? `${t.title}` : t.title}
          </AppText>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={hidden ? t.showAmounts : t.hideAmounts}
              accessibilityState={{ selected: hidden }}
              onPress={() => hiddenStore.set(!hidden)}
              style={[styles.icon, { backgroundColor: hidden ? c.primaryContainer : c.surface2 }]}
            >
              <Text style={[type.label, { color: c.textPrimary }]}>{hidden ? "•••" : "123"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t.bell(unread)} onPress={() => router.navigate("/notifications")} style={[styles.icon, { backgroundColor: c.surface2 }]}>
              <Text style={[type.label, { color: c.textPrimary }]}>{unread > 0 ? bellCount(unread) : "0"}</Text>
            </Pressable>
          </View>
        </View>
        <ScopeSwitcher />
        <View style={styles.period} accessibilityRole="toolbar" accessibilityLabel={t.periodLabel}>
          <Chip label="‹" a11yLabel={t.previousPeriod} onPress={() => period > shiftPeriod(current, -PERIODS_BACK) && setPeriod(shiftPeriod(period, -1))} />
          <AppText kind="titleS" accessibilityLiveRegion="polite">
            {formatPeriod(period)}
          </AppText>
          <Chip label="›" a11yLabel={t.nextPeriod} onPress={() => period < current && setPeriod(shiftPeriod(period, 1))} />
        </View>
        {past ? (
          <View style={styles.period}>
            <AppText tone="secondary">{t.viewingPast(formatPeriod(period))}</AppText>
            <Button label={t.backToToday} kind="ghost" onPress={() => setPeriod(current)} />
          </View>
        ) : null}

        {active.loading && !active.data ? <ActivityIndicator accessibilityLabel={es.common.loading} color={c.primary} /> : null}
        {active.failure ? (
          <View style={styles.stack}>
            <Notice>{active.failure === "network" ? es.common.network : t.loadError}</Notice>
            <Button label={es.common.retry} kind="secondary" onPress={active.reload} />
          </View>
        ) : null}
        {both && summary.data ? <Consolidated data={summary.data} /> : null}
        {!both && dashboard.data ? (
          <SummaryView
            data={dashboard.data}
            past={past}
            scoped={scope.kind === "household"}
            actions={{
              onShortcut: (shortcut, plainName) => {
                // Los datos de la plantilla pasan por memoria, nunca por la ruta.
                startQuickAdd({ description: shortcut?.name ?? plainName ?? "", amount: shortcut ? fromApiAmount(shortcut.amount) : "", categoryId: shortcut?.category_id ?? null });
                router.push("/quick-add");
              },
              onAlert: () => router.navigate("/notifications"),
            }}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** «Ambos»: las cifras personales y las del hogar sumadas por el servidor (`GET summary?scope=both`). */
function Consolidated({ data }: { data: Summary }) {
  return (
    <Card>
      <AppText tone="secondary">{t.consolidatedIntro}</AppText>
      <View style={styles.kpiRow}>
        <AppText tone="secondary">{t.availableToday}</AppText>
        <Money value={data.available_today} kind="titleM" />
      </View>
      <View style={styles.kpiRow}>
        <AppText tone="secondary">{t.spent}</AppText>
        <Money value={data.spent} kind="titleS" />
      </View>
      <View style={styles.kpiRow}>
        <AppText tone="secondary">{t.consolidatedIncome}</AppText>
        <Money value={data.income} kind="titleS" />
      </View>
      <View style={styles.kpiRow}>
        <AppText tone="secondary">{t.owed}</AppText>
        <Money value={data.owed} kind="titleS" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: space[16], gap: space[12] },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  actions: { flexDirection: "row", gap: space[8] },
  icon: { minWidth: targetMin, minHeight: targetMin, borderRadius: radius.full, alignItems: "center", justifyContent: "center", paddingHorizontal: space[8] },
  period: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[8] },
  stack: { gap: space[8] },
  kpiRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 32 },
});

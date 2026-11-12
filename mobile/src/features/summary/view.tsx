import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { compareAmounts, isNegativeAmount } from "@core/money";
import { daysBetween, formatDate, formatDateShort, todayBogota } from "@core/dates";
import { es } from "@/i18n/es";
import { radius, space, targetMin, type } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";
import { Money } from "@/ui/money";
import { AppText, Card, Chip } from "@/ui/primitives";
import { Sheet } from "@/ui/sheet";
import { barSegments, clampIndex, horizon, isFirstUse, type Alert, type Dashboard, type FixedItem, type RailItem, type Shortcut } from "./logic";

const t = es.summary;

export interface SummaryActions {
  onShortcut: (shortcut: Shortcut | null, plainName?: string) => void;
  onAlert: (alert: Alert) => void;
}

/**
 * El Resumen a partir del tablero del servidor (`GET dashboard`): Te queda, gastado, disponible y liquidez, próximos pagos, gastos
 * fijos, atajos y la alerta más urgente. Solo presenta: ninguna cifra se calcula aquí. Todos los montos pasan por `<Money>`
 * (formato de `core/money`, «ocultar montos»).
 */
export function SummaryView({ data, past, scoped, actions }: { data: Dashboard; past: boolean; scoped: boolean; actions: SummaryActions }) {
  const [sheet, setSheet] = useState<"left" | "liquidity" | null>(null);
  return (
    <View style={styles.stack}>
      <KpiCard d={data} past={past} onLeft={() => setSheet("left")} onLiquidity={() => setSheet("liquidity")} />
      {scoped ? (
        <AppText tone="secondary" kind="bodyS">
          {t.householdHint}
        </AppText>
      ) : (
        <>
          <View style={past ? styles.dim : undefined}>
            <Rail items={data.rail} />
          </View>
          <FixedGrid d={data} />
        </>
      )}
      <View style={[styles.stack, past ? styles.dim : undefined]}>
        <Shortcuts d={data} onShortcut={actions.onShortcut} />
        <AlertStrip d={data} onAlert={actions.onAlert} />
      </View>
      {isFirstUse(data) ? (
        <Card>
          <AppText kind="titleS">{t.firstUseTitle}</AppText>
          <AppText tone="secondary">{t.firstUseBody}</AppText>
        </Card>
      ) : null}
      <Sheet open={sheet === "left"} title={t.breakdownTitle} onClose={() => setSheet(null)}>
        <Breakdown d={data} />
      </Sheet>
      <Sheet open={sheet === "liquidity"} title={t.liquidityTitle} onClose={() => setSheet(null)}>
        <LiquiditySheet d={data} />
      </Sheet>
    </View>
  );
}

function KpiCard({ d, past, onLeft, onLiquidity }: { d: Dashboard; past: boolean; onLeft: () => void; onLiquidity: () => void }) {
  const c = useTheme();
  const negative = isNegativeAmount(d.kpi.remaining);
  const seg = barSegments(d.bar);
  const h30 = horizon(d, 30);
  const empty = compareAmounts(d.kpi.income, "0") === 0 && compareAmounts(d.kpi.spent, "0") === 0;
  return (
    <Card>
      <View style={styles.kpis}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.breakdownTitle} onPress={onLeft} style={styles.kpiMain}>
          <AppText kind="label" tone="secondary">
            {past ? t.leftPast : t.left}
          </AppText>
          <Money value={d.kpi.remaining} kind="kpi" tone={negative ? "negative" : "primary"} />
        </Pressable>
        <View style={styles.kpiSide}>
          <AppText kind="label" tone="secondary">
            {t.spent}
          </AppText>
          <Money value={d.kpi.spent} kind="titleM" />
        </View>
      </View>
      <View accessible accessibilityRole="image" accessibilityLabel={t.bar(seg.spent, seg.committed, seg.free)} style={[styles.bar, { backgroundColor: c.track }]}>
        <View style={{ width: `${seg.spent}%`, backgroundColor: c.primary }} />
        <View style={{ width: `${seg.committed}%`, backgroundColor: c.primaryContainer }} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t.liquidityTitle} onPress={onLiquidity} style={styles.liquidity}>
        <Text style={[type.caption, { color: c.textSecondary }]}>
          {t.availableToday} <Money value={d.kpi.available_today} kind="caption" tone="secondary" />
          {h30 !== null ? (
            <>
              {" · "}
              {t.inDays(30)} <Money value={h30} kind="caption" tone="secondary" />
            </>
          ) : null}
          {" ›"}
        </Text>
      </Pressable>
      {empty ? (
        <AppText kind="caption" tone="secondary">
          {t.emptyKpi}
        </AppText>
      ) : null}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <AppText tone="secondary">{label}</AppText>
      {children}
    </View>
  );
}

function Breakdown({ d }: { d: Dashboard }) {
  return (
    <View style={styles.stack}>
      <Row label={t.breakdownIncome}>
        <Money value={d.kpi.income} />
      </Row>
      <Row label={t.breakdownSpent}>
        <Money value={d.kpi.spent} />
      </Row>
      <Row label={t.breakdownLoanCapital}>
        <Money value={d.kpi.loan_capital_paid} />
      </Row>
      <Row label={t.breakdownCommitted}>
        <Money value={d.kpi.committed} />
      </Row>
      {compareAmounts(d.kpi.goal_contributions, "0") > 0 ? (
        <Row label={t.breakdownGoals}>
          <Money value={d.kpi.goal_contributions} />
        </Row>
      ) : null}
      <Row label={t.breakdownLeft}>
        <Money value={d.kpi.remaining} kind="titleS" tone={isNegativeAmount(d.kpi.remaining) ? "negative" : "primary"} />
      </Row>
      <Row label={t.owed}>
        <Money value={d.kpi.owed} />
      </Row>
      {compareAmounts(d.kpi.overdue_total, "0") > 0 ? (
        <Row label={t.overdueTotal}>
          <Money value={d.kpi.overdue_total} tone="negative" />
        </Row>
      ) : null}
    </View>
  );
}

function LiquiditySheet({ d }: { d: Dashboard }) {
  const { first_negative_date: firstNegative, missing } = d.liquidity;
  return (
    <View style={styles.stack}>
      <AppText tone="secondary">{t.liquidityIntro}</AppText>
      <Row label={t.availableToday}>
        <Money value={d.kpi.available_today} />
      </Row>
      {d.liquidity.horizons.map((h) => (
        <Row key={h.days} label={t.liquidityDays(h.days)}>
          <Money value={h.balance} tone={isNegativeAmount(h.balance) ? "negative" : "primary"} />
        </Row>
      ))}
      {firstNegative ? (
        <View accessibilityRole="alert">
          <AppText tone="negative">{t.liquidityNegative(formatDate(firstNegative))}</AppText>
          {missing && compareAmounts(missing, "0") > 0 ? (
            <Row label={t.liquidityMissing}>
              <Money value={missing} tone="negative" />
            </Row>
          ) : null}
        </View>
      ) : (
        <AppText tone="secondary">{t.liquidityOk}</AppText>
      )}
    </View>
  );
}

function Rail({ items }: { items: readonly RailItem[] }) {
  return (
    <View style={styles.section}>
      <AppText kind="titleS" accessibilityRole="header">
        {t.railTitle}
      </AppText>
      {items.length === 0 ? (
        <AppText tone="secondary" kind="bodyS">
          {t.railNone}
        </AppText>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {items.map((item) => (
            <RailCard key={`${item.kind}-${item.ref_id}`} item={item} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function RailCard({ item }: { item: RailItem }) {
  const c = useTheme();
  const overdue = item.state === "overdue";
  const soon = item.state === "soon" || item.state === "today";
  const state = t.railStates[item.state];
  const date = (item.kind === "card_cut" ? t.railCut : t.railDue)(formatDateShort(item.date));
  return (
    <View
      accessible
      style={[styles.railCard, { backgroundColor: overdue ? c.negativeContainer : c.surface, borderColor: soon ? c.warning : overdue ? c.negative : c.border }]}
    >
      <Text numberOfLines={1} style={[type.label, { color: overdue ? c.onNegativeContainer : c.textPrimary }]}>
        {item.name}
      </Text>
      {item.amount === null ? <AppText kind="titleS">{t.pending}</AppText> : <Money value={item.amount} kind="titleS" tone={overdue ? "negative" : "primary"} />}
      <Text style={[type.caption, { color: overdue ? c.onNegativeContainer : c.textSecondary }]}>
        {date}
        {state ? ` · ${state}` : ""}
      </Text>
    </View>
  );
}

function FixedGrid({ d }: { d: Dashboard }) {
  const grid = d.fixed_expenses;
  return (
    <View style={styles.section}>
      <AppText kind="titleS" accessibilityRole="header">
        {`${t.fixedTitle} · ${t.fixedProgress(grid.paid_count, grid.total_count)}`}
      </AppText>
      {grid.total_count === 0 ? (
        <AppText tone="secondary" kind="bodyS">
          {t.fixedEmpty}
        </AppText>
      ) : (
        <View style={styles.grid}>
          {grid.items.map((item) => (
            <FixedTile key={item.occurrence_id} item={item} />
          ))}
          {grid.more > 0 ? (
            <View style={[styles.tile, { borderColor: "transparent" }]}>
              <AppText kind="bodyS" tone="secondary">
                {t.fixedMore(grid.more + grid.items.length)}
              </AppText>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

function FixedTile({ item }: { item: FixedItem }) {
  const c = useTheme();
  const overdue = item.status === "overdue";
  const paid = item.status === "paid";
  const barColor = overdue ? c.negative : paid ? c.positive : c.primary;
  return (
    <View
      accessible
      accessibilityLabel={`${item.name}, ${t.fixedStatus[item.status]}, ${item.percent} %`}
      style={[styles.tile, { backgroundColor: overdue ? c.negativeContainer : paid ? c.surface2 : c.surface, borderColor: item.status === "soon" ? c.warning : c.border }]}
    >
      <Text numberOfLines={1} style={[type.label, { color: overdue ? c.onNegativeContainer : c.textPrimary }]}>
        {item.name}
      </Text>
      <Text style={[type.caption, { color: c.textSecondary }]} numberOfLines={2}>
        {item.status === "skipped" ? (
          t.fixedStatus.skipped
        ) : item.status === "partial" ? (
          <>
            {t.fixedLeft} <Money value={item.pending} kind="caption" tone="secondary" /> · {formatDateShort(item.due_date)}
          </>
        ) : paid ? (
          <>
            {t.fixedPaid} <Money value={item.paid} kind="caption" tone="secondary" /> · {formatDateShort(item.due_date)}
          </>
        ) : (
          <>
            <Money value={item.expected} estimated={item.estimated} compact kind="caption" tone="secondary" /> ·{" "}
            {overdue ? `${t.fixedStatus.overdue} ${formatDateShort(item.due_date)}` : relative(item.due_date)}
          </>
        )}
      </Text>
      {item.status === "skipped" ? null : (
        <View style={[styles.progressTrack, { backgroundColor: c.track }]}>
          <View style={{ width: `${Math.min(Math.max(item.percent, 0), 100)}%`, height: 4, backgroundColor: barColor }} />
        </View>
      )}
    </View>
  );
}

function relative(date: string): string {
  const days = daysBetween(todayBogota(), date);
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  return days > 1 ? `en ${days} días` : formatDateShort(date);
}

function Shortcuts({ d, onShortcut }: { d: Dashboard; onShortcut: SummaryActions["onShortcut"] }) {
  const plain = d.shortcuts.length === 0;
  return (
    <View style={styles.section}>
      <AppText kind="label" tone="secondary" accessibilityRole="header">
        {t.shortcuts}
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {plain
          ? t.shortcutPlain.map((name) => <Chip key={name} label={name} onPress={() => onShortcut(null, name)} />)
          : d.shortcuts.map((s) => (
              <Pressable key={`${s.name}-${s.category_id}`} onPress={() => onShortcut(s)} accessibilityRole="button" accessibilityLabel={s.name} style={[styles.shortcut]}>
                <ShortcutLabel shortcut={s} />
              </Pressable>
            ))}
        <Chip label={t.shortcutOther} onPress={() => onShortcut(null)} />
      </ScrollView>
    </View>
  );
}

function ShortcutLabel({ shortcut }: { shortcut: Shortcut }) {
  const c = useTheme();
  return (
    <View style={[styles.shortcutInner, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={[type.label, { color: c.textPrimary }]}>
        {shortcut.name} <Money value={shortcut.amount} compact kind="label" tone="secondary" />
      </Text>
    </View>
  );
}

function alertText(alert: Alert): string {
  return `${alert.name} ${t.alertKinds[alert.kind]}`;
}

/** La alerta más urgente en una línea («1/3»); sin alertas, «Todo al día» (el bloque no desaparece). */
function AlertStrip({ d, onAlert }: { d: Dashboard; onAlert: SummaryActions["onAlert"] }) {
  const c = useTheme();
  const [index, setIndex] = useState(0);
  const total = d.alerts.length;
  const i = clampIndex(index, total);
  if (total === 0) {
    return (
      <View accessibilityRole="summary" style={[styles.alert, { backgroundColor: c.positiveContainer }]}>
        <AppText tone="positive" kind="bodyS">
          {d.all_clear_days !== null ? t.allClear(d.all_clear_days) : t.allClearNone}
        </AppText>
      </View>
    );
  }
  const alert = d.alerts[i];
  const bg = alert.severity === "critical" ? c.negativeContainer : alert.severity === "warning" ? c.warningContainer : c.infoContainer;
  const fg = alert.severity === "critical" ? c.onNegativeContainer : alert.severity === "warning" ? c.onWarningContainer : c.onInfoContainer;
  return (
    <View style={[styles.alert, { backgroundColor: bg }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${t.alertSeverity[alert.severity]}: ${alertText(alert)}`} onPress={() => onAlert(alert)} style={styles.alertText}>
        <Text style={[type.bodyS, { color: fg }]} numberOfLines={1}>
          {alertText(alert)}
          {alert.amount !== null && compareAmounts(alert.amount, "0") > 0 ? " · " : ""}
          {alert.amount !== null && compareAmounts(alert.amount, "0") > 0 ? <Money value={alert.amount} kind="bodyS" style={{ color: fg }} /> : null}
        </Text>
      </Pressable>
      {total > 1 ? (
        <View style={styles.pager}>
          <Pressable accessibilityRole="button" accessibilityLabel={t.alertPrev} disabled={i === 0} onPress={() => setIndex(i - 1)} style={styles.pagerButton}>
            <Text style={{ color: fg, opacity: i === 0 ? 0.4 : 1 }}>‹</Text>
          </Pressable>
          <Text accessibilityLiveRegion="polite" style={[type.caption, { color: fg }]}>
            {t.alertOf(i + 1, total)}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t.alertNext} disabled={i === total - 1} onPress={() => setIndex(i + 1)} style={styles.pagerButton}>
            <Text style={{ color: fg, opacity: i === total - 1 ? 0.4 : 1 }}>›</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space[12] },
  section: { gap: space[8] },
  dim: { opacity: 0.55 },
  kpis: { flexDirection: "row", justifyContent: "space-between", gap: space[12] },
  kpiMain: { flexShrink: 1, minHeight: targetMin, gap: space[2] },
  kpiSide: { alignItems: "flex-end", gap: space[2] },
  bar: { height: 6, borderRadius: radius.full, flexDirection: "row", overflow: "hidden" },
  liquidity: { minHeight: targetMin, justifyContent: "center" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space[12], minHeight: 32 },
  rail: { gap: space[8] },
  railCard: { width: 156, borderWidth: 1, borderRadius: radius.sm, padding: space[12], gap: space[2] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[8] },
  tile: { width: "48.5%", minHeight: 64, borderWidth: 1, borderRadius: radius.sm, padding: space[8], gap: space[2], overflow: "hidden" },
  progressTrack: { height: 4, borderRadius: radius.full, overflow: "hidden", marginTop: space[2] },
  chips: { gap: space[8] },
  shortcut: { minHeight: targetMin, justifyContent: "center" },
  shortcutInner: { minHeight: targetMin, paddingHorizontal: space[16], borderRadius: radius.full, borderWidth: 1, justifyContent: "center" },
  alert: { minHeight: targetMin, borderRadius: radius.sm, paddingHorizontal: space[12], flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[8] },
  alertText: { flex: 1, minHeight: targetMin, justifyContent: "center" },
  pager: { flexDirection: "row", alignItems: "center" },
  pagerButton: { minWidth: 36, minHeight: targetMin, alignItems: "center", justifyContent: "center" },
});

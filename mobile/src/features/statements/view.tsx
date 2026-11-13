import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { formatDate, formatDayMonth, todayBogota } from "@core/dates";
import { formatCop, formatCopCompact, isZeroAmount, negateAmount } from "@core/money";
import { bars, defaultMonth, lastClosedByCard, monthName, monthShort, monthTitle, monthViews, payTargets, reducesDebt, sortedLines, timelineCards, type AmountMode, type MonthView, type Timeline, type TimelineLine } from "@core/statements";
import { paths } from "@/features/common/paths";
import { useResource } from "@/features/common/use-resource";
import { es } from "@/i18n/es";
import { radius, space, type } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";
import { Money } from "@/ui/money";
import { AppText, Button, Card, Chip, Notice, Screen, Title } from "@/ui/primitives";

const t = es.statements;

/**
 * «Extractos» (Android): los meses cerrados y proyectados de tus tarjetas. Solo lectura: lo calcula el servidor y aquí se elige qué mostrar.
 * Todo vive en memoria; la URL de la petición lleva solo un conteo de meses. Los proyectados se distinguen con borde discontinuo y la
 * palabra «estimado» (nunca solo con el color).
 */
export function StatementsScreen() {
  const router = useRouter();
  const timeline = useResource<Timeline>(paths.cardsTimeline);
  return (
    <Screen>
      <Title>{t.title}</Title>
      <Button label={t.back} kind="ghost" onPress={() => router.back()} />
      {timeline.loading && !timeline.data ? <AppText tone="secondary">{es.common.loading}</AppText> : null}
      {timeline.failure ? (
        <View style={{ gap: space[8] }}>
          <Notice>{t.loadFailed}</Notice>
          <Button label={t.retry} kind="secondary" onPress={timeline.reload} />
        </View>
      ) : null}
      {timeline.data ? <StatementsBody timeline={timeline.data} /> : null}
    </Screen>
  );
}

type Scope = "all" | "card";

export function StatementsBody({ timeline }: { timeline: Timeline }) {
  const today = todayBogota();
  const cards = useMemo(() => timelineCards(timeline), [timeline]);
  const [scope, setScope] = useState<Scope>("all");
  const [pickedCard, setPickedCard] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [mode, setMode] = useState<AmountMode>("minimum");
  const [chartOn, setChartOn] = useState(true);
  const [choosing, setChoosing] = useState(false);
  const [webOnly, setWebOnly] = useState(false);

  const cardId = scope === "card" ? (pickedCard ?? cards[0]?.card_id ?? null) : null;
  const views = useMemo(() => monthViews(timeline, cardId, today), [timeline, cardId, today]);
  const lastClosed = useMemo(() => lastClosedByCard(timeline, today), [timeline, today]);
  const month = (picked && views.some((v) => v.month === picked) ? picked : null) ?? defaultMonth(views, today);
  const view = views.find((v) => v.month === month) ?? null;

  if (cards.length === 0 || !view || !month) return <AppText tone="secondary">{t.empty}</AppText>;
  const estimated = view.estimated || !view.closed;
  const targets = payTargets(view, lastClosed, today, mode);

  return (
    <View style={{ gap: space[16] }}>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.pickMonth(monthTitle(month, "es"))} accessibilityState={{ expanded: choosing }} onPress={() => setChoosing((v) => !v)} style={[styles.pill, { minHeight: 44 }]}>
          <MonthChipText text={`${monthTitle(month, "es")} ⌄`} />
        </Pressable>
        <Chip label={t.chart} selected={chartOn} onPress={() => setChartOn((v) => !v)} />
      </View>
      {choosing ? (
        <View accessibilityLabel={t.month} style={{ gap: space[4] }}>
          {views.map((v) => (
            <Chip
              key={v.month}
              label={`${monthTitle(v.month, "es")}${v.estimated ? ` (${t.estimatedTag})` : ""}`}
              selected={v.month === month}
              onPress={() => {
                setPicked(v.month);
                setChoosing(false);
              }}
            />
          ))}
        </View>
      ) : null}

      <View accessibilityRole="radiogroup" accessibilityLabel={t.basis} style={styles.row}>
        <Chip label={t.basisMinimum} selected={mode === "minimum"} onPress={() => setMode("minimum")} />
        <Chip label={t.basisTotal} selected={mode === "total"} onPress={() => setMode("total")} />
      </View>

      {chartOn ? <BarChart views={views} month={month} mode={mode} onSelect={setPicked} /> : <MonthTable views={views} month={month} mode={mode} onSelect={setPicked} />}

      <View style={styles.row} accessibilityRole="tablist">
        <Chip label={t.tabAll} selected={scope === "all"} onPress={() => setScope("all")} />
        <Chip label={t.tabByCard} selected={scope === "card"} onPress={() => setScope("card")} />
      </View>
      {scope === "card" ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {cards.map((c) => (
            <Chip key={c.card_id} label={c.card_label} selected={c.card_id === cardId} onPress={() => setPickedCard(c.card_id)} />
          ))}
        </ScrollView>
      ) : null}

      <Card>
        <AppText tone="secondary">{estimated ? t.minimumEstimated : t.minimumClosed}</AppText>
        <Money value={view.minimum_due} kind="kpi" estimated={estimated} />
        {estimated ? (
          <AppText kind="caption" tone="secondary">
            {t.estimatedTag}
          </AppText>
        ) : null}
        <Fact label={t.totalDue} value={<Money value={view.total_due} estimated={estimated} />} />
        <Fact label={t.dueDate} value={<AppText>{view.due_date ? formatDate(view.due_date) : t.varies}</AppText>} />
        <Fact label={t.cutoff} value={<AppText>{view.cutoff ? formatDate(view.cutoff) : t.varies}</AppText>} />
        {isZeroAmount(view.paid_so_far) ? null : <Fact label={t.paidSoFar} value={<Money value={view.paid_so_far} />} />}
      </Card>

      {view.rate_assumed || view.cards.some((c) => c.rate_assumed) ? <Notice tone="secondary">{t.rateAssumed}</Notice> : null}
      {view.rate_outdated || view.cards.some((c) => c.rate_outdated) ? <Notice tone="secondary">{t.rateOutdated}</Notice> : null}

      <Button
        label={t.pay}
        disabled={targets.length === 0}
        onPress={() => {
          setWebOnly(true);
        }}
      />
      {targets.length === 0 ? <AppText kind="caption" tone="secondary">{t.payNothing}</AppText> : null}
      {webOnly ? <Notice tone="secondary">{es.more.webOnly}. {es.more.webOnlyBody}</Notice> : null}

      <AppText kind="titleS" accessibilityRole="header">
        {t.lines}
      </AppText>
      {view.lines.length === 0 ? <AppText tone="secondary">{t.noLines}</AppText> : null}
      {sortedLines(view.lines).map((line, index) => (
        <LineRow key={`${line.date}-${line.card_id}-${line.kind}-${index}`} line={line} showCard={cardId === null && view.cards.length > 1} />
      ))}
    </View>
  );
}

function MonthChipText({ text }: { text: string }) {
  const c = useTheme();
  return <Text style={[type.label, { color: c.textPrimary }]}>{text}</Text>;
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={styles.fact}>
      <AppText kind="bodyS" tone="secondary">
        {label}
      </AppText>
      {value}
    </View>
  );
}

function whatLabel(mode: AmountMode, estimated: boolean): string {
  const base = mode === "minimum" ? t.minimumLabel : t.totalLabel;
  return estimated ? t.estimatedPrefix(base) : base;
}

const BAR_AREA = 110;

function BarChart({ views, month, mode, onSelect }: { views: readonly MonthView[]; month: string; mode: AmountMode; onSelect: (month: string) => void }) {
  const c = useTheme();
  const items = bars(views, mode);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel={t.chartLabel} contentContainerStyle={{ gap: space[8], paddingVertical: space[4] }}>
      {items.map((bar) => {
        const selected = bar.month === month;
        return (
          <Pressable
            key={bar.month}
            accessibilityRole="button"
            accessibilityLabel={t.barLabel(monthName(bar.month, "es"), whatLabel(mode, bar.estimated), formatCop(bar.value))}
            accessibilityState={{ selected }}
            onPress={() => onSelect(bar.month)}
            style={[styles.bar, { borderColor: selected ? c.primary : "transparent", backgroundColor: selected ? c.primaryContainer : "transparent" }]}
          >
            <Text style={[type.caption, { color: c.textSecondary }]}>{formatCopCompact(bar.value)}</Text>
            <View style={{ height: BAR_AREA, justifyContent: "flex-end", alignSelf: "stretch" }}>
              <View
                testID={`bar-${bar.month}`}
                style={{
                  height: (BAR_AREA * bar.percent) / 100,
                  backgroundColor: bar.estimated ? "transparent" : selected ? c.primary : c.textTertiary,
                  borderColor: selected ? c.primary : c.textTertiary,
                  borderWidth: 2,
                  borderStyle: bar.estimated ? "dashed" : "solid",
                  borderTopLeftRadius: radius.xs,
                  borderTopRightRadius: radius.xs,
                }}
              />
            </View>
            <Text style={[type.label, { color: c.textPrimary }]}>{monthShort(bar.month, "es")}</Text>
            <Text style={[type.caption, { color: c.textSecondary, fontStyle: "italic" }]}>{bar.estimated ? t.estimatedTag : " "}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function MonthTable({ views, month, mode, onSelect }: { views: readonly MonthView[]; month: string; mode: AmountMode; onSelect: (month: string) => void }) {
  return (
    <View accessibilityLabel={t.chartLabel} style={{ gap: space[4] }}>
      {views.map((v) => (
        <Pressable key={v.month} accessibilityRole="button" accessibilityState={{ selected: v.month === month }} accessibilityLabel={t.barLabel(monthName(v.month, "es"), whatLabel(mode, v.estimated), formatCop(mode === "minimum" ? v.minimum_due : v.total_due))} onPress={() => onSelect(v.month)} style={styles.tableRow}>
          <AppText>{monthName(v.month, "es")}</AppText>
          <AppText kind="caption" tone="secondary">
            {v.estimated ? t.estimatedTag : t.closedTag}
          </AppText>
          <Money value={mode === "minimum" ? v.minimum_due : v.total_due} estimated={v.estimated} />
        </Pressable>
      ))}
    </View>
  );
}

function LineRow({ line, showCard }: { line: TimelineLine; showCard: boolean }) {
  const [open, setOpen] = useState(false);
  const title = line.description?.trim() || t.kinds[line.kind] || line.kind;
  const amount = reducesDebt(line) ? negateAmount(line.amount) : line.amount;
  const hasDetail = line.capital !== null || line.interest !== null || line.purchase_date !== null || showCard;
  return (
    <Card>
      <View style={styles.lineHead}>
        <AppText kind="label" tone="secondary" style={{ minWidth: 48 }}>
          {formatDayMonth(line.date).toUpperCase()}
        </AppText>
        <View style={{ flex: 1 }}>
          <AppText>{title}</AppText>
          <AppText kind="caption" tone="secondary">
            {line.installment_number !== null && line.installment_total !== null ? t.installmentOf(line.installment_number, line.installment_total) : t.kinds[line.kind]}
            {line.estimated ? ` · ${t.estimatedTag}` : ""}
          </AppText>
        </View>
        <Money value={amount} estimated={line.estimated} tone={reducesDebt(line) ? "positive" : "primary"} />
      </View>
      {hasDetail ? <Button label={open ? t.hideDetail : t.detail} kind="ghost" onPress={() => setOpen((v) => !v)} /> : null}
      {open ? (
        <View style={{ gap: space[4] }}>
          {showCard ? <Fact label={t.card} value={<AppText>{line.card_label}</AppText>} /> : null}
          {line.capital !== null ? <Fact label={t.capital} value={<Money value={line.capital} />} /> : null}
          {line.interest !== null ? <Fact label={t.interest} value={<Money value={line.interest} />} /> : null}
          {line.purchase_date !== null ? <Fact label={t.purchaseDate} value={<AppText>{formatDate(line.purchase_date)}</AppText>} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space[8], alignItems: "center" },
  pill: { paddingHorizontal: space[16], borderRadius: radius.full, borderWidth: 1, borderColor: "#8a867a", justifyContent: "center" },
  fact: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space[8], minHeight: 28 },
  bar: { width: 64, alignItems: "center", gap: space[4], padding: space[4], borderWidth: 2, borderRadius: radius.md },
  tableRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space[8], minHeight: 44 },
  lineHead: { flexDirection: "row", gap: space[8], alignItems: "flex-start" },
});

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Card, Timeline, TimelineLine } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate, formatDayMonth, todayBogota } from "@/lib/dates";
import { formatCop, formatCopCompact, isZeroAmount, negateAmount } from "@/lib/money";
import { bars, defaultMonth, lastClosedByCard, monthName, monthShort, monthTitle, monthViews, parseMonthParam, payTargets, reducesDebt, sortedLines, timelineCards, type AmountMode, type MonthView, type PayTarget } from "@/lib/statements";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { useHref, useResource } from "../hooks";
import { Badge, Banner, DefinitionList, Empty, ErrorState, Loading, Money, ScreenHeader, Section, Segmented, Tabs } from "../kit";
import { setPayPrefill } from "./pay-prefill";

/** «Extractos» de todas tus tarjetas (`/cuentas/credito/extractos`). */
export function StatementsScreen() {
  const { dict } = useI18n();
  const href = useHref();
  const timeline = useResource<Timeline>(paths.cardsTimeline());
  const back = { href: href("cuentas-credito"), label: dict.screens["cuentas-credito"] };
  return (
    <div className="screen">
      <ScreenHeader title={dict.fin.stm.title} back={back} />
      <p className="muted">{dict.fin.stm.intro}</p>
      {timeline.loading && !timeline.data && <Loading />}
      {timeline.failure && <ErrorState message={dict.fin.stm.loadError} onRetry={timeline.reload} />}
      {timeline.data && <StatementsView timeline={timeline.data} fixedCardId={null} />}
    </div>
  );
}

/** «Extractos» de una tarjeta (`/tarjetas/[id]/extractos`). */
export function CardStatementsScreen({ id }: { id: string }) {
  const { dict } = useI18n();
  const href = useHref();
  const card = useResource<Card>(paths.card(id));
  const timeline = useResource<Timeline>(paths.cardTimeline(id));
  const back = { href: href("tarjeta", [id]), label: card.data?.name ?? dict.screens.tarjeta };
  return (
    <div className="screen">
      <ScreenHeader title={dict.fin.stm.title} eyebrow={card.data?.name} back={back} />
      {timeline.loading && !timeline.data && <Loading />}
      {timeline.failure && <ErrorState message={timeline.failure.status === 404 ? dict.fin.errors.notFound : dict.fin.stm.loadError} onRetry={timeline.reload} />}
      {timeline.data && <StatementsView timeline={timeline.data} fixedCardId={id} />}
    </div>
  );
}

type Scope = "all" | "card";

export function StatementsView({ timeline, fixedCardId }: { timeline: Timeline; fixedCardId: string | null }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.stm;
  const search = useSearchParams();
  const today = todayBogota();
  const cards = useMemo(() => timelineCards(timeline), [timeline]);
  const [scope, setScope] = useState<Scope>("all");
  const [pickedCard, setPickedCard] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(() => parseMonthParam(search.get("mes")));
  const [mode, setMode] = useState<AmountMode>("minimum");
  const [chartOn, setChartOn] = useState(true);

  const cardId = fixedCardId ?? (scope === "card" ? (pickedCard ?? cards[0]?.card_id ?? null) : null);
  const views = useMemo(() => monthViews(timeline, cardId, today), [timeline, cardId, today]);
  const lastClosed = useMemo(() => lastClosedByCard(timeline, today), [timeline, today]);
  const month = (picked && views.some((v) => v.month === picked) ? picked : null) ?? defaultMonth(views, today);
  const view = views.find((v) => v.month === month) ?? null;

  function choose(next: string) {
    setPicked(next);
    // Solo el mes (AAAA-MM) viaja en la URL; el estado de Next la sincroniza con `useSearchParams`.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("mes", next);
      window.history.replaceState(null, "", url);
    } catch {
      /* sin historial (pruebas): el estado basta */
    }
  }

  if (views.length === 0 || !view || !month) {
    return <Empty icon="card" title={cards.length === 0 ? t.noCards : t.emptyTitle} body={cards.length === 0 ? t.noCardsBody : t.emptyBody} />;
  }

  const body = (
    <div className="stm">
      <div className="stm__controls">
        <label className="stm-chip">
          <span className="visually-hidden">{t.month}</span>
          <select className="stm-chip__select" value={month} onChange={(event) => choose(event.target.value)}>
            {views.map((v) => (
              <option key={v.month} value={v.month}>
                {monthTitle(v.month, locale)}
                {v.estimated ? ` (${t.estimatedTag})` : ""}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="stm-toggle" aria-pressed={chartOn} onClick={() => setChartOn((v) => !v)}>
          {t.chart}
        </button>
      </div>

      <Segmented legend={t.basis} variant="chips" value={mode} onChange={(v) => setMode(v as AmountMode)} options={[{ value: "minimum", label: t.basisMinimum }, { value: "total", label: t.basisTotal }]} />

      {chartOn ? <BarChart views={views} month={month} mode={mode} onSelect={choose} /> : <MonthTable views={views} month={month} mode={mode} onSelect={choose} />}

      <MonthSummary view={view} />
      <RateNotices view={view} fixedCardId={fixedCardId} />
      <PayAction view={view} lastClosed={lastClosed} today={today} mode={mode} />
      <LinesList view={view} showCard={cardId === null && view.cards.length > 1} />
    </div>
  );

  if (fixedCardId !== null) return body;
  return (
    <Tabs
      label={t.tabs}
      tabs={[{ value: "all", label: t.tabAll }, { value: "card", label: t.tabByCard }]}
      value={scope}
      onChange={(v) => setScope(v as Scope)}
    >
      {scope === "card" && cards.length > 0 && (
        <Segmented legend={t.pickCard} variant="chips" value={cardId ?? ""} onChange={setPickedCard} options={cards.map((c) => ({ value: c.card_id, label: c.card_label }))} />
      )}
      {body}
    </Tabs>
  );
}

function barLabel(dictT: ReturnType<typeof useI18n>["dict"]["fin"]["stm"], mode: AmountMode, estimated: boolean): string {
  if (mode === "minimum") return estimated ? dictT.barLabelMinimumEstimated : dictT.barLabelMinimum;
  return estimated ? dictT.barLabelTotalEstimated : dictT.barLabelTotal;
}

/** Barras horizontales (desplazables dentro de su caja: la página no se desplaza). Cada barra es un botón; las estimadas llevan rayas Y la palabra «estimado». */
function BarChart({ views, month, mode, onSelect }: { views: readonly MonthView[]; month: string; mode: AmountMode; onSelect: (month: string) => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.stm;
  const items = bars(views, mode);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    refs.current[month]?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [month]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const last = items.length - 1;
    const next = event.key === "ArrowRight" ? Math.min(index + 1, last) : event.key === "ArrowLeft" ? Math.max(index - 1, 0) : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (next === null) return;
    event.preventDefault();
    onSelect(items[next].month);
    refs.current[items[next].month]?.focus();
  }

  return (
    <div className="stm-chart" role="group" aria-label={t.chartLabel} aria-describedby="stm-chart-help">
      <p id="stm-chart-help" className="visually-hidden">
        {t.chartHelp}
      </p>
      <div className="stm-chart__track">
        {items.map((bar, index) => {
          const selected = bar.month === month;
          const label = `${monthName(bar.month, locale)}, ${barLabel(t, mode, bar.estimated)} ${formatCop(bar.value)}`;
          return (
            <button
              key={bar.month}
              type="button"
              ref={(node) => {
                refs.current[bar.month] = node;
              }}
              className={`stm-bar${selected ? " stm-bar--selected" : ""}${bar.estimated ? " stm-bar--estimated" : ""}`}
              aria-pressed={selected}
              aria-label={label}
              tabIndex={selected ? 0 : -1}
              data-month={bar.month}
              data-estimated={bar.estimated ? "true" : "false"}
              onClick={() => onSelect(bar.month)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <span className="stm-bar__value tabular" aria-hidden="true">
                {formatCopCompact(bar.value)}
              </span>
              <span className="stm-bar__well" aria-hidden="true">
                <span className="stm-bar__fill" style={{ height: `${bar.percent}%` }} />
              </span>
              <span className="stm-bar__month" aria-hidden="true">
                {monthShort(bar.month, locale)}
              </span>
              <span className="stm-bar__tag" aria-hidden="true">
                {bar.estimated ? t.estimatedTag : " "}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** La alternativa en tabla de la gráfica: misma información, filas seleccionables. */
function MonthTable({ views, month, mode, onSelect }: { views: readonly MonthView[]; month: string; mode: AmountMode; onSelect: (month: string) => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.stm;
  return (
    <div className="table-wrap">
      <table className="table" aria-label={t.tableLabel}>
        <thead>
          <tr>
            <th scope="col">{t.tableMonth}</th>
            <th scope="col">{t.tableState}</th>
            <th scope="col" className="table__num">{mode === "minimum" ? t.basisMinimum : t.basisTotal}</th>
          </tr>
        </thead>
        <tbody>
          {views.map((v) => (
            <tr key={v.month} aria-selected={v.month === month}>
              <th scope="row">
                <button type="button" className="stm-link" aria-pressed={v.month === month} onClick={() => onSelect(v.month)}>
                  {monthName(v.month, locale)}
                </button>
              </th>
              <td>{v.estimated ? t.estimatedTag : t.closedTag}</td>
              <td className="table__num">
                <Money value={mode === "minimum" ? v.minimum_due : v.total_due} estimated={v.estimated} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthSummary({ view }: { view: MonthView }) {
  const { dict } = useI18n();
  const t = dict.fin.stm;
  const estimated = view.estimated || !view.closed;
  return (
    <section className="fin-card stm-summary" aria-label={estimated ? t.minimumEstimated : t.minimumClosed}>
      <p className="muted">{estimated ? t.minimumEstimated : t.minimumClosed}</p>
      <p className="fin-big stm-summary__amount" data-testid="stm-minimum">
        <Money value={view.minimum_due} estimated={estimated} />
        {estimated && <Badge dashed>{t.estimatedTag}</Badge>}
      </p>
      <DefinitionList
        rows={[
          { label: t.totalDue, value: <Money value={view.total_due} estimated={estimated} /> },
          { label: t.dueDate, value: view.due_date ? formatDate(view.due_date) : t.differentDates },
          { label: t.cutoff, value: view.cutoff ? formatDate(view.cutoff) : t.differentDates },
          ...(isZeroAmount(view.paid_so_far) ? [] : [{ label: t.paidSoFar, value: <Money value={view.paid_so_far} /> }]),
        ]}
      />
    </section>
  );
}

function RateNotices({ view, fixedCardId }: { view: MonthView; fixedCardId: string | null }) {
  const { dict } = useI18n();
  const t = dict.fin.stm;
  const href = useHref();
  const flagged = view.cards.filter((card) => card.rate_assumed || card.rate_outdated);
  if (!view.rate_assumed && !view.rate_outdated && flagged.length === 0) return null;
  return (
    <Banner tone="warning">
      {(view.rate_assumed || flagged.some((c) => c.rate_assumed)) && <p>{t.rateAssumed}</p>}
      {(view.rate_outdated || flagged.some((c) => c.rate_outdated)) && <p>{t.rateOutdated}</p>}
      <p>
        {flagged.map((card, index) => (
          <span key={card.card_id}>
            {index > 0 ? " · " : ""}
            <Link href={href("tarjeta-tasas", [card.card_id])}>{flagged.length > 1 || fixedCardId === null ? `${t.updateRates}: ${card.card_label}` : t.updateRates}</Link>
          </span>
        ))}
      </p>
    </Banner>
  );
}

function PayAction({ view, lastClosed, today, mode }: { view: MonthView; lastClosed: ReadonlyMap<string, string>; today: string; mode: AmountMode }) {
  const { dict } = useI18n();
  const t = dict.fin.stm;
  const href = useHref();
  const [choosing, setChoosing] = useState(false);
  const targets = payTargets(view, lastClosed, today, mode);

  const remember = (target: PayTarget) => setPayPrefill({ cardId: target.card_id, kind: target.plan.kind, amount: target.plan.amount, month: view.month });

  if (targets.length === 0) {
    return (
      <div className="actions">
        <button type="button" className="button button--primary" disabled>
          {t.pay}
        </button>
        <p className="hint">{t.payNothing}</p>
      </div>
    );
  }
  if (targets.length === 1) {
    const target = targets[0];
    return (
      <div className="actions">
        <Link className="button button--primary" href={href("tarjeta-pagar", [target.card_id])} onClick={() => remember(target)}>
          {t.pay}
        </Link>
      </div>
    );
  }
  return (
    <div className="stm-pay">
      <button type="button" className="button button--primary" aria-expanded={choosing} onClick={() => setChoosing((v) => !v)}>
        {t.pay}
      </button>
      {choosing && (
        <ul className="fin-list" aria-label={t.payChoose}>
          {targets.map((target) => (
            <li key={target.card_id}>
              <Link className="fin-row" href={href("tarjeta-pagar", [target.card_id])} onClick={() => remember(target)}>
                <span className="fin-row__main">
                  <span className="fin-row__title">{fill(t.payTo, { card: target.card_label })}</span>
                  {target.plan.amount !== null && (
                    <span className="fin-row__sub muted">
                      <Money value={target.plan.amount} estimated />
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LinesList({ view, showCard }: { view: MonthView; showCard: boolean }) {
  const { dict } = useI18n();
  const t = dict.fin.stm;
  const lines = sortedLines(view.lines);
  return (
    <Section title={t.lines}>
      {lines.length === 0 ? (
        <p className="muted">{t.noLines}</p>
      ) : (
        <ul className="fin-list">
          {lines.map((line, index) => (
            <LineRow key={`${line.date}-${line.card_id}-${line.kind}-${index}`} line={line} showCard={showCard} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function LineRow({ line, showCard }: { line: TimelineLine; showCard: boolean }) {
  const { dict } = useI18n();
  const t = dict.fin.stm;
  const [open, setOpen] = useState(false);
  const detailId = `stm-line-${line.card_id}-${line.date}-${line.kind}-${line.installment_number ?? 0}`;
  const title = line.description?.trim() || t.kinds[line.kind] || line.kind;
  const amount = reducesDebt(line) ? negateAmount(line.amount) : line.amount;
  const hasDetail = line.capital !== null || line.interest !== null || line.purchase_date !== null || showCard;
  return (
    <li className="fin-row stm-line">
      <span className="stm-line__date tabular">{formatDayMonth(line.date).toUpperCase()}</span>
      <span className="fin-row__main">
        <span className="fin-row__title">{title}</span>
        <span className="fin-row__sub muted">
          {line.installment_number !== null && line.installment_total !== null ? fill(t.installmentOf, { n: String(line.installment_number), total: String(line.installment_total) }) : t.kinds[line.kind]}
          {line.estimated ? ` · ${t.estimatedLine}` : ""}
        </span>
        {hasDetail && (
          <>
            <button type="button" className="stm-link" aria-expanded={open} aria-controls={open ? detailId : undefined} onClick={() => setOpen((v) => !v)}>
              {open ? t.hideDetail : t.detail}
            </button>
            {open && (
              <div id={detailId}>
              <DefinitionList
                rows={[
                  ...(showCard ? [{ label: t.card, value: line.card_label }] : []),
                  ...(line.capital !== null ? [{ label: t.capital, value: <Money value={line.capital} estimated={line.estimated} /> }] : []),
                  ...(line.interest !== null ? [{ label: t.interest, value: <Money value={line.interest} estimated={line.estimated} /> }] : []),
                  ...(line.purchase_date !== null ? [{ label: t.purchaseDate, value: formatDate(line.purchase_date) }] : []),
                ]}
              />
              </div>
            )}
          </>
        )}
      </span>
      <span className="fin-row__amount">
        <Money value={amount} estimated={line.estimated} tone={reducesDebt(line) ? "positive" : undefined} />
      </span>
    </li>
  );
}

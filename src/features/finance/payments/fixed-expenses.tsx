"use client";

import Link from "next/link";
import { useState } from "react";
import type { FixedExpenses, Occurrence } from "@/api/models";
import { paths } from "@/api/paths";
import { compareAmounts } from "@/lib/money";
import { daysBetween, formatDate, formatPeriod, periodOf, shiftPeriod, todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { fill, relativeDays } from "../helpers";
import { useHref, useResource } from "../hooks";
import { Badge, Empty, ErrorState, Loading, Money, Progress, ScreenHeader, Section } from "../kit";

/** Gastos fijos del mes (`/pagos/fijos`, diseño §3.4): atrasados, por pagar, pagados, omitidos y los que no tocan este mes. */
export function FixedExpensesScreen() {
  const { dict, locale } = useI18n();
  const t = dict.fin.fixed;
  const href = useHref();
  const [period, setPeriod] = useState(() => periodOf(todayBogota()));
  const data = useResource<FixedExpenses>(paths.fixedExpenses(period));
  const f = data.data;
  const total = f ? f.overdue.length + f.to_pay.length + f.paid.length + f.skipped.length : 0;

  return (
    <div className="screen">
      <ScreenHeader
        title={dict.screens["pagos-fijos"]}
        eyebrow={dict.nav.sections.pagos}
        actions={
          <Link className="button button--primary" href={href("pagos-recurrencia-nueva")}>
            <Icon name="plus" size={20} />
            {t.add}
          </Link>
        }
      />
      <div className="fin-periodbar">
        <button type="button" className="icon-button" aria-label={dict.fin.movements.previousPeriod} onClick={() => setPeriod(shiftPeriod(period, -1))}>
          <Icon name="arrow-left" />
        </button>
        <p className="title-s" aria-live="polite">
          {formatPeriod(period, locale)}
        </p>
        <button type="button" className="icon-button" aria-label={dict.fin.movements.nextPeriod} onClick={() => setPeriod(shiftPeriod(period, 1))}>
          <Icon name="arrow-right" />
        </button>
      </div>
      <p className="muted">
        <Link href={href("pagos-suscripciones")}>{dict.screens["pagos-suscripciones"]}</Link>
      </p>

      {data.loading && !f && <Loading />}
      {data.failure && <ErrorState message={dict.fin.errors.generic} onRetry={data.reload} />}
      {f && total === 0 && f.not_this_month.length === 0 && (
        <Empty
          icon="calendar-check"
          title={t.emptyTitle}
          body={t.emptyBody}
          action={
            <Link className="button button--primary" href={href("pagos-recurrencia-nueva")}>
              {t.add}
            </Link>
          }
        />
      )}
      {f && total > 0 && (
        <section className="fin-card" aria-label={t.progress}>
          <p>
            {t.paidOf} <Money value={f.progress.paid} /> {t.of} <Money value={f.progress.total} />
          </p>
          <Progress percent={f.progress.percent} label={`${t.progress}: ${f.progress.percent}%`} tone="positive" />
          <p className="muted">{f.progress.percent}%</p>
        </section>
      )}
      {f && f.overdue.length > 0 && (
        <Section title={t.overdue}>
          <OccurrenceList items={f.overdue} />
        </Section>
      )}
      {f && f.to_pay.length > 0 && (
        <Section title={t.toPay}>
          <OccurrenceList items={f.to_pay} />
        </Section>
      )}
      {f && f.paid.length > 0 && (
        <Section title={t.paid}>
          <OccurrenceList items={f.paid} />
        </Section>
      )}
      {f && f.skipped.length > 0 && (
        <Section title={t.skipped}>
          <OccurrenceList items={f.skipped} />
        </Section>
      )}
      {f && f.not_this_month.length > 0 && (
        <Section title={t.notThisMonth}>
          <ul className="fin-list">
            {f.not_this_month.map((r) => (
              <li key={r.id}>
                <Link href={href("pagos-recurrencia", [r.id])} className="fin-row">
                  <span className="fin-row__main">
                    <span className="fin-row__title">{r.name}</span>
                    <span className="fin-row__sub muted">{dict.fin.frequencies[r.frequency] ?? r.frequency}</span>
                  </span>
                  <Icon name="chevron-right" size={20} />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export function OccurrenceList({ items }: { items: readonly Occurrence[] }) {
  return (
    <ul className="fin-list">
      {items.map((occurrence) => (
        <li key={occurrence.id}>
          <OccurrenceRow occurrence={occurrence} />
        </li>
      ))}
    </ul>
  );
}

export function OccurrenceRow({ occurrence: o }: { occurrence: Occurrence }) {
  const { dict } = useI18n();
  const t = dict.fin.fixed;
  const href = useHref();
  const today = todayBogota();
  const open = o.status === "open";
  const partial = open && compareAmounts(o.paid, "0") > 0;
  return (
    <div className="fin-row fin-row--static">
      <Link href={href("pagos-recurrencia", [o.recurrence_id])} className="fin-row__main fin-row__link">
        <span className="fin-row__title">{o.name}</span>
        <span className="fin-row__sub muted">
          {partial ? (
            <>
              <Money value={o.paid} /> {t.of} <Money value={o.expected} estimated={o.estimated} />
            </>
          ) : (
            <Money value={o.expected} estimated={o.estimated} />
          )}
          {o.estimated ? ` (${t.estimated})` : ""}
          {" · "}
          {o.status === "paid" ? formatDate(o.adjusted_date) : o.overdue ? fill(t.overdueSince, { date: formatDate(o.adjusted_date) }) : `${formatDate(o.adjusted_date)} (${relativeDays(daysBetween(today, o.adjusted_date), dict.fin.relative)})`}
          {o.moved ? ` · ${t.movedFrom} ${formatDate(o.due_date)}` : ""}
        </span>
        {partial && (
          <>
            <Progress percent={o.percent} label={`${o.name}: ${o.percent}%`} tone="positive" />
            <span className="fin-row__sub muted">
              {t.remaining} <Money value={o.pending} />
            </span>
          </>
        )}
        {o.status === "skipped" && o.skip_reason && <span className="fin-row__sub muted">{o.skip_reason}</span>}
        <span className="fin-row__badges">
          {o.overdue && <Badge tone="negative">{t.overdueBadge}</Badge>}
          {o.status === "paid" && <Badge tone="positive">{t.paidBadge}</Badge>}
          {o.status === "skipped" && <Badge>{t.skippedBadge}</Badge>}
        </span>
      </Link>
      {open && (
        <Link className="button button--primary" href={href("pagos-fijo-pagar", [o.id])}>
          {t.pay}
          <span className="visually-hidden"> {o.name}</span>
        </Link>
      )}
    </div>
  );
}

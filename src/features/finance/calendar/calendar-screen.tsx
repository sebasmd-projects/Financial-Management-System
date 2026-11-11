"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Account, Calendar, CalendarDay, CalendarItem } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate, formatDateLong, formatPeriod, periodOf, todayBogota } from "@/lib/dates";
import { compareAmounts, isNegativeAmount } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { fill } from "../helpers";
import { useAll, useHref, useResource } from "../hooks";
import { Badge, Empty, ErrorState, Loading, Money, ScreenHeader, Section, Segmented, Slots } from "../kit";
import { AmountOrPending, IndexNoticeBanner } from "../uvr/pending";
import { calendarQuery, dayDots, itemTarget, modeFromParams, monthGrid, NAVIGABLE, shiftAnchor, type CalendarMode, MODES } from "./logic";

/** Calendario financiero (`/pagos/calendario`, diseño §3.11): mes, semana, día, próximos 7/15/30 y vencidos. */
export function CalendarScreen() {
  const { dict, locale } = useI18n();
  const t = dict.fin.cal;
  const href = useHref();
  const params = useSearchParams();
  const today = todayBogota();
  const [mode, setMode] = useState<CalendarMode>(() => modeFromParams(params.get("rango"), params.get("vista")));
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState<string | null>(null);
  const calendar = useResource<Calendar>(paths.calendar(calendarQuery(mode, anchor)));
  const accounts = useAll<Account>(paths.accounts());
  const data = calendar.data;
  const names = new Map(accounts.items.map((a) => [a.id, a.name]));
  const overdueCount = data?.overdue.items.length ?? 0;

  const label =
    data === null
      ? ""
      : mode === "month"
        ? formatPeriod(periodOf(anchor), locale)
        : mode === "week"
          ? `${formatDate(data.start)} – ${formatDate(data.end)}`
          : mode === "day"
            ? formatDateLong(anchor, locale)
            : "";

  return (
    <div className="screen calendar">
      <ScreenHeader title={dict.screens["pagos-calendario"]} eyebrow={dict.nav.sections.pagos} back={{ href: href("pagos"), label: dict.nav.sections.pagos }} />
      <Segmented
        legend={t.modesLabel}
        hideLegend
        variant="chips"
        options={MODES.map((m) => ({ value: m, label: m === "overdue" && overdueCount > 0 ? `${t.modes[m]} (${overdueCount})` : t.modes[m] }))}
        value={mode}
        onChange={(v) => {
          setMode(v as CalendarMode);
          setSelected(null);
        }}
      />
      {NAVIGABLE.has(mode) && (
        <div className="fin-periodbar">
          <button type="button" className="icon-button" aria-label={t.prev} onClick={() => { setAnchor(shiftAnchor(mode, anchor, -1)); setSelected(null); }}>
            <Icon name="arrow-left" />
          </button>
          <p className="title-s" aria-live="polite">
            {label}
          </p>
          <button type="button" className="icon-button" aria-label={t.next} onClick={() => { setAnchor(shiftAnchor(mode, anchor, 1)); setSelected(null); }}>
            <Icon name="arrow-right" />
          </button>
          {anchor !== today && (
            <button type="button" className="button button--ghost" onClick={() => { setAnchor(today); setSelected(null); }}>
              {t.today}
            </button>
          )}
        </div>
      )}

      {calendar.loading && !data && <Loading />}
      {calendar.failure && <ErrorState message={t.loadError} onRetry={calendar.reload} />}
      {data && <IndexNoticeBanner notices={data.notices} />}
      {data && mode === "overdue" && <Overdue calendar={data} />}
      {data && mode === "month" && <Month calendar={data} today={today} selected={selected ?? (periodOf(today) === periodOf(data.start) ? today : data.start)} onSelect={setSelected} names={names} />}
      {data && mode !== "month" && mode !== "overdue" && <DayList calendar={data} mode={mode} names={names} />}
    </div>
  );
}

function dayLabel(day: CalendarDay | null, date: string, t: ReturnType<typeof useI18n>["dict"]["fin"]["cal"]): string {
  const n = day?.items.length ?? 0;
  const count = n === 1 ? t.dayCountOne : fill(t.dayCount, { n: String(n) });
  return `${fill(t.seeDay, { date: formatDate(date) })}${n > 0 ? `, ${count}` : ""}${day?.holiday ? `, ${fill(t.holiday, { name: day.holiday })}` : ""}${day?.negative ? `, ${t.negativeDay}` : ""}`;
}

function Month({ calendar, today, selected, onSelect, names }: { calendar: Calendar; today: string; selected: string; onSelect: (date: string) => void; names: Map<string, string> }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.cal;
  const weeks = monthGrid(calendar.start, calendar.end, calendar.days);
  const selectedDay = calendar.days.find((d) => d.date === selected) ?? null;
  const total = calendar.days.reduce((n, d) => n + d.items.length, 0);
  return (
    <>
      <table className="calendar__grid">
        <thead>
          <tr>
            {t.weekdaysShort.map((short, index) => (
              <th key={index} scope="col" abbr={dict.fin.weekdays[index]}>
                <span aria-hidden="true">{short}</span>
                <span className="visually-hidden">{dict.fin.weekdays[index]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, row) => (
            <tr key={row}>
              {week.map((cell, col) =>
                cell === null ? (
                  <td key={col} className="calendar__cell calendar__cell--empty" />
                ) : (
                  <td key={cell.date} className="calendar__cell">
                    <button
                      type="button"
                      className={`calendar__day${cell.date === selected ? " calendar__day--selected" : ""}${cell.date === today ? " calendar__day--today" : ""}${cell.day?.negative ? " calendar__day--negative" : ""}`}
                      aria-pressed={cell.date === selected}
                      aria-label={dayLabel(cell.day, cell.date, t)}
                      onClick={() => onSelect(cell.date)}
                    >
                      <span className="calendar__num" aria-hidden="true">
                        {+cell.date.slice(8)}
                        {cell.day?.holiday ? <span className="calendar__holiday"> {t.holidayShort}</span> : null}
                      </span>
                      {cell.day && cell.day.items.length > 0 && <Dots day={cell.day} />}
                    </button>
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">{t.legend}</p>
      {total === 0 && <p className="muted">{t.emptyRange}</p>}
      <Section title={formatDateLong(selected, locale)}>
        <DayDetail day={selectedDay} date={selected} names={names} />
      </Section>
    </>
  );
}

function Dots({ day }: { day: CalendarDay }) {
  const { dict } = useI18n();
  const dots = dayDots(day.items);
  return (
    <span className="calendar__dots" aria-hidden="true">
      {dots.shown.map((direction, index) => (
        <span key={index} className={`calendar__dot calendar__dot--${direction}`} title={dict.fin.cal.dot[direction]} />
      ))}
      {dots.more > 0 && <span className="calendar__more">+{dots.more}</span>}
    </span>
  );
}

function DayList({ calendar, mode, names }: { calendar: Calendar; mode: CalendarMode; names: Map<string, string> }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.cal;
  const days = calendar.days.filter((d) => d.items.length > 0 || d.holiday !== null || mode === "day");
  const empty = calendar.days.every((d) => d.items.length === 0);
  return (
    <>
      {empty && <Empty icon="calendar-check" title={mode === "day" ? t.emptyDay : t.emptyRange} />}
      {(!empty || mode === "day") &&
        days.map((day) => (
          <Section key={day.date} title={formatDateLong(day.date, locale)}>
            <DayDetail day={day} date={day.date} names={names} />
          </Section>
        ))}
    </>
  );
}

function DayDetail({ day, date, names }: { day: CalendarDay | null; date: string; names: Map<string, string> }) {
  const { dict } = useI18n();
  const t = dict.fin.cal;
  if (day === null || (day.items.length === 0 && day.holiday === null)) return <p className="muted">{t.emptyDay}</p>;
  return (
    <div className="calendar__detail">
      {day.holiday && (
        <p>
          <Badge tone="info">{t.holidayShort}</Badge> {fill(t.holiday, { name: day.holiday })}
        </p>
      )}
      {compareAmounts(day.needed, "0") > 0 && (
        <p className="calendar__needed">
          <Slots template={t.needed} vars={{ amount: <Money value={day.needed} /> }} />
        </p>
      )}
      {day.balance_before !== null && day.balance_after !== null && (
        <p className={`muted${day.negative ? " calendar__negative" : ""}`}>
          <Slots template={t.balance} vars={{ before: <Money value={day.balance_before} />, after: <Money value={day.balance_after} /> }} />
          {day.negative && <> · {t.negativeDay}</>}
        </p>
      )}
      {compareAmounts(day.expected_income, "0") > 0 && (
        <p className="muted">
          <Slots template={t.expectedIncome} vars={{ amount: <Money value={day.expected_income} /> }} />
        </p>
      )}
      <ul className="fin-list" data-date={date}>
        {day.items.map((item, index) => (
          <li key={`${item.ref_kind}-${item.ref_id}-${index}`}>
            <ItemRow item={item} accountName={item.account_id ? (names.get(item.account_id) ?? null) : null} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemRow({ item, accountName }: { item: CalendarItem; accountName: string | null }) {
  const { dict } = useI18n();
  const t = dict.fin.cal;
  const href = useHref();
  const target = itemTarget(item);
  const canPay = item.direction === "out" && item.kind !== "card_cut";
  return (
    <div className="fin-row fin-row--static">
      <div className="fin-row__main">
        <span className="fin-row__title">{item.name}</span>
        <span className="fin-row__sub muted">
          {t.kinds[item.kind] ?? item.kind}
          {accountName ? ` · ${accountName}` : ""}
          {item.estimated ? ` · ${t.estimated}` : ""}
        </span>
        {item.original_date && item.moved_reason && <span className="fin-row__sub muted">{fill(item.moved_reason === "holiday" ? t.movedHoliday : t.movedWeekend, { date: formatDate(item.original_date) })}</span>}
        {item.direction !== "info" && (
          <span className="fin-row__sub muted">
            <Slots template={t.afterThis} vars={{ amount: <Money value={item.balance_after} tone={isNegativeAmount(item.balance_after) ? "negative" : undefined} /> }} />
          </span>
        )}
        {item.shortfall && compareAmounts(item.shortfall, "0") > 0 && (
          <span className="fin-row__sub calendar__shortfall" role="status">
            <Icon name="alert" size={16} /> <Slots template={t.shortfall} vars={{ amount: <Money value={item.shortfall} /> }} />
            {accountName ? ` · ${accountName}` : ""}{" "}
            <Link href={`${href("movimiento-nuevo")}?tipo=transferencia${item.account_id ? `&hasta=${encodeURIComponent(item.account_id)}` : ""}`}>{t.transfer}</Link>
          </span>
        )}
        {item.overdue && <Badge tone="negative">{dict.fin.fixed.overdueBadge}</Badge>}
      </div>
      <div className="fin-row__amount">
        <AmountOrPending value={item.amount} sign={item.direction === "in" ? "always" : "auto"} kind={item.direction === "in" ? "ingreso" : item.direction === "out" ? "egreso" : undefined} />
      </div>
      {canPay && (
        <Link className="button button--ghost" href={href(target.route, target.params)}>
          {t.pay}
          <span className="visually-hidden"> {item.name}</span>
        </Link>
      )}
    </div>
  );
}

function Overdue({ calendar }: { calendar: Calendar }) {
  const { dict } = useI18n();
  const t = dict.fin.cal;
  const href = useHref();
  const { items, total } = calendar.overdue;
  if (items.length === 0) return <Empty icon="check" title={t.overdueEmpty} />;
  return (
    <Section title={t.overdueTitle} aside={<span className="fin-row__sub"><Slots template={t.overdueTotal} vars={{ amount: <Money value={total} tone="negative" /> }} /></span>}>
      <ul className="fin-list">
        {items.map((item, index) => {
          const target = itemTarget(item);
          return (
            <li key={`${item.ref_kind}-${item.ref_id}-${index}`} className="fin-row fin-row--static">
              <div className="fin-row__main">
                <span className="fin-row__title">{item.name}</span>
                <span className="fin-row__sub muted">
                  {formatDate(item.date)} · {item.days_late === 1 ? t.overdueDay1 : fill(t.overdueDays, { n: String(item.days_late) })}
                </span>
              </div>
              <div className="fin-row__amount">
                <AmountOrPending value={item.amount} />
              </div>
              <Link className="button button--primary" href={href(target.route, target.params)}>
                {t.pay}
                <span className="visually-hidden"> {item.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

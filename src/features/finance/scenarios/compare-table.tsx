"use client";

import { Fragment } from "react";
import type { CompareColumn, ScenarioCompare } from "@/api/models";
import { formatDate, formatPeriod, periodOf } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { BarChart } from "../charts";
import { scaleWidths } from "../charts-logic";
import { fill } from "../helpers";
import { Banner, Money, Section } from "../kit";
import { RegisterIndexLink } from "../uvr/pending";
import { monthlyRows, sign } from "./logic";

/**
 * «Hoy» frente a hasta 3 escenarios a 12 meses, lado a lado. Cada columna: saldo de caja al cierre, interés de préstamos pagado,
 * fecha en que termina la deuda y patrimonio estimado, con la diferencia frente a «Hoy» CON SIGNO escrito (+/−) y en palabras.
 * Nada de esto se guarda ni toca el libro: es una proyección.
 */
export function CompareTable({ data }: { data: ScenarioCompare }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.scen.compare;
  const columns = data.columns;
  const uvrMissing = data.warnings.some((w) => w.code === "uvr_missing");
  return (
    <div className="fin-stack" data-testid="compare">
      <p className="muted">{fill(t.horizon, { n: String(data.horizon_months), until: formatDate(data.until) })}</p>
      {uvrMissing && (
        <Banner tone="warning">
          <p>{t.uvrMissing}</p>
          <p>
            <RegisterIndexLink />
          </p>
        </Banner>
      )}
      <div className="table-wrap">
        <table className="table compare-table">
          <caption className="visually-hidden">{t.caption}</caption>
          <thead>
            <tr>
              <td />
              {columns.map((c) => (
                <th key={c.key} scope="col" className="table__num">
                  {c.key === "today" ? dict.fin.scen.today : c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Metric label={t.closing} columns={columns} value={(c) => <Money value={c.closing_balance} />} diff={(c) => (c.diff ? <Delta value={c.diff.closing_balance} /> : null)} />
            <Metric label={t.interest} columns={columns} value={(c) => <Money value={c.interest_paid} />} diff={(c) => (c.diff ? <Delta value={c.diff.interest_paid} lowerIsBetter /> : null)} />
            <Metric label={t.debtEnd} columns={columns} value={(c) => (c.debt_end_date ? formatDate(c.debt_end_date) : t.noDebt)} diff={(c) => (c.diff ? <DebtDays days={c.diff.debt_end_days} /> : null)} />
            <Metric label={t.netWorth} columns={columns} value={(c) => <Money value={c.net_worth} />} diff={(c) => (c.diff ? <Delta value={c.diff.net_worth} /> : null)} />
          </tbody>
        </table>
      </div>
      <Section title={t.monthlyTitle}>
        <BarChart
          caption={t.monthlyCaption}
          series={columns.map((c) => (c.key === "today" ? dict.fin.scen.today : c.name))}
          rows={chartRows(columns, locale, t.current, t.projected)}
          hatchedLabel={t.projectedLegend}
        />
      </Section>
      {data.notes.length > 0 && (
        <ul className="hint">
          {data.notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function chartRows(columns: readonly CompareColumn[], locale: "es" | "en", current: string, projected: string) {
  const rows = monthlyRows(columns);
  const widths = scaleWidths(rows.flatMap((r) => r.closings));
  return rows.map((row, i) => ({
    key: row.month,
    label: `${formatPeriod(periodOf(row.month), locale)} · ${row.state === "current" ? current : projected}`,
    values: row.closings.map((closing, j) => ({ node: <Money value={closing} compact />, width: widths[i * columns.length + j], hatched: row.state !== "current" })),
  }));
}

function Metric({ label, columns, value, diff }: { label: string; columns: readonly CompareColumn[]; value: (c: CompareColumn) => React.ReactNode; diff: (c: CompareColumn) => React.ReactNode }) {
  const { dict } = useI18n();
  return (
    <Fragment>
      <tr>
        <th scope="row">{label}</th>
        {columns.map((c) => (
          <td key={c.key} className="table__num">
            {value(c)}
          </td>
        ))}
      </tr>
      {columns.some((c) => c.diff) && (
        <tr className="compare-table__diff">
          <th scope="row" className="muted">
            <span className="visually-hidden">{label}: </span>
            {dict.fin.scen.compare.vsToday}
          </th>
          {columns.map((c) => (
            <td key={c.key} className="table__num">
              {diff(c) ?? "—"}
            </td>
          ))}
        </tr>
      )}
    </Fragment>
  );
}

/** La diferencia con signo (+/−) y en palabras («más», «menos», «igual»); el color solo refuerza. */
function Delta({ value, lowerIsBetter = false }: { value: string; lowerIsBetter?: boolean }) {
  const { dict } = useI18n();
  const t = dict.fin.scen.compare;
  const s = sign(value);
  const good = lowerIsBetter ? s < 0 : s > 0;
  return (
    <span>
      <Money value={value} sign="always" tone={s === 0 ? "muted" : good ? "positive" : "negative"} /> <span className="muted">{s === 0 ? t.same : s > 0 ? t.more : t.less}</span>
    </span>
  );
}

function DebtDays({ days }: { days: number | null }) {
  const { dict } = useI18n();
  const t = dict.fin.scen.compare;
  if (days === null) return <span className="muted">—</span>;
  if (days === 0) return <span className="muted">{t.same}</span>;
  return <span>{fill(days < 0 ? t.earlier : t.later, { days: String(Math.abs(days)) })}</span>;
}

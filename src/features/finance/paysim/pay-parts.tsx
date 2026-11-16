"use client";

import { useState } from "react";
import type { StrategyOutcome, StatementBrief } from "@/api/models";
import { formatDate, formatPeriod } from "@/lib/dates";
import { addAmounts, compareAmounts, formatCop } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { BarChart, type ChartRow } from "../charts";
import { useConventionLabel } from "../conventions";
import { fill } from "../helpers";
import { Badge, Money, SelectField, Slots } from "../kit";
import { chartMonths, chartPicks, monthsLabel, ratePercent, strategyLabel } from "./logic";

const CHART_MONTHS = 12;
const TABLE_MONTHS = 12;

/** El nombre de una estrategia: sale del diccionario con su monto y sus cuotas. */
export function useStrategyName() {
  const { dict } = useI18n();
  const t = dict.fin.paysim.results.keys;
  return (o: StrategyOutcome) => {
    const label = strategyLabel(o);
    return fill(t[label.key], { amount: formatCop(label.amount), n: label.n });
  };
}

/** El extracto que se decide: cifras, desglose y la tasa con que devenga lo que se deje. */
export function StatementSummary({ statement }: { statement: StatementBrief }) {
  const { dict, locale } = useI18n();
  const convName = useConventionLabel();
  const t = dict.fin.paysim.statement;
  return (
    <section className="fin-card" aria-label={t.heading}>
      <h2 className="title-s">
        {t.heading} <Badge tone={statement.closed ? "neutral" : "info"} dashed={!statement.closed}>{statement.closed ? t.closed : t.estimated}</Badge>
      </h2>
      <p>
        <Slots
          template={t.line}
          vars={{ month: formatPeriod(statement.month, locale), total: <Money value={statement.total_due} />, minimum: <Money value={statement.minimum_due} />, date: formatDate(statement.due_date) }}
        />
      </p>
      <p className="muted">
        <Slots
          template={t.breakdown}
          vars={{
            installments: <Money value={addAmounts(statement.installments_capital, statement.installments_interest)} />,
            revolving: <Money value={statement.revolving} />,
            interest: <Money value={statement.revolving_interest} />,
            fees: <Money value={statement.fees} />,
          }}
        />
      </p>
      <p className="muted">{fill(t.rate, { rate: `${ratePercent(statement.rate, locale)} ${convName(statement.rate_convention)}`, monthly: ratePercent(statement.monthly_rate, locale) })}</p>
      {compareAmounts(statement.plans_capital_after, "0") > 0 && (
        <p className="muted">
          <Slots template={t.plansLeft} vars={{ amount: <Money value={statement.plans_capital_after} /> }} />
        </p>
      )}
    </section>
  );
}

/** Una estrategia: la tarjeta de «lado a lado», con la más barata rotulada con texto (no solo con color). */
export function StrategyCard({ outcome }: { outcome: StrategyOutcome }) {
  const { dict } = useI18n();
  const t = dict.fin.paysim.results;
  const name = useStrategyName();
  return (
    <article className={`paysim-card${outcome.cheapest ? " paysim-card--best" : ""}`} aria-label={name(outcome)}>
      <h3 className="title-s">{name(outcome)}</h3>
      {outcome.cheapest ? <Badge tone="positive">{t.cheapest}</Badge> : compareAmounts(outcome.extra_cost, "0") > 0 ? <p className="muted"><Slots template={t.extra} vars={{ amount: <Money value={outcome.extra_cost} /> }} /></p> : null}
      <dl className="paysim-metrics">
        <div>
          <dt>{t.payNow}</dt>
          <dd><strong><Money value={outcome.pay_now} /></strong></dd>
        </div>
        <div>
          <dt>{t.months}</dt>
          <dd>{outcome.truncated ? t.truncatedLabel : monthsLabel(outcome.months, t.monthsOne, t.monthsOther)}</dd>
        </div>
        <div>
          <dt>{t.payoff}</dt>
          <dd>{outcome.truncated ? "—" : formatDate(outcome.payoff_date)}</dd>
        </div>
        <div>
          <dt>{t.interest}</dt>
          <dd><Money value={outcome.total_interest} /></dd>
        </div>
        <div>
          <dt>{t.cost}</dt>
          <dd><Money value={outcome.total_cost} /></dd>
        </div>
        <div>
          <dt>{t.peak}</dt>
          <dd><Money value={outcome.peak_payment} /></dd>
        </div>
        {compareAmounts(outcome.fees, "0") > 0 && (
          <div>
            <dt>{t.fees}</dt>
            <dd><Money value={outcome.fees} /></dd>
          </div>
        )}
        {compareAmounts(outcome.deferred_principal, "0") > 0 && (
          <div>
            <dt>{fill(t.deferred, { amount: "" }).trim()}</dt>
            <dd><Money value={outcome.deferred_principal} /></dd>
          </div>
        )}
      </dl>
      {outcome.notes.map((note) => (
        <p key={note} className="muted" role="note">{t.notes[note as keyof typeof t.notes] ?? note}</p>
      ))}
      {outcome.truncated && <p className="muted" role="note">{fill(t.truncatedNote, { amount: formatCop(outcome.remaining), n: String(outcome.months) })}</p>}
    </article>
  );
}

/** Mes a mes de la estrategia elegida (tabla) y lo que se paga cada mes por estrategia (gráfica con su tabla equivalente). */
export function Timeline({ outcomes }: { outcomes: readonly StrategyOutcome[] }) {
  const { dict } = useI18n();
  const t = dict.fin.paysim.timeline;
  const name = useStrategyName();
  const [picked, setPicked] = useState(0);
  const [all, setAll] = useState(false);
  const outcome = outcomes[Math.min(picked, outcomes.length - 1)];
  if (!outcome) return null;
  const rows = all ? outcome.rows : outcome.rows.slice(0, TABLE_MONTHS);
  const picks = chartPicks(outcomes);
  const months = chartMonths(picks, CHART_MONTHS);
  const chartRows: ChartRow[] = months.map((m) => ({
    key: String(m.number),
    label: m.number === 0 ? t.now : formatDate(m.due),
    values: m.amounts.map((amount, i) => ({ node: amount === null ? "—" : <Money value={amount} />, width: m.widths[i] ?? 0 })),
  }));
  return (
    <>
      <BarChart caption={fill(dict.fin.paysim.chart.caption, { n: String(months.length) })} series={picks.map(name)} rows={chartRows} />
      <section aria-label={t.heading}>
        <h2 className="title-s">{t.heading}</h2>
        <SelectField label={t.choose} value={String(picked)} onChange={(v) => setPicked(+v)} options={outcomes.map((o, i) => ({ value: String(i), label: name(o) }))} />
        <div className="table-wrap" tabIndex={0} role="region" aria-label={t.caption}>
          <table className="table paysim-table">
            <caption className="visually-hidden">{t.caption}</caption>
            <thead>
              <tr>
                <th scope="col">{t.month}</th>
                <th scope="col" className="table__num">{t.total}</th>
                <th scope="col" className="table__num">{t.minimum}</th>
                <th scope="col" className="table__num">{t.payment}</th>
                <th scope="col" className="table__num">{t.installments}</th>
                {compareAmounts(outcome.deferred_principal, "0") > 0 && <th scope="col" className="table__num">{t.deferred}</th>}
                <th scope="col" className="table__num">{t.interest}</th>
                <th scope="col" className="table__num">{t.fees}</th>
                <th scope="col" className="table__num">{t.balance}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.number}>
                  <th scope="row">{r.number === 0 ? `${t.now} · ${formatDate(r.due_date)}` : formatDate(r.due_date)}</th>
                  <td className="table__num"><Money value={r.total_due} /></td>
                  <td className="table__num"><Money value={r.minimum_due} /></td>
                  <td className="table__num"><strong><Money value={r.payment} /></strong></td>
                  <td className="table__num"><Money value={r.installments} /></td>
                  {compareAmounts(outcome.deferred_principal, "0") > 0 && <td className="table__num"><Money value={r.deferred_installment} /></td>}
                  <td className="table__num"><Money value={r.revolving_interest} /></td>
                  <td className="table__num"><Money value={r.fees} /></td>
                  <td className="table__num"><Money value={r.balance_after} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {outcome.rows.length > TABLE_MONTHS && (
          <button type="button" className="button button--ghost" onClick={() => setAll((v) => !v)} aria-expanded={all}>
            {all ? t.less : fill(t.more, { n: String(outcome.rows.length) })}
          </button>
        )}
      </section>
    </>
  );
}

/** Los supuestos de la simulación, siempre a la vista (plegados). */
export function Assumptions({ codes, dictionary }: { codes: readonly string[]; dictionary: Record<string, string> }) {
  const { dict } = useI18n();
  return (
    <details className="paysim-assumptions">
      <summary>{dict.fin.paysim.assumptionsHeading}</summary>
      <ul className="fin-bullets">
        {codes.map((code) => (
          <li key={code}>{dictionary[code] ?? code}</li>
        ))}
      </ul>
    </details>
  );
}

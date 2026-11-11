"use client";

import type { SimRow, SimSummary } from "@/api/models";
import { fractionToPercent } from "@/lib/amount-input";
import { formatDate } from "@/lib/dates";
import { formatPercent } from "@/lib/percent";
import { useI18n } from "@/i18n/provider";
import { Money } from "../kit";

export function pct(fraction: string, locale: "es" | "en", decimals = 4): string {
  return formatPercent(fractionToPercent(fraction, decimals), locale, decimals);
}

/** Cuota, interés total y costo total del crédito (todo lo que se paga: cuotas + seguro + cargos de apertura). */
export function SummaryCards({ summary }: { summary: SimSummary }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.sim.summary;
  const items: { label: string; value: React.ReactNode; strong?: boolean }[] = [
    { label: t.firstPayment, value: <Money value={summary.first_payment} />, strong: true },
    { label: t.totalInterest, value: <Money value={summary.total_interest} /> },
    { label: t.totalInsurance, value: <Money value={summary.total_insurance} /> },
    { label: t.upfrontFees, value: <Money value={summary.upfront_fees} /> },
    { label: t.totalPaid, value: <Money value={summary.total_paid} /> },
    { label: t.totalCost, value: <Money value={summary.total_cost} />, strong: true },
    { label: t.financialCost, value: <Money value={summary.financial_cost} /> },
    { label: t.monthlyRate, value: pct(summary.monthly_rate, locale) },
    { label: t.effectiveAnnual, value: pct(summary.effective_annual_rate, locale) },
    { label: t.costEffectiveAnnual, value: pct(summary.cost_effective_annual_rate, locale) },
  ];
  return (
    <dl className="sim-summary">
      {items.map((item) => (
        <div key={item.label} className={item.strong ? "sim-summary__item sim-summary__item--strong" : "sim-summary__item"}>
          <dt className="muted">{item.label}</dt>
          <dd className="tabular">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const FIRST_ROWS = 12;

/** La tabla de amortización del simulador (N.º, fecha, saldo, capital, interés, seguro, cuota). */
export function AmortizationRows({ rows, showAll, onShowAll }: { rows: SimRow[]; showAll: boolean; onShowAll: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.sim.table;
  const shown = showAll ? rows : rows.slice(0, FIRST_ROWS);
  return (
    <div>
      <div className="table-wrap">
        <table className="table">
          <caption className="visually-hidden">{t.caption}</caption>
          <thead>
            <tr>
              <th scope="col">{dict.fin.loans.tableCols.number}</th>
              <th scope="col">{dict.fin.loans.tableCols.date}</th>
              <th scope="col" className="table__num">{t.opening}</th>
              <th scope="col" className="table__num">{dict.fin.loans.split.capital}</th>
              <th scope="col" className="table__num">{dict.fin.loans.split.interest}</th>
              <th scope="col" className="table__num">{dict.fin.loans.split.insurance}</th>
              <th scope="col" className="table__num">{t.total}</th>
              <th scope="col" className="table__num">{t.closing}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.number}>
                <th scope="row">{row.number}</th>
                <td>{row.due_date ? formatDate(row.due_date) : "—"}</td>
                <td className="table__num"><Money value={row.opening} /></td>
                <td className="table__num"><Money value={row.capital} /></td>
                <td className="table__num"><Money value={row.interest} /></td>
                <td className="table__num"><Money value={row.insurance} /></td>
                <td className="table__num"><Money value={row.total} /></td>
                <td className="table__num"><Money value={row.closing} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!showAll && rows.length > FIRST_ROWS && (
        <button type="button" className="button button--ghost" onClick={onShowAll}>
          {t.showAll.replace("{n}", String(rows.length))}
        </button>
      )}
    </div>
  );
}

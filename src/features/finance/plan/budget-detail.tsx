"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { Budget, BudgetHistory } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate } from "@/lib/dates";
import { formatPercent, percentWidth } from "@/lib/percent";
import { useI18n } from "@/i18n/provider";
import { BarChart } from "../charts";
import { scaleWidths } from "../charts-logic";
import { drillHref } from "../drill";
import { fill } from "../helpers";
import { useHref, useResource, useSubmit } from "../hooks";
import { Banner, ErrorState, Loading, Modal, Money, Progress, ScreenHeader, Section } from "../kit";
import { BudgetForm } from "./budget-form";
import { BudgetState, stateTone } from "./budgets-screen";
import { budgetName } from "./logic";
import { useLookups } from "./lookups";

/** Detalle de un presupuesto (§3.12): presupuestado frente a real por periodo, ritmo, «Ver movimientos» y archivar. */
export function BudgetDetail({ id }: { id: string }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.plan.budgets;
  const href = useHref();
  const budget = useResource<Budget>(paths.budget(id));
  const history = useResource<BudgetHistory>(paths.budgetHistory(id, 6));
  const lookups = useLookups();
  const submit = useSubmit();
  const [editing, setEditing] = useState(false);
  const back = { href: href("plan-presupuestos"), label: dict.screens["plan-presupuestos"] };

  if (budget.loading && !budget.data) return <div className="screen"><ScreenHeader title={dict.screens["plan-presupuesto"]} back={back} /><Loading /></div>;
  if (budget.failure || !budget.data) {
    return (
      <div className="screen">
        <ScreenHeader title={dict.screens["plan-presupuesto"]} back={back} />
        <ErrorState message={budget.failure?.status === 404 ? dict.fin.errors.notFound : dict.fin.errors.generic} onRetry={budget.reload} />
      </div>
    );
  }
  const b = budget.data;
  const name = budgetName(b, lookups);
  const rows = history.data?.periods ?? [];
  const limits = scaleWidths([...rows.map((r) => r.limit), ...rows.map((r) => r.spent)]);
  async function toggleActive() {
    const body = { active: !b.active };
    const result = await submit.run(body, () => api.patch(paths.budget(b.id), body, { locale }));
    if (result.ok) budget.reload();
  }
  return (
    <div className="screen">
      <ScreenHeader title={name} eyebrow={dict.screens["plan-presupuesto"]} back={back} />
      <section className="fin-card" aria-label={name}>
        <p className="muted">
          {dict.fin.plan.dimensions[b.dimension]} · {dict.fin.plan.periods[b.period]} · {formatDate(b.period_start)} – {formatDate(b.period_end)}
        </p>
        <p className="fin-big">
          <Money value={b.spent} /> <span className="muted fin-big__label">{t.of} </span>
          <Money value={b.limit} />
        </p>
        <Progress percent={percentWidth(b.percent)} label={`${name}: ${formatPercent(b.percent, locale)}`} tone={stateTone(b.state)} />
        <p className="fin-row__badges">
          <BudgetState budget={b} />
          <span className="muted">{formatPercent(b.percent, locale)}</span>
        </p>
        {b.state !== "exceeded" && (
          <p className="muted">
            {t.left} <Money value={b.remaining} /> · <Money value={b.per_day} /> {t.perDay} ({fill(t.daysLeft, { n: String(b.days_left) })})
          </p>
        )}
        {b.pace !== null && (
          <p className="muted">
            {t.pace} <Money value={b.pace} estimated />
          </p>
        )}
        <div className="actions">
          <Link className="button button--ghost" href={drillHref(href, b.movements_filter)}>
            {dict.fin.loans.viewMovements}
          </Link>
          <button type="button" className="button button--ghost" onClick={() => setEditing(true)}>
            {t.edit}
          </button>
          <button type="button" className="button button--ghost" disabled={submit.pending} onClick={() => void toggleActive()}>
            {b.active ? t.archive : t.restore}
          </button>
        </div>
        {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
        <p className="hint">{t.executedNote}</p>
      </section>
      <Section title={t.history}>
        {history.loading && !history.data && <Loading />}
        {history.failure && <ErrorState message={dict.fin.errors.generic} onRetry={history.reload} />}
        {history.data && rows.length === 0 && <p className="muted">{t.noHistory}</p>}
        {rows.length > 0 && (
          <>
            <BarChart
              caption={t.historyChart}
              series={[t.budgeted, t.real]}
              rows={rows.map((row, index) => ({
                key: row.period_start,
                label: formatDate(row.period_start),
                values: [
                  { node: <Money value={row.limit} compact />, width: limits[index] },
                  { node: <Money value={row.spent} compact />, width: limits[rows.length + index] },
                ],
              }))}
            />
            <div className="table-wrap">
              <table className="table">
                <caption className="visually-hidden">{t.history}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t.period}</th>
                    <th scope="col" className="table__num">{t.budgeted}</th>
                    <th scope="col" className="table__num">{t.real}</th>
                    <th scope="col" className="table__num">%</th>
                    <th scope="col">{t.state}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.period_start}>
                      <th scope="row">{formatDate(row.period_start)} – {formatDate(row.period_end)}</th>
                      <td className="table__num"><Money value={row.limit} /></td>
                      <td className="table__num">
                        <Link href={drillHref(href, row.movements_filter)} aria-label={`${dict.fin.loans.viewMovements}: ${formatDate(row.period_start)}`}>
                          <Money value={row.spent} />
                        </Link>
                      </td>
                      <td className="table__num">{formatPercent(row.percent, locale)}</td>
                      <td>{dict.fin.plan.states[row.state]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>
      <Modal open={editing} title={t.edit} onClose={() => setEditing(false)}>
        {editing && (
          <BudgetForm
            budget={b}
            onCancel={() => setEditing(false)}
            onDone={() => {
              setEditing(false);
              budget.reload();
              history.reload();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

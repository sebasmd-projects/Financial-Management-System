"use client";

import { useState } from "react";
import type { ExtraPayment, ExtraScenario } from "@/api/models";
import { paths } from "@/api/paths";
import { compareAmounts, formatCop } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { AmountField, Badge, Money, TextField } from "../kit";
import { buildExtra, EMPTY_EXTRA, type ExtraInputs } from "./logic";
import { RateInput, SimulationStatus, SimulatorShell, useSimulation } from "./sim-kit";

/**
 * Abono extra a capital (§3.9): tres columnas lado a lado (sin abono, reducir plazo, reducir cuota) con el ahorro en interés
 * de cada una. La mejor opción por ahorro va rotulada con texto, no solo con color.
 */
export function ExtraPaymentSimulator() {
  const { dict } = useI18n();
  const t = dict.fin.sim.extra;
  const [input, setInput] = useState<ExtraInputs>(EMPTY_EXTRA);
  const set = <K extends keyof ExtraInputs>(key: K) => (value: ExtraInputs[K]) => setInput((prev) => ({ ...prev, [key]: value }));
  const built = buildExtra(input);
  const sim = useSimulation<ExtraPayment>(paths.simulate("extra-payment"), built.body);
  const d = sim.data;
  const columns: { key: "none" | "reduce_term" | "reduce_installment"; scenario: ExtraScenario }[] = d
    ? [
        { key: "none", scenario: d.none },
        { key: "reduce_term", scenario: d.reduce_term },
        { key: "reduce_installment", scenario: d.reduce_installment },
      ]
    : [];
  const best = d ? (compareAmounts(d.reduce_term.interest_saved, d.reduce_installment.interest_saved) >= 0 ? "reduce_term" : "reduce_installment") : null;
  return (
    <SimulatorShell route="simulador-abono-extra">
      <form className="fin-form" onSubmit={(event) => event.preventDefault()} noValidate>
        <AmountField label={t.principal} hint={t.principalHint} value={input.principal} onChange={set("principal")} preview={built.body ? formatCop(built.body.principal) : null} />
        <RateInput rate={input.rate} onRate={set("rate")} convention={input.convention} onConvention={set("convention")} />
        <TextField label={dict.fin.loans.fields.term} value={input.term} onChange={set("term")} inputMode="numeric" maxLength={4} error={built.termProblem ? dict.fin.sim.termProblems[built.termProblem] : null} />
        <TextField label={t.after} hint={t.afterHint} value={input.afterInstallment} onChange={set("afterInstallment")} inputMode="numeric" maxLength={3} error={built.afterProblem ? t.afterProblem : null} />
        <AmountField label={t.extra} value={input.extra} onChange={set("extra")} preview={built.body ? formatCop(built.body.extra) : null} />
      </form>
      <SimulationStatus sim={sim} incomplete={t.incomplete} />
      {d && (
        <section aria-label={t.result} aria-busy={sim.loading}>
          <p className="fin-phrase">
            {fill(t.balanceLine, { n: String(d.after_installment) })} <Money value={d.balance} /> → <Money value={d.balance_after} />
          </p>
          <div className="table-wrap">
            <table className="table sim-compare">
              <caption className="visually-hidden">{t.result}</caption>
              <thead>
                <tr>
                  <td />
                  {columns.map((c) => (
                    <th key={c.key} scope="col" className="table__num">
                      {t.columns[c.key]}
                      {c.key === best && (
                        <>
                          <br />
                          <Badge tone="positive">{t.bestSaving}</Badge>
                        </>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">{t.rows.payment}</th>
                  {columns.map((c) => (
                    <td key={c.key} className="table__num"><Money value={c.scenario.payment} /></td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">{t.rows.left}</th>
                  {columns.map((c) => (
                    <td key={c.key} className="table__num">
                      {c.scenario.installments_left}
                      {c.key === "reduce_term" && c.scenario.installments_left > 0 ? <span className="muted"> ({t.lastSmaller})</span> : null}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">{t.rows.last}</th>
                  {columns.map((c) => (
                    <td key={c.key} className="table__num"><Money value={c.scenario.last_payment} /></td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">{t.rows.interestLeft}</th>
                  {columns.map((c) => (
                    <td key={c.key} className="table__num"><Money value={c.scenario.interest_left} /></td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">{t.rows.saved}</th>
                  {columns.map((c) => (
                    <td key={c.key} className="table__num">{c.key === "none" ? "—" : <strong><Money value={c.scenario.interest_saved} /></strong>}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="hint">{fill(t.installmentsSaved, { n: String(d.installments_saved) })}</p>
        </section>
      )}
    </SimulatorShell>
  );
}

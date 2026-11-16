"use client";

import { useState } from "react";
import type { Loan, LoanPaySim } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate } from "@/lib/dates";
import { compareAmounts } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { useConventionLabel } from "../conventions";
import { fill } from "../helpers";
import { useHref, useResource } from "../hooks";
import { AmountField, Badge, Banner, ErrorState, Money, ScreenHeader, Slots, TextField } from "../kit";
import { SimulationStatus, useSimulation } from "../simulators/sim-kit";
import { Assumptions } from "./pay-parts";
import { buildLoanRequest, EMPTY_LOAN_SIM, ratePercent, type LoanSimInputs } from "./logic";

/**
 * Simulador de pagos de un préstamo: pagar solo la cuota frente a un abono extra X (reducir plazo o reducir cuota) y «¿cuánto abonar para terminar
 * en N cuotas?». Usa las cuotas que faltan y la tasa vigente; no guarda nada.
 */
export function LoanPaymentSimulator({ id }: { id: string }) {
  const { dict, locale } = useI18n();
  const convName = useConventionLabel();
  const t = dict.fin.paysim.loan;
  const href = useHref();
  const loan = useResource<Loan>(paths.loan(id));
  const [input, setInput] = useState<LoanSimInputs>(EMPTY_LOAN_SIM);
  const built = buildLoanRequest(input);
  const sim = useSimulation<LoanPaySim>(paths.loanPayStrategy(id), built.body);
  const d = sim.data;
  const set = <K extends keyof LoanSimInputs>(key: K) => (value: LoanSimInputs[K]) => setInput((prev) => ({ ...prev, [key]: value }));
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["credito-simulador-pagos"]} eyebrow={loan.data?.name ?? dict.fin.paysim.eyebrow} back={{ href: href("credito", [id]), label: loan.data?.name ?? dict.fin.paysim.backToLoan }} />
      <p className="muted">{dict.fin.sim.neverWrites}</p>
      {loan.failure && <ErrorState message={dict.fin.errors.generic} onRetry={loan.reload} />}
      <form className="fin-form" onSubmit={(event) => event.preventDefault()} noValidate>
        <AmountField label={t.extra} hint={t.extraHint} value={input.extra} onChange={set("extra")} error={built.problem === "extra" ? dict.fin.errors.validation : null} />
        <TextField label={t.months} hint={t.monthsHint} value={input.months} onChange={set("months")} inputMode="numeric" maxLength={3} error={built.problem === "months" ? dict.fin.errors.validation : null} />
      </form>
      <SimulationStatus sim={sim} incomplete={t.extraHint} />
      {d && (
        <div className="fin-stack" aria-busy={sim.loading}>
          <p className="fin-phrase">
            <Slots template={t.summary} vars={{ balance: <Money value={d.balance} />, n: String(d.installments_left), payment: <Money value={d.next_payment} />, rate: `${ratePercent(d.rate, locale)} ${convName(d.rate_convention)}` }} />
          </p>
          {d.warnings.some((w) => w.code === "rate_above_usury") && <Banner tone="warning">{dict.fin.paysim.usury}</Banner>}
          <div className="paysim-grid">
            {d.strategies.map((o) => (
              <article key={o.key} className={`paysim-card${o.cheapest && d.strategies.length > 1 ? " paysim-card--best" : ""}`} aria-label={t.keys[o.key]}>
                <h3 className="title-s">{t.keys[o.key]}</h3>
                {o.cheapest && d.strategies.length > 1 && <Badge tone="positive">{dict.fin.paysim.results.cheapest}</Badge>}
                <dl className="paysim-metrics">
                  {compareAmounts(o.extra_now, "0") > 0 && (
                    <div><dt>{t.rows.extraNow}</dt><dd><Money value={o.extra_now} /></dd></div>
                  )}
                  <div><dt>{t.rows.installments}</dt><dd>{o.installments}</dd></div>
                  <div><dt>{t.rows.first}</dt><dd><Money value={o.first_payment} /></dd></div>
                  <div><dt>{t.rows.last}</dt><dd><Money value={o.last_payment} /></dd></div>
                  <div><dt>{t.rows.interest}</dt><dd><Money value={o.total_interest} /></dd></div>
                  {o.key !== "installment" && <div><dt>{t.rows.saved}</dt><dd><strong><Money value={o.saved} /></strong></dd></div>}
                  <div><dt>{t.rows.total}</dt><dd><Money value={o.total_cost} /></dd></div>
                  <div><dt>{t.rows.lastDate}</dt><dd>{formatDate(o.last_due_date)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
          {d.finish_in && (
            <p className="fin-phrase" role="status">
              {d.finish_in.extra ? (
                <Slots template={t.finish} vars={{ n: String(d.finish_in.months), amount: <Money value={d.finish_in.extra} /> }} />
              ) : d.finish_in.feasible ? (
                fill(t.finishNo, { n: String(d.finish_in.months) })
              ) : (
                fill(t.finishImpossible, { n: String(d.finish_in.months) })
              )}
            </p>
          )}
          <Assumptions codes={d.assumptions} dictionary={t.assumptions} />
        </div>
      )}
    </div>
  );
}

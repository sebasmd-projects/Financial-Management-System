"use client";

import { useState, type ReactNode } from "react";
import type { Card, PayStrategy, PayTarget } from "@/api/models";
import { paths } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { useResource, useHref } from "../hooks";
import { AmountField, Banner, Checkbox, ErrorState, Money, ScreenHeader, SelectField, Section, Segmented, Slots, TextField } from "../kit";
import { RateInput, SimulationStatus, useSimulation } from "../simulators/sim-kit";
import { Assumptions, StatementSummary, StrategyCard, Timeline } from "./pay-parts";
import { buildCardRequest, buildTargetRequest, DEFER_TERM_CHOICES, EMPTY_CARD_SIM, EMPTY_TARGET, type CardSimInputs, type Continue, type Goal, type Scope, type TargetInputs } from "./logic";

/**
 * Simulador de pagos de una tarjeta: «si quiero pagar X, ¿dejo el saldo a cuotas o pago más sobre el total?». Compara lado a lado pagar el total, el
 * mínimo, un valor propio o diferir lo que queda (con la tasa de la tarjeta o la que escribas), mes a mes, y contesta las preguntas al revés.
 * No guarda nada: todo viene de `POST cards/{id}/simulators/*`, con los supuestos a la vista.
 */
export function CardPaymentSimulator({ id }: { id: string }) {
  const { dict } = useI18n();
  const t = dict.fin.paysim;
  const href = useHref();
  const card = useResource<Card>(paths.card(id));
  const [input, setInput] = useState<CardSimInputs>(EMPTY_CARD_SIM);
  const set = <K extends keyof CardSimInputs>(key: K) => (value: CardSimInputs[K]) => setInput((prev) => ({ ...prev, [key]: value }));
  const built = buildCardRequest(input);
  const sim = useSimulation<PayStrategy>(paths.cardPayStrategy(id), built.body);
  const toggle = (term: number) => (checked: boolean) => set("terms")(checked ? [...input.terms, term] : input.terms.filter((n) => n !== term));
  const d = sim.data;
  const problem = (key: "pay_amount" | "pay_now" | "defer_rate") => (built.problem === key ? dict.fin.errors.invalid_amount ?? dict.fin.errors.validation : null);
  const back = { href: href("tarjeta", [id]), label: card.data?.name ?? t.backToCard };
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["tarjeta-simulador-pagos"]} eyebrow={card.data?.name ?? t.eyebrow} back={back} />
      <p className="muted">{dict.fin.sim.neverWrites}</p>
      <p className="muted">{t.intro}</p>
      {card.failure && <ErrorState message={dict.fin.errors.generic} onRetry={card.reload} />}
      <form className="fin-form" onSubmit={(event) => event.preventDefault()} noValidate>
        <AmountField label={t.form.payAmount} hint={t.form.payAmountHint} value={input.payAmount} onChange={set("payAmount")} error={problem("pay_amount")} />
        <SelectField
          label={t.form.continueWith}
          value={input.continueWith}
          onChange={(v) => set("continueWith")(v as Continue)}
          options={(["same", "minimum", "total"] as const).map((value) => ({ value, label: t.form.continueOptions[value] }))}
        />
        <fieldset className="paysim-fieldset">
          <legend className="title-s">{t.form.deferTitle}</legend>
          <p className="hint">{t.form.deferTermsHint}</p>
          <div className="paysim-terms" role="group" aria-label={t.form.deferTerms}>
            {DEFER_TERM_CHOICES.map((term) => (
              <Checkbox key={term} label={String(term)} checked={input.terms.includes(term)} onChange={toggle(term)} />
            ))}
          </div>
          <AmountField label={t.form.payNow} hint={t.form.payNowHint} value={input.payNow} onChange={set("payNow")} error={problem("pay_now")} />
          <RateInput rate={input.deferRate} onRate={set("deferRate")} convention={input.convention} onConvention={set("convention")} error={problem("defer_rate")} />
          <p className="hint">{t.form.deferRateHint}</p>
          <SelectField
            label={t.form.scope}
            value={input.scope}
            onChange={(v) => set("scope")(v as Scope)}
            options={(["statement", "all"] as const).map((value) => ({ value, label: t.form.scopeOptions[value] }))}
          />
        </fieldset>
      </form>
      <SimulationStatus sim={sim} incomplete={t.intro} />
      {d && (
        <div aria-busy={sim.loading} className="fin-stack">
          <StatementSummary statement={d.statement} />
          {d.warnings.some((w) => w.code === "rate_above_usury") && <Banner tone="warning">{t.usury}</Banner>}
          <section aria-label={t.results.heading}>
            <h2 className="title-s">{t.results.heading}</h2>
            <div className="paysim-grid">
              {d.strategies.map((o, i) => (
                <StrategyCard key={`${o.key}-${o.params.defer_terms ?? 0}-${i}`} outcome={o} />
              ))}
            </div>
            {d.skipped.map((s) => (
              <p key={`${s.key}-${s.defer_terms}`} className="muted">{fill(t.results.skipped, { n: String(s.defer_terms ?? "") })}</p>
            ))}
          </section>
          <Timeline outcomes={d.strategies} />
          <Assumptions codes={d.assumptions} dictionary={t.assumptions} />
        </div>
      )}
      <Reverse id={id} card={input} />
    </div>
  );
}

/** Las preguntas al revés: no pagar intereses, terminar en N meses o que la cuota no pase de X. */
function Reverse({ id, card }: { id: string; card: CardSimInputs }) {
  const { dict } = useI18n();
  const t = dict.fin.paysim.reverse;
  const [target, setTarget] = useState<TargetInputs>(EMPTY_TARGET);
  const body = buildTargetRequest(card, target);
  const sim = useSimulation<PayTarget>(paths.cardPayTarget(id), body);
  const d = sim.data;
  return (
    <Section title={t.heading}>
      <Segmented
        legend={t.goal}
        variant="chips"
        value={target.goal}
        onChange={(goal) => setTarget((prev) => ({ ...prev, goal: goal as Goal }))}
        options={(["no_interest", "finish_in", "max_payment"] as const).map((value) => ({ value, label: t.goals[value] }))}
      />
      {target.goal === "finish_in" && <TextField label={t.months} value={target.months} onChange={(months) => setTarget((prev) => ({ ...prev, months }))} inputMode="numeric" maxLength={3} />}
      {target.goal === "max_payment" && <AmountField label={t.maxPayment} value={target.maxPayment} onChange={(maxPayment) => setTarget((prev) => ({ ...prev, maxPayment }))} />}
      <SimulationStatus sim={sim} incomplete={t.goals[target.goal]} />
      {d && <Answer d={d} />}
    </Section>
  );
}

function Answer({ d }: { d: PayTarget }) {
  const { dict } = useI18n();
  const t = dict.fin.paysim.reverse;
  const money = (value: string | null | undefined) => (value ? <Money value={value} /> : "—");
  const vars: Record<string, ReactNode> = {
    amount: money(d.amount),
    interest: money(d.comparison?.total_interest),
    n: String(d.goal === "max_payment" ? (d.terms ?? "") : (d.feasible ? (d.months ?? "") : (d.earliest_months ?? ""))),
    months: String(d.months ?? ""),
  };
  const template = d.goal === "no_interest" ? t.noInterest : d.goal === "finish_in" ? (d.feasible ? t.finish : t.finishImpossible) : d.feasible ? t.maxPaymentOk : t.maxPaymentNone;
  return (
    <p className="fin-phrase" role="status">
      <Slots template={template} vars={vars} />
    </p>
  );
}

"use client";

import { useState } from "react";
import type { Compare, RateConvention } from "@/api/models";
import { paths } from "@/api/paths";
import { addAmounts, negateAmount } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { UsuryNote } from "../credit/notes";
import { AmountField, Badge, Money, SelectField, TextField } from "../kit";
import { buildCompare, EMPTY_OFFER, type OfferInputs } from "./logic";
import { RateInput, SimulationStatus, SimulatorShell, useSimulation } from "./sim-kit";
import { pct } from "./sim-views";

const MAX_OFFERS = 3;

/**
 * Comparar alternativas (§3.9): hasta 3 ofertas lado a lado. La de menor costo financiero se marca con TEXTO («Menor costo
 * financiero»), no solo con color, y se muestra cuánto más cuestan las otras frente a ella.
 */
export function CompareSimulator() {
  const { dict, locale } = useI18n();
  const t = dict.fin.sim.compare;
  const [offers, setOffers] = useState<OfferInputs[]>([EMPTY_OFFER, EMPTY_OFFER]);
  const update = (index: number, patch: Partial<OfferInputs>) => setOffers((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  const fallback = (index: number) => fill(t.offerName, { n: String(index + 1) });
  const built = buildCompare(offers, fallback);
  const sim = useSimulation<Compare>(paths.simulate("compare"), built ? { offers: built.offers } : null);
  const d = sim.data;
  const cheapest = d?.offers.find((o) => o.cheapest) ?? null;
  return (
    <SimulatorShell route="simulador-comparar">
      <div className="sim-offers">
        {offers.map((offer, index) => (
          <fieldset key={index} className="fin-details sim-offer">
            <legend>{fill(t.offerName, { n: String(index + 1) })}</legend>
            <TextField label={t.label} value={offer.label} onChange={(v) => update(index, { label: v })} maxLength={40} />
            <AmountField label={dict.fin.loans.fields.principal} value={offer.principal} onChange={(v) => update(index, { principal: v })} />
            <RateInput rate={offer.rate} onRate={(v) => update(index, { rate: v })} convention={offer.convention} onConvention={(v: RateConvention) => update(index, { convention: v })} />
            <TextField label={dict.fin.loans.fields.term} help={dict.fin.help.texts.term} value={offer.term} onChange={(v) => update(index, { term: v })} inputMode="numeric" maxLength={4} />
            <SelectField
              label={dict.fin.loans.fields.system}
              value={offer.system}
              onChange={(v) => update(index, { system: v as OfferInputs["system"] })}
              options={(["french", "constant_capital", "interest_only"] as const).map((s) => ({ value: s, label: dict.fin.systems[s] }))}
            />
            <div className="fin-grid-2">
              <AmountField label={dict.fin.loans.fields.insurance} help={dict.fin.help.texts.insurance} value={offer.insurance} onChange={(v) => update(index, { insurance: v })} />
              <AmountField label={dict.fin.sim.installment.upfrontFees} value={offer.upfrontFees} onChange={(v) => update(index, { upfrontFees: v })} />
            </div>
            {offers.length > 2 && (
              <button type="button" className="button button--ghost" onClick={() => setOffers((prev) => prev.filter((_, i) => i !== index))}>
                {t.remove}
              </button>
            )}
          </fieldset>
        ))}
      </div>
      {offers.length < MAX_OFFERS && (
        <button type="button" className="button button--ghost" onClick={() => setOffers((prev) => [...prev, EMPTY_OFFER])}>
          {t.add}
        </button>
      )}
      <SimulationStatus sim={sim} incomplete={t.incomplete} />
      {d && built && (
        <section aria-label={t.result} aria-busy={sim.loading}>
          <div className="table-wrap">
            <table className="table sim-compare">
              <caption className="visually-hidden">{t.result}</caption>
              <thead>
                <tr>
                  <td />
                  {d.offers.map((o, i) => (
                    <th key={built.indexes[i]} scope="col" className="table__num">
                      {o.label}
                      {o.cheapest && (
                        <>
                          <br />
                          <Badge tone="positive">{t.cheapest}</Badge>
                        </>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row label={t.rows.principal} cells={d.offers.map((o) => <Money key={o.label} value={o.summary.principal} />)} />
                <Row label={t.rows.term} cells={d.offers.map((o) => o.summary.term)} />
                <Row label={t.rows.firstPayment} cells={d.offers.map((o) => <Money key={o.label} value={o.summary.first_payment} />)} />
                <Row label={t.rows.totalInterest} cells={d.offers.map((o) => <Money key={o.label} value={o.summary.total_interest} />)} />
                <Row label={t.rows.totalInsurance} cells={d.offers.map((o) => <Money key={o.label} value={o.summary.total_insurance} />)} />
                <Row label={t.rows.upfrontFees} cells={d.offers.map((o) => <Money key={o.label} value={o.summary.upfront_fees} />)} />
                <Row label={t.rows.totalCost} cells={d.offers.map((o) => <Money key={o.label} value={o.summary.total_cost} />)} />
                <Row label={t.rows.financialCost} strong cells={d.offers.map((o) => <Money key={o.label} value={o.summary.financial_cost} />)} />
                <Row label={t.rows.costEa} cells={d.offers.map((o) => pct(o.summary.cost_effective_annual_rate, locale))} />
                {cheapest && (
                  <Row
                    label={t.rows.difference}
                    cells={d.offers.map((o) => (o.cheapest ? t.baseline : <Money key={o.label} value={addAmounts(o.summary.financial_cost, negateAmount(cheapest.summary.financial_cost))} sign="always" />))}
                  />
                )}
              </tbody>
            </table>
          </div>
          {d.offers.map((o) => (
            <div key={o.label}>
              <p className="hint">{o.label}</p>
              <UsuryNote ea={o.usury.ea} exceeded={o.usury.exceeded} />
            </div>
          ))}
        </section>
      )}
    </SimulatorShell>
  );
}

function Row({ label, cells, strong }: { label: string; cells: React.ReactNode[]; strong?: boolean }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {cells.map((cell, i) => (
        <td key={i} className="table__num">
          {strong ? <strong>{cell}</strong> : cell}
        </td>
      ))}
    </tr>
  );
}

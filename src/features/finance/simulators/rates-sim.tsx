"use client";

import { useState } from "react";
import type { RateConvert, RateConvention } from "@/api/models";
import { paths } from "@/api/paths";
import { percentToFraction } from "@/lib/amount-input";
import { formatPercent } from "@/lib/percent";
import { useI18n } from "@/i18n/provider";
import { UsuryNote } from "../credit/notes";
import { SelectField } from "../kit";
import { useConventionLabel } from "../conventions";
import { RateInput, SimulationStatus, SimulatorShell, useSimulation } from "./sim-kit";

/** Conversor de tasas (§3.9): una tasa en cualquier convención y todas sus equivalentes (nunca se divide una efectiva entre 12). */
export function RatesSimulator() {
  const { dict, locale } = useI18n();
  const convName = useConventionLabel();
  const t = dict.fin.sim.rates;
  const [rate, setRate] = useState("");
  const [convention, setConvention] = useState<RateConvention>("EA");
  const [days, setDays] = useState<"365" | "360">("365");
  const fraction = percentToFraction(rate);
  const sim = useSimulation<RateConvert>(paths.simulate("rates"), fraction === null ? null : { rate: fraction, convention, days_in_year: days === "360" ? 360 : 365 });
  return (
    <SimulatorShell route="simulador-tasas">
      <form className="fin-form" onSubmit={(event) => event.preventDefault()} noValidate>
        <RateInput rate={rate} onRate={setRate} convention={convention} onConvention={setConvention} error={rate.trim() !== "" && fraction === null ? dict.fin.cards.rateInvalid : null} />
        <SelectField label={t.daysInYear} hint={t.daysInYearHint} value={days} onChange={(v) => setDays(v as "365" | "360")} options={[{ value: "365", label: "365" }, { value: "360", label: "360" }]} />
      </form>
      <SimulationStatus sim={sim} incomplete={t.incomplete} />
      {sim.data && (
        <section aria-label={t.result} aria-busy={sim.loading}>
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">{t.result}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.equivalent}</th>
                  <th scope="col" className="table__num">{t.value}</th>
                </tr>
              </thead>
              <tbody>
                {sim.data.lines.map((line) => (
                  <tr key={line.convention}>
                    <th scope="row">{convName(line.convention)}{line.days_in_year ? ` (${line.days_in_year})` : ""}</th>
                    <td className="table__num tabular">{formatPercent(line.percent, locale, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <UsuryNote ea={sim.data.usury.ea} exceeded={sim.data.usury.exceeded} />
        </section>
      )}
    </SimulatorShell>
  );
}

"use client";

import { useState } from "react";
import type { AmortizationSystem, InstallmentSim } from "@/api/models";
import { paths } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { UsuryNote } from "../credit/notes";
import { SYSTEMS } from "../loans/loan-form";
import { AmountField, SelectField, TextArea, TextField } from "../kit";
import { buildInstallment, EMPTY_LOAN, type LoanInputs } from "./logic";
import { ExportButtons, RateInput, SimulationStatus, SimulatorShell, useSimulation } from "./sim-kit";
import { AmortizationRows, SummaryCards } from "./sim-views";

/** Tabla de amortización y cuota fija (§3.9): cuota, interés total, costo total (con seguro y cargos) y tabla con exportación. */
export function InstallmentSimulator() {
  const { dict } = useI18n();
  const t = dict.fin.sim.installment;
  const [input, setInput] = useState<LoanInputs>(EMPTY_LOAN);
  const [showAll, setShowAll] = useState(false);
  const set = <K extends keyof LoanInputs>(key: K) => (value: LoanInputs[K]) => setInput((prev) => ({ ...prev, [key]: value }));
  const built = buildInstallment(input);
  const sim = useSimulation<InstallmentSim>(paths.simulate("installment"), built.body);
  const bad = dict.fin.common.invalidAmount;
  return (
    <SimulatorShell route="simulador-amortizacion">
      <form className="fin-form" onSubmit={(event) => event.preventDefault()} noValidate>
        <AmountField label={dict.fin.loans.fields.principal} value={input.principal} onChange={set("principal")} />
        <RateInput rate={input.rate} onRate={set("rate")} convention={input.convention} onConvention={set("convention")} />
        <TextField label={dict.fin.loans.fields.term} help={dict.fin.help.texts.term} hint={t.termHint} value={input.term} onChange={set("term")} inputMode="numeric" maxLength={4} error={built.termProblem ? dict.fin.sim.termProblems[built.termProblem] : null} />
        <SelectField label={dict.fin.loans.fields.system} help={dict.fin.help.texts.system} hint={dict.fin.credit.form.systemHints[input.system]} value={input.system} onChange={(v) => set("system")(v as AmortizationSystem)} options={SYSTEMS.map((s) => ({ value: s, label: dict.fin.systems[s] }))} />
        {input.system === "custom" && <TextArea label={dict.fin.credit.form.customTitle} hint={dict.fin.credit.form.customHint} value={input.custom} onChange={set("custom")} rows={5} error={built.customProblem ? dict.fin.credit.form.customProblems[built.customProblem] : null} />}
        <div className="fin-grid-2">
          <AmountField label={dict.fin.loans.fields.insurance} help={dict.fin.help.texts.insurance} hint={t.insuranceHint} value={input.insurance} onChange={set("insurance")} error={input.insurance.trim() !== "" && !built.body && /[^\d.,\s$]/.test(input.insurance) ? bad : null} />
          <AmountField label={t.upfrontFees} hint={t.upfrontFeesHint} value={input.upfrontFees} onChange={set("upfrontFees")} />
        </div>
        <TextField label={t.firstDue} hint={t.firstDueHint} type="date" value={input.firstDue} onChange={set("firstDue")} />
      </form>
      <SimulationStatus sim={sim} incomplete={t.incomplete} />
      {sim.data && (
        <section aria-label={t.result} aria-busy={sim.loading} className="screen">
          <SummaryCards summary={sim.data.summary} />
          <UsuryNote ea={sim.data.usury.ea} exceeded={sim.data.usury.exceeded} />
          <AmortizationRows rows={sim.data.rows} showAll={showAll} onShowAll={() => setShowAll(true)} />
          {built.body && <ExportButtons body={built.body as unknown as Record<string, unknown>} />}
        </section>
      )}
    </SimulatorShell>
  );
}

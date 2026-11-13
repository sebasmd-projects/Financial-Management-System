"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Budget, BudgetDimension, BudgetPatch, BudgetPeriod } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { useSubmit } from "../hooks";
import { AmountField, Banner, FormActions, SelectField, TextField } from "../kit";
import { useLookups } from "./lookups";
import { budgetBody, DIMENSIONS, EMPTY_BUDGET, PERIODS, targetOptions, type BudgetInputs } from "./logic";

/** Crear un presupuesto (dimensión + límite + periodo) o, con `budget`, cambiar su límite, periodo, umbrales y nombre. Lo ejecutado nunca se guarda. */
export function BudgetForm({ budget, onDone, onCancel }: { budget?: Budget; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.plan.form;
  const submit = useSubmit();
  const lookups = useLookups();
  const editing = budget !== undefined;
  const [input, setInput] = useState<BudgetInputs>(
    budget
      ? { dimension: budget.dimension, target: budget.target_id, limit: budget.limit.replace(/\.00$/, ""), period: budget.period, customStart: budget.period === "custom" ? budget.period_start : "", customEnd: budget.period === "custom" ? budget.period_end : "", warn: String(budget.warn_percent), exceed: String(budget.exceed_percent), label: budget.label ?? "" }
      : EMPTY_BUDGET,
  );
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof BudgetInputs>(key: K) => (value: BudgetInputs[K]) => setInput((prev) => ({ ...prev, [key]: value }));
  const built = budgetBody(input);
  const options = targetOptions(input.dimension, lookups);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    const body = built.body;
    if (!body) return;
    if (editing) {
      const patch: BudgetPatch = { limit: body.limit, period: body.period, warn_percent: body.warn_percent, exceed_percent: body.exceed_percent, label: input.label.trim() || null, ...(body.period === "custom" ? { custom_start: body.custom_start, custom_end: body.custom_end } : {}) };
      const result = await submit.run(patch, () => api.patch(paths.budget(budget.id), patch, { locale }));
      if (result.ok) onDone();
      return;
    }
    const result = await submit.run(body, (key) => api.post(roots.budgets, body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  const req = dict.fin.common.requiredField;
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      {!editing && (
        <>
          <SelectField label={t.dimension} hint={t.dimensionHints[input.dimension]} value={input.dimension} onChange={(v) => setInput((prev) => ({ ...prev, dimension: v as BudgetDimension, target: "" }))} options={DIMENSIONS.map((d) => ({ value: d, label: dict.fin.plan.dimensions[d] }))} />
          <SelectField label={dict.fin.plan.dimensions[input.dimension]} value={input.target} onChange={set("target")} placeholder={t.pickOne} options={options} required error={touched && built.problems.target ? req : null} />
          {options.length === 0 && !lookups.loading && <p className="hint">{t.noTargets}</p>}
        </>
      )}
      <AmountField label={t.limit} value={input.limit} onChange={set("limit")} required error={touched && built.problems.limit ? dict.fin.common.invalidAmount : null} apiCode={submit.errorCode} />
      <SelectField label={t.period} value={input.period} onChange={(v) => set("period")(v as BudgetPeriod)} options={PERIODS.map((p) => ({ value: p, label: dict.fin.plan.periods[p] }))} />
      {input.period === "custom" && (
        <div className="fin-grid-2">
          <TextField label={t.customStart} type="date" value={input.customStart} onChange={set("customStart")} required error={touched && built.problems.dates ? t.datesProblem : null} />
          <TextField label={t.customEnd} type="date" value={input.customEnd} onChange={set("customEnd")} required />
        </div>
      )}
      <div className="fin-grid-2">
        <TextField label={t.warn} hint={t.warnHint} value={input.warn} onChange={set("warn")} inputMode="numeric" maxLength={3} error={touched && built.problems.thresholds ? t.thresholdsProblem : null} />
        <TextField label={t.exceed} value={input.exceed} onChange={set("exceed")} inputMode="numeric" maxLength={3} />
      </div>
      <TextField label={t.label} hint={t.labelHint} value={input.label} onChange={set("label")} maxLength={60} />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : editing ? dict.fin.common.save : t.create}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

"use client";

import type { Recurrence } from "@/api/models";
import { formatCop } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { AmountField, SelectField, TextField } from "../kit";
import { RATE_CONVENTIONS } from "../cards/cards-screen";
import { ADJUSTMENT_KINDS, LOAN_SYSTEMS, parseSignedAmount, type AdjustmentDraft, type AdjustmentField, type AdjustmentKind } from "./logic";

/** Los campos de UN ajuste según su tipo (lista cerrada): cada tipo pide solo los suyos. */
export function AdjustmentFields({ draft, onChange, recurrences, invalid, apiCode }: { draft: AdjustmentDraft; onChange: (patch: Partial<AdjustmentDraft>) => void; recurrences: readonly Recurrence[]; invalid: readonly AdjustmentField[]; apiCode?: string | null }) {
  const { dict } = useI18n();
  const t = dict.fin.scen.adj;
  const bad = dict.fin.common.invalidAmount;
  const err = (field: AdjustmentField, text: string) => (invalid.includes(field) ? text : null);
  const set = (field: AdjustmentField) => (value: string) => onChange({ [field]: value } as Partial<AdjustmentDraft>);
  return (
    <div className="fin-form">
      <SelectField label={t.kind} value={draft.kind} onChange={(kind) => onChange({ kind: kind as AdjustmentKind })} options={ADJUSTMENT_KINDS.map((k) => ({ value: k, label: t.kinds[k] }))} />
      <p className="hint">{t.hints[draft.kind]}</p>
      {draft.kind === "cancel_recurrence" && (
        <>
          <SelectField label={t.recurrence} value={draft.recurrence_id} onChange={set("recurrence_id")} placeholder={t.chooseRecurrence} options={recurrences.map((r) => ({ value: r.id, label: `${r.name} · ${formatCop(r.expected_amount)}` }))} error={err("recurrence_id", t.needsRecurrence)} />
          <TextField label={t.cancelFrom} type="date" value={draft.start} onChange={set("start")} required error={err("start", dict.fin.common.requiredField)} />
        </>
      )}
      {draft.kind === "change_income" && (
        <>
          <TextField label={t.monthlyDelta} hint={t.monthlyDeltaHint} value={draft.monthly_delta} onChange={set("monthly_delta")} inputMode="decimal" required error={err("monthly_delta", bad)} />
          {draft.monthly_delta.trim() !== "" && parseSignedAmount(draft.monthly_delta) !== null && <p className="fin-amount-preview tabular">{formatCop(parseSignedAmount(draft.monthly_delta)!, { sign: "always" })}</p>}
          <div className="fin-grid-2">
            <TextField label={t.from} type="date" value={draft.start} onChange={set("start")} required error={err("start", dict.fin.common.requiredField)} />
            <TextField label={t.until} hint={t.untilHint} type="date" value={draft.until} onChange={set("until")} error={err("until", t.invalidRange)} />
          </div>
        </>
      )}
      {draft.kind === "add_expense" && (
        <>
          <AmountField label={t.expenseAmount} value={draft.amount} onChange={set("amount")} required error={err("amount", bad)} apiCode={apiCode} />
          <div className="fin-grid-2">
            <TextField label={t.from} type="date" value={draft.start} onChange={set("start")} required error={err("start", dict.fin.common.requiredField)} />
            <TextField label={t.months} hint={t.monthsHint} value={draft.months} onChange={set("months")} inputMode="numeric" maxLength={3} error={err("months", t.invalidMonths)} />
          </div>
        </>
      )}
      {draft.kind === "add_loan" && (
        <>
          <AmountField label={t.principal} value={draft.principal} onChange={set("principal")} required error={err("principal", bad)} apiCode={apiCode} />
          <div className="fin-grid-2">
            <TextField label={dict.fin.loans.fields.rate} hint={dict.fin.cards.fields.rateHint} value={draft.rate} onChange={set("rate")} inputMode="decimal" required error={err("rate", dict.fin.cards.rateInvalid)} />
            <SelectField label={dict.fin.loans.fields.convention} value={draft.convention} onChange={set("convention")} options={RATE_CONVENTIONS.map((c) => ({ value: c, label: c }))} />
          </div>
          <div className="fin-grid-2">
            <TextField label={dict.fin.loans.fields.term} hint={dict.fin.loans.fields.termHint} value={draft.term} onChange={set("term")} inputMode="numeric" maxLength={3} required error={err("term", dict.fin.loans.termInvalid)} />
            <SelectField label={dict.fin.loans.fields.system} value={draft.system} onChange={set("system")} options={LOAN_SYSTEMS.map((s) => ({ value: s, label: dict.fin.systems[s] }))} />
          </div>
          <TextField label={t.firstPayment} type="date" value={draft.first_payment} onChange={set("first_payment")} required error={err("first_payment", dict.fin.common.requiredField)} />
          <AmountField label={dict.fin.loans.fields.insurance} hint={dict.fin.loans.fields.insuranceHint} value={draft.insurance} onChange={set("insurance")} error={err("insurance", bad)} apiCode={apiCode} />
          <TextField label={t.disbursedOn} hint={t.disbursedHint} type="date" value={draft.disbursed_on} onChange={set("disbursed_on")} error={err("disbursed_on", dict.fin.common.requiredField)} />
        </>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Loan, LoanKind } from "@/api/models";
import { paths } from "@/api/paths";
import { normalizeAmountInput } from "@/lib/amount-input";
import { toInt } from "@/lib/ints";
import { formatUnits } from "@/lib/decimal";
import { useI18n } from "@/i18n/provider";
import { amountToInput } from "../movements/movement-form";
import { useSubmit } from "../hooks";
import { AmountField, Banner, FormActions, SelectField, TextField } from "../kit";
import { parseUnits } from "../uvr/logic";
import { LOAN_KINDS } from "./loan-form";
import { BankQuoteResult, useBankQuote } from "./bank-quote";

/**
 * Editar un crédito: nombre, tipo, seguro y otros cargos mensuales, día de pago, plazo y desde cuándo corren los intereses. Solo se recalculan
 * las cuotas PENDIENTES (las pagadas no cambian). La tasa se cambia en «Tasas con vigencia». Con la «cuota que te cobra el banco» se calcula
 * el cargo mensual adicional y se guarda como seguro y otros cargos para que la cuota de la app coincida al centavo.
 */
export function LoanEditForm({ loan, onDone, onCancel }: { loan: Loan; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.loans;
  const o = dict.fin.own;
  const submit = useSubmit();
  const uvr = loan.unit === "UVR";
  const nextDay = loan.next_installment ? toInt(loan.next_installment.due_date.slice(8, 10), 1, 31) : null;
  const [name, setName] = useState(loan.name);
  const [kind, setKind] = useState<LoanKind>(loan.kind);
  const [insurance, setInsurance] = useState(amountToInput(loan.insurance));
  const [charges, setCharges] = useState(amountToInput(loan.other_charges));
  const [day, setDay] = useState(nextDay ? String(nextDay) : "");
  const [term, setTerm] = useState(String(loan.term));
  const [start, setStart] = useState(loan.interest_start ?? "");
  const [bank, setBank] = useState("");
  const [touched, setTouched] = useState(false);
  const active = loan.status === "active";

  const amount = (text: string) => (uvr ? parseUnits(text) : normalizeAmountInput(text));
  const insuranceValue = insurance.trim() === "" ? "0" : amount(insurance);
  const chargesValue = charges.trim() === "" ? "0" : amount(charges);
  const dayValue = day.trim() === "" ? null : toInt(day, 1, 31);
  const termValue = toInt(term, 1, 600);
  const bankValue = bank.trim() === "" ? null : normalizeAmountInput(bank);
  const bankQuote = useBankQuote(active && !uvr ? bankValue : null, active && !uvr ? { loan_id: loan.id } : null);
  const startBad = start !== "" && (start < loan.disbursement_date || start >= loan.first_due_date);
  const valid = name.trim() !== "" && insuranceValue !== null && chargesValue !== null && termValue !== null && (day.trim() === "" || dayValue !== null) && !startBad && !(bank.trim() !== "" && bankValue === null);

  function changes(): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (name.trim() !== loan.name) body.name = name.trim();
    if (kind !== loan.kind) body.kind = kind;
    if (active) {
      const ins = insuranceValue;
      const oth = chargesValue;
      if (ins !== null && ins !== amountToInput(loan.insurance)) body.insurance = ins;
      if (oth !== null && oth !== amountToInput(loan.other_charges)) body.other_charges = oth;
      if (dayValue !== null && dayValue !== nextDay) body.payment_day = dayValue;
      if (termValue !== null && termValue !== loan.term) body.term = termValue;
      if (start !== (loan.interest_start ?? "")) body.interest_start = start === "" ? null : start;
    }
    return body;
  }

  async function save(body: Record<string, unknown>) {
    if (Object.keys(body).length === 0) {
      onDone();
      return;
    }
    const result = await submit.run(body, (key) => api.patch<Loan>(paths.loan(loan.id), body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    await save(changes());
  }
  const bad = dict.fin.common.invalidAmount;
  return (
    <form onSubmit={onSubmit} noValidate className="fin-form">
      <TextField label={t.fields.name} value={name} onChange={setName} maxLength={80} required error={touched && name.trim() === "" ? dict.fin.common.requiredField : null} />
      <SelectField label={o.loan.kind} value={kind} onChange={(v) => setKind(v as LoanKind)} options={LOAN_KINDS.map((k) => ({ value: k, label: dict.fin.credit.kinds[k] }))} />
      {active && (
        <>
          <p className="hint">{o.loan.onlyPending}</p>
          <div className="fin-grid-2">
            {uvr ? (
              <>
                <TextField label={t.fields.insurance} value={insurance} onChange={setInsurance} inputMode="decimal" error={touched && insuranceValue === null ? dict.fin.uvr.invalidUnits : null} />
                <TextField label={dict.fin.credit.form.otherCharges} value={charges} onChange={setCharges} inputMode="decimal" error={touched && chargesValue === null ? dict.fin.uvr.invalidUnits : null} />
              </>
            ) : (
              <>
                <AmountField label={t.fields.insurance} hint={o.loan.insuranceHint} value={insurance} onChange={setInsurance} error={touched && insuranceValue === null ? bad : null} />
                <AmountField label={dict.fin.credit.form.otherCharges} hint={dict.fin.credit.form.otherChargesHint} value={charges} onChange={setCharges} error={touched && chargesValue === null ? bad : null} />
              </>
            )}
          </div>
          {uvr && <p className="hint tabular">{formatUnits(loan.insurance, "UVR")}</p>}
          {!uvr && (
            <>
              <AmountField label={o.bank.label} hint={o.bank.hint} value={bank} onChange={setBank} error={touched && bank.trim() !== "" && bankValue === null ? bad : null} />
              {bankValue !== null && (
                <BankQuoteResult
                  quote={bankQuote.quote}
                  pending={bankQuote.pending}
                  saving={submit.pending}
                  onSave={(extra) => void save({ ...changes(), insurance: extra, other_charges: "0" })}
                />
              )}
              {bankQuote.error && <Banner tone="negative">{(dict.fin.errors as Record<string, string>)[bankQuote.error] ?? dict.fin.errors.invalid}</Banner>}
            </>
          )}
          <div className="fin-grid-2">
            <TextField label={o.loan.payDay} hint={o.loan.payDayHint} value={day} onChange={setDay} inputMode="numeric" maxLength={2} error={touched && day.trim() !== "" && dayValue === null ? dict.fin.errors.invalid_day : null} />
            <TextField label={o.loan.term} hint={o.loan.termHint} value={term} onChange={setTerm} inputMode="numeric" maxLength={3} error={touched && termValue === null ? t.termInvalid : null} />
          </div>
          <TextField label={o.firstPeriod.interestStart} hint={o.firstPeriod.interestStartHint} type="date" value={start} onChange={setStart} error={startBad ? o.firstPeriod.invalid : null} />
          <p className="hint">{o.loan.rateNote}</p>
        </>
      )}
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : o.save}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

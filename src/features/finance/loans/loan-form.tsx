"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Account, AmortizationSystem, Institution, LoanKind } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { normalizeAmountInput, percentToFraction } from "@/lib/amount-input";
import { toInt } from "@/lib/ints";
import { formatCop } from "@/lib/money";
import { todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { RATE_CONVENTIONS, type RateConventionCode } from "../cards/cards-screen";
import { transferAccounts } from "../helpers";
import { useAll, useResource, useSubmit } from "../hooks";
import { AmountField, Banner, FormActions, SelectField, TextArea, TextField } from "../kit";
import { parseCustomCapitals } from "./loan-logic";

export const LOAN_KINDS: readonly LoanKind[] = ["personal", "free_investment", "mortgage", "educational", "vehicle"];
export const SYSTEMS: readonly AmortizationSystem[] = ["french", "constant_capital", "interest_only", "custom"];

/** Alta de un préstamo (§3.8): tipo, los cuatro sistemas de amortización (nunca se supone uno), seguro, otros cargos y tasa de mora con su fuente. */
export function LoanForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.loans;
  const c = dict.fin.credit;
  const submit = useSubmit();
  const accounts = useAll<Account>(paths.accounts());
  const institutions = useResource<Institution[]>(paths.institutions());
  const today = todayBogota();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LoanKind>("personal");
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("");
  const [convention, setConvention] = useState<RateConventionCode>("EM");
  const [rateSource, setRateSource] = useState("");
  const [term, setTerm] = useState("");
  const [system, setSystem] = useState<AmortizationSystem>("french");
  const [custom, setCustom] = useState("");
  const [insurance, setInsurance] = useState("");
  const [otherCharges, setOtherCharges] = useState("");
  const [lateRate, setLateRate] = useState("");
  const [lateConvention, setLateConvention] = useState<RateConventionCode>("EA");
  const [lateSource, setLateSource] = useState("");
  const [disbursement, setDisbursement] = useState(today);
  const [firstDue, setFirstDue] = useState("");
  const [paidInstallments, setPaidInstallments] = useState("");
  const [account, setAccount] = useState("");
  const [institution, setInstitution] = useState("");
  const [touched, setTouched] = useState(false);

  const principalValue = normalizeAmountInput(principal);
  const rateValue = percentToFraction(rate);
  const termValue = toInt(term, 1, 600);
  const insuranceValue = insurance.trim() === "" ? "0" : normalizeAmountInput(insurance);
  const chargesValue = otherCharges.trim() === "" ? "0" : normalizeAmountInput(otherCharges);
  const paidValue = paidInstallments.trim() === "" ? 0 : toInt(paidInstallments, 0, 599);
  const lateValue = lateRate.trim() === "" ? null : percentToFraction(lateRate);
  const lateBad = lateRate.trim() !== "" && lateValue === null;
  const lateNeedsSource = lateValue !== null && lateSource.trim() === "";
  const customParsed = system === "custom" ? parseCustomCapitals(custom, termValue, principalValue) : null;
  const valid =
    name.trim() !== "" && principalValue !== null && rateValue !== null && termValue !== null && insuranceValue !== null && chargesValue !== null && paidValue !== null && firstDue !== "" && !lateBad && !lateNeedsSource && (customParsed === null || customParsed.problem === null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const body = {
      name: name.trim(),
      kind,
      principal: principalValue!,
      rate: rateValue!,
      rate_convention: convention,
      term: termValue!,
      system,
      insurance: insuranceValue!,
      other_charges: chargesValue!,
      disbursement_date: disbursement,
      first_due_date: firstDue,
      ...(system === "custom" && customParsed?.capitals ? { custom_capitals: customParsed.capitals } : {}),
      ...(rateSource.trim() ? { rate_source: rateSource.trim() } : {}),
      ...(lateValue !== null ? { late_rate: lateValue, late_rate_convention: lateConvention, late_rate_source: lateSource.trim() } : {}),
      ...(paidValue ? { paid_installments: paidValue } : {}),
      ...(account ? { disbursement_account_id: account } : {}),
      ...(institution ? { institution_id: toInt(institution) } : {}),
    };
    const result = await submit.run(body, (key) => api.post(roots.loans, body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  const req = dict.fin.common.requiredField;
  const bad = dict.fin.common.invalidAmount;
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <TextField label={t.fields.name} value={name} onChange={setName} maxLength={80} required error={touched && name.trim() === "" ? req : null} />
      <SelectField label={c.form.kind} value={kind} onChange={(v) => setKind(v as LoanKind)} options={LOAN_KINDS.map((k) => ({ value: k, label: c.kinds[k] }))} />
      <SelectField label={t.fields.institution} value={institution} onChange={setInstitution} placeholder={dict.fin.accounts.noInstitution} options={(institutions.data ?? []).map((i) => ({ value: String(i.id), label: i.name }))} />
      <AmountField label={t.fields.principal} value={principal} onChange={setPrincipal} required error={touched && principalValue === null ? bad : null} preview={principalValue ? formatCop(principalValue) : null} />
      <div className="fin-grid-2">
        <TextField label={t.fields.rate} hint={dict.fin.cards.fields.rateHint} value={rate} onChange={setRate} inputMode="decimal" required error={touched && rateValue === null ? dict.fin.cards.rateInvalid : null} />
        <SelectField label={t.fields.convention} value={convention} onChange={(v) => setConvention(v as RateConventionCode)} options={RATE_CONVENTIONS.map((x) => ({ value: x, label: x }))} />
      </div>
      <TextField label={c.form.rateSource} hint={c.form.rateSourceHint} value={rateSource} onChange={setRateSource} maxLength={120} />
      <TextField label={t.fields.term} hint={t.fields.termHint} value={term} onChange={setTerm} inputMode="numeric" maxLength={3} required error={touched && termValue === null ? t.termInvalid : null} />
      <SelectField label={t.fields.system} hint={c.form.systemHints[system]} value={system} onChange={(v) => setSystem(v as AmortizationSystem)} options={SYSTEMS.map((s) => ({ value: s, label: dict.fin.systems[s] }))} />
      {system === "custom" && (
        <TextArea
          label={c.form.customTitle}
          hint={c.form.customHint}
          value={custom}
          onChange={setCustom}
          rows={6}
          error={touched && customParsed?.problem ? c.form.customProblems[customParsed.problem] : null}
        />
      )}
      <div className="fin-grid-2">
        <AmountField label={t.fields.insurance} hint={t.fields.insuranceHint} value={insurance} onChange={setInsurance} error={touched && insuranceValue === null ? bad : null} />
        <AmountField label={c.form.otherCharges} hint={c.form.otherChargesHint} value={otherCharges} onChange={setOtherCharges} error={touched && chargesValue === null ? bad : null} />
      </div>
      <fieldset className="fin-details">
        <legend>{c.form.lateTitle}</legend>
        <p className="hint">{c.form.lateHint}</p>
        <div className="fin-grid-2">
          <TextField label={c.form.lateRate} value={lateRate} onChange={setLateRate} inputMode="decimal" error={touched && lateBad ? dict.fin.cards.rateInvalid : null} />
          <SelectField label={t.fields.convention} value={lateConvention} onChange={(v) => setLateConvention(v as RateConventionCode)} options={RATE_CONVENTIONS.map((x) => ({ value: x, label: x }))} />
        </div>
        <TextField label={c.form.lateSource} hint={c.form.lateSourceHint} value={lateSource} onChange={setLateSource} maxLength={120} error={touched && lateNeedsSource ? dict.fin.errors.late_rate_needs_source : null} />
      </fieldset>
      <div className="fin-grid-2">
        <TextField label={t.fields.disbursementDate} type="date" value={disbursement} onChange={setDisbursement} required />
        <TextField label={t.fields.firstDue} type="date" value={firstDue} onChange={setFirstDue} required error={touched && firstDue === "" ? req : null} />
      </div>
      <TextField label={t.fields.paidInstallments} hint={t.fields.paidHint} value={paidInstallments} onChange={setPaidInstallments} inputMode="numeric" maxLength={3} error={touched && paidValue === null ? t.termInvalid : null} />
      <SelectField label={t.fields.disbursementAccount} hint={t.fields.disbursementAccountHint} value={account} onChange={setAccount} placeholder={t.noAccount} options={transferAccounts(accounts.items).filter((a) => a.kind !== "credit_card").map((a) => ({ value: a.id, label: a.name }))} />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : t.create}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

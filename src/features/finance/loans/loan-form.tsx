"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Account, AmortizationSystem, Institution, Loan, LoanIndex, LoanKind, LoanUnit } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { normalizeAmountInput, percentToFraction } from "@/lib/amount-input";
import { toInt } from "@/lib/ints";
import { formatUnits } from "@/lib/decimal";
import { todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { ConventionSelect, type RateConventionCode } from "../conventions";
import { transferAccounts } from "../helpers";
import { useAll, useResource, useSubmit } from "../hooks";
import { AmountField, Banner, FormActions, SelectField, TextArea, TextField } from "../kit";
import { INDEX_KEYS, parseUnits, variableRateBody } from "../uvr/logic";
import { RegisterIndexLink } from "../uvr/pending";
import { UsuryRateCheck } from "../credit/usury-check";
import { parseCustomCapitals } from "./loan-logic";

export const LOAN_KINDS: readonly LoanKind[] = ["personal", "free_investment", "mortgage", "educational", "vehicle"];
export const SYSTEMS: readonly AmortizationSystem[] = ["french", "constant_capital", "interest_only", "custom"];

/** Alta de un préstamo (§3.8): tipo, los cuatro sistemas de amortización (nunca se supone uno), seguro, otros cargos y tasa de mora con su fuente. */
export function LoanForm({ onDone, onCancel }: { onDone: (loan?: Loan) => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.loans;
  const c = dict.fin.credit;
  const u = dict.fin.uvr;
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
  const [unit, setUnit] = useState<LoanUnit>("COP");
  const [variable, setVariable] = useState(false);
  const [indexKey, setIndexKey] = useState<LoanIndex>("DTF_EA");
  const [margin, setMargin] = useState("");
  const [touched, setTouched] = useState(false);

  // En UVR el capital, el seguro y los otros cargos son UNIDADES (hasta 4 decimales), no pesos: otro lector de texto.
  const uvr = unit === "UVR";
  const amount = (text: string) => (uvr ? parseUnits(text) : normalizeAmountInput(text));
  const principalValue = amount(principal);
  const variableRate = variableRateBody(variable, indexKey, margin);
  // Con tasa variable la tasa la pone el índice de la fecha de desembolso más el margen: el servidor ignora la que se envíe.
  const rateValue = variable ? (variableRate.problem === null ? "0" : null) : percentToFraction(rate);
  const termValue = toInt(term, 1, 600);
  const insuranceValue = insurance.trim() === "" ? "0" : amount(insurance);
  const chargesValue = otherCharges.trim() === "" ? "0" : amount(otherCharges);
  const paidValue = paidInstallments.trim() === "" ? 0 : toInt(paidInstallments, 0, 599);
  const lateValue = lateRate.trim() === "" ? null : percentToFraction(lateRate);
  const lateBad = lateRate.trim() !== "" && lateValue === null;
  const lateNeedsSource = lateValue !== null && lateSource.trim() === "";
  const customParsed = system === "custom" && !uvr ? parseCustomCapitals(custom, termValue, principalValue) : null;
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
      rate_convention: variable ? "EA" : convention,
      ...(uvr ? { unit } : {}),
      ...variableRate.body,
      term: termValue!,
      system,
      insurance: insuranceValue!,
      other_charges: chargesValue!,
      disbursement_date: disbursement,
      first_due_date: firstDue,
      ...(system === "custom" && customParsed?.capitals ? { custom_capitals: customParsed.capitals } : {}),
      ...(rateSource.trim() && !variable ? { rate_source: rateSource.trim() } : {}),
      ...(lateValue !== null ? { late_rate: lateValue, late_rate_convention: lateConvention, late_rate_source: lateSource.trim() } : {}),
      ...(paidValue ? { paid_installments: paidValue } : {}),
      ...(account ? { disbursement_account_id: account } : {}),
      ...(institution ? { institution_id: toInt(institution) } : {}),
    };
    const result = await submit.run(body, (key) => api.post<Loan>(roots.loans, body, { idempotencyKey: key, locale }));
    if (result.ok) onDone(result.data);
  }
  const req = dict.fin.common.requiredField;
  const bad = dict.fin.common.invalidAmount;
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <TextField label={t.fields.name} value={name} onChange={setName} maxLength={80} required error={touched && name.trim() === "" ? req : null} />
      <SelectField label={c.form.kind} value={kind} onChange={(v) => setKind(v as LoanKind)} options={LOAN_KINDS.map((k) => ({ value: k, label: c.kinds[k] }))} />
      <SelectField label={t.fields.institution} value={institution} onChange={setInstitution} placeholder={dict.fin.accounts.noInstitution} options={(institutions.data ?? []).map((i) => ({ value: String(i.id), label: i.name }))} />
      <SelectField label={u.unit} help={dict.fin.help.texts.uvr} hint={uvr ? u.unitUvrHint : u.unitCopHint} value={unit} onChange={(v) => setUnit(v as LoanUnit)} options={[{ value: "COP", label: u.units.COP }, { value: "UVR", label: u.units.UVR }]} />
      {uvr ? (
        <TextField label={u.principalUnits} hint={u.unitsInputHint} value={principal} onChange={setPrincipal} inputMode="decimal" required error={touched && principalValue === null ? u.invalidUnits : null} />
      ) : (
        <AmountField label={t.fields.principal} value={principal} onChange={setPrincipal} required error={touched && principalValue === null ? bad : null} />
      )}
      {uvr && principalValue && <p className="fin-amount-preview tabular" aria-live="polite">{formatUnits(principalValue, "UVR")}</p>}
      {uvr && <p className="hint">{u.needsUvr} <RegisterIndexLink /></p>}
      <SelectField label={u.rateKind} help={dict.fin.help.texts.indexMargin} value={variable ? "variable" : "fixed"} onChange={(v) => setVariable(v === "variable")} options={[{ value: "fixed", label: u.rateFixed }, { value: "variable", label: u.rateVariable }]} />
      {variable ? (
        <>
          <div className="fin-grid-2">
            <SelectField label={u.index} help={dict.fin.help.texts.indexMargin} value={indexKey} onChange={(v) => setIndexKey(v as LoanIndex)} options={INDEX_KEYS.map((k) => ({ value: k, label: u.indices[k] }))} />
            <TextField label={u.margin} help={dict.fin.help.texts.indexMargin} hint={u.marginHint} value={margin} onChange={setMargin} inputMode="decimal" required error={touched && variableRate.problem ? dict.fin.cards.rateInvalid : null} />
          </div>
          <p className="hint">{u.variableHint} <RegisterIndexLink indexKey={indexKey} /></p>
        </>
      ) : (
        <>
          <div className="fin-grid-2">
            <TextField label={t.fields.rate} help={dict.fin.help.texts.rate} hint={dict.fin.cards.fields.rateHint} value={rate} onChange={setRate} inputMode="decimal" required error={touched && rateValue === null ? dict.fin.cards.rateInvalid : null} />
            <ConventionSelect label={t.fields.convention} value={convention} onChange={setConvention} />
          </div>
          <UsuryRateCheck rate={rateValue} convention={convention} on={disbursement} />
          <TextField label={c.form.rateSource} hint={c.form.rateSourceHint} value={rateSource} onChange={setRateSource} maxLength={120} />
        </>
      )}
      <TextField label={t.fields.term} help={dict.fin.help.texts.term} hint={t.fields.termHint} value={term} onChange={setTerm} inputMode="numeric" maxLength={3} required error={touched && termValue === null ? t.termInvalid : null} />
      <SelectField label={t.fields.system} help={dict.fin.help.texts.system} hint={c.form.systemHints[system]} value={system} onChange={(v) => setSystem(v as AmortizationSystem)} options={SYSTEMS.filter((s) => !(uvr && s === "custom")).map((s) => ({ value: s, label: dict.fin.systems[s] }))} />
      {system === "custom" && !uvr && (
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
        {uvr ? (
          <>
            <TextField label={t.fields.insurance} help={dict.fin.help.texts.insurance} hint={u.insuranceUnitsHint} value={insurance} onChange={setInsurance} inputMode="decimal" error={touched && insuranceValue === null ? u.invalidUnits : null} />
            <TextField label={c.form.otherCharges} help={dict.fin.help.texts.handlingFee} hint={u.insuranceUnitsHint} value={otherCharges} onChange={setOtherCharges} inputMode="decimal" error={touched && chargesValue === null ? u.invalidUnits : null} />
          </>
        ) : (
          <>
            <AmountField label={t.fields.insurance} help={dict.fin.help.texts.insurance} hint={t.fields.insuranceHint} value={insurance} onChange={setInsurance} error={touched && insuranceValue === null ? bad : null} />
            <AmountField label={c.form.otherCharges} help={dict.fin.help.texts.handlingFee} hint={c.form.otherChargesHint} value={otherCharges} onChange={setOtherCharges} error={touched && chargesValue === null ? bad : null} />
          </>
        )}
      </div>
      <fieldset className="fin-details">
        <legend>{c.form.lateTitle}</legend>
        <p className="hint">{c.form.lateHint}</p>
        <div className="fin-grid-2">
          <TextField label={c.form.lateRate} value={lateRate} onChange={setLateRate} inputMode="decimal" error={touched && lateBad ? dict.fin.cards.rateInvalid : null} />
          <ConventionSelect label={t.fields.convention} value={lateConvention} onChange={setLateConvention} />
        </div>
        <TextField label={c.form.lateSource} hint={c.form.lateSourceHint} value={lateSource} onChange={setLateSource} maxLength={120} error={touched && lateNeedsSource ? dict.fin.errors.late_rate_needs_source : null} />
      </fieldset>
      <div className="fin-grid-2">
        <TextField label={t.fields.disbursementDate} type="date" value={disbursement} onChange={setDisbursement} required />
        <TextField label={t.fields.firstDue} type="date" value={firstDue} onChange={setFirstDue} required error={touched && firstDue === "" ? req : null} />
      </div>
      <TextField label={t.fields.paidInstallments} hint={t.fields.paidHint} value={paidInstallments} onChange={setPaidInstallments} inputMode="numeric" maxLength={3} error={touched && paidValue === null ? t.termInvalid : null} />
      <SelectField label={t.fields.disbursementAccount} hint={t.fields.disbursementAccountHint} value={account} onChange={setAccount} placeholder={t.noAccount} options={transferAccounts(accounts.items).filter((a) => a.kind !== "credit_card").map((a) => ({ value: a.id, label: a.name }))} />
      {submit.error && (
        <Banner tone="negative" live="assertive">
          {submit.error}
          {submit.errorCode === "index_missing" && (
            <>
              {" "}
              <RegisterIndexLink indexKey={variable ? indexKey : undefined} />
            </>
          )}
        </Banner>
      )}
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

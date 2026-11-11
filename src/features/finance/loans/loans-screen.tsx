"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { Account, Institution, Loan } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { normalizeAmountInput, percentToFraction } from "@/lib/amount-input";
import { toInt } from "@/lib/ints";
import { formatCop } from "@/lib/money";
import { formatDate, todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { RATE_CONVENTIONS, type RateConventionCode } from "../cards/cards-screen";
import { transferAccounts } from "../helpers";
import { useAll, useHref, useResource, useSubmit } from "../hooks";
import { AmountField, Badge, Banner, Empty, ErrorState, FormActions, Loading, Modal, Money, Progress, ScreenHeader, SelectField, TextField } from "../kit";

/** Préstamos (`/creditos`, diseño §3.8): saldo, avance, próxima cuota y alta. */
export function LoansScreen() {
  const { dict } = useI18n();
  const t = dict.fin.loans;
  const href = useHref();
  const loans = useAll<Loan>(paths.loans());
  const [creating, setCreating] = useState(false);
  return (
    <div className="screen">
      <ScreenHeader
        title={dict.screens.creditos}
        eyebrow={dict.nav.sections.creditos}
        actions={
          <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={20} />
            {t.add}
          </button>
        }
      />
      {loans.loading && !loans.data && <Loading />}
      {loans.failure && <ErrorState message={dict.fin.errors.generic} onRetry={loans.reload} />}
      {loans.data && loans.items.length === 0 && (
        <Empty
          icon="loan"
          title={t.emptyTitle}
          body={t.emptyBody}
          action={
            <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
              {t.add}
            </button>
          }
        />
      )}
      {loans.items.length > 0 && (
        <ul className="fin-list">
          {loans.items.map((loan) => (
            <li key={loan.id}>
              <Link href={href("credito", [loan.id])} className="fin-row fin-row--loan">
                <span className="fin-row__main">
                  <span className="fin-row__title">{loan.name}</span>
                  <span className="fin-row__sub muted">
                    {t.balance} <Money value={loan.balance} /> {t.of} <Money value={loan.principal} />
                  </span>
                  <Progress percent={loan.paid_percent} label={`${t.paidPercent}: ${loan.paid_percent}%`} tone="positive" />
                  <span className="fin-row__sub muted">
                    {loan.next_installment ? (
                      <>
                        {t.installment} <Money value={loan.next_installment.payment} /> · {t.next} {formatDate(loan.next_installment.adjusted_due_date)}
                      </>
                    ) : (
                      t.noNext
                    )}
                  </span>
                  {loan.status === "paid" && (
                    <span className="fin-row__badges">
                      <Badge tone="positive">{t.paidOff}</Badge>
                    </span>
                  )}
                </span>
                <Icon name="chevron-right" size={20} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Modal open={creating} title={t.add} onClose={() => setCreating(false)}>
        <LoanForm
          onCancel={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            loans.reload();
          }}
        />
      </Modal>
    </div>
  );
}

function LoanForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.loans;
  const submit = useSubmit();
  const accounts = useAll<Account>(paths.accounts());
  const institutions = useResource<Institution[]>(paths.institutions());
  const today = todayBogota();
  const [name, setName] = useState("");
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("");
  const [convention, setConvention] = useState<RateConventionCode>("EM");
  const [term, setTerm] = useState("");
  const [system, setSystem] = useState<"french" | "constant_capital">("french");
  const [insurance, setInsurance] = useState("");
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
  const paidValue = paidInstallments.trim() === "" ? 0 : toInt(paidInstallments, 0, 599);
  const valid = name.trim() !== "" && principalValue !== null && rateValue !== null && termValue !== null && insuranceValue !== null && paidValue !== null && firstDue !== "";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const body = {
      name: name.trim(),
      principal: principalValue!,
      rate: rateValue!,
      rate_convention: convention,
      term: termValue!,
      system,
      insurance: insuranceValue!,
      disbursement_date: disbursement,
      first_due_date: firstDue,
      ...(paidValue ? { paid_installments: paidValue } : {}),
      ...(account ? { disbursement_account_id: account } : {}),
      ...(institution ? { institution_id: toInt(institution) } : {}),
    };
    const result = await submit.run(body, (key) => api.post(roots.loans, body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  const req = dict.fin.common.requiredField;
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <TextField label={t.fields.name} value={name} onChange={setName} maxLength={80} required error={touched && name.trim() === "" ? req : null} />
      <SelectField label={t.fields.institution} value={institution} onChange={setInstitution} placeholder={dict.fin.accounts.noInstitution} options={(institutions.data ?? []).map((i) => ({ value: String(i.id), label: i.name }))} />
      <AmountField label={t.fields.principal} value={principal} onChange={setPrincipal} required error={touched && principalValue === null ? dict.fin.common.invalidAmount : null} preview={principalValue ? formatCop(principalValue) : null} />
      <div className="fin-grid-2">
        <TextField label={t.fields.rate} hint={dict.fin.cards.fields.rateHint} value={rate} onChange={setRate} inputMode="decimal" required error={touched && rateValue === null ? dict.fin.cards.rateInvalid : null} />
        <SelectField label={t.fields.convention} value={convention} onChange={(v) => setConvention(v as RateConventionCode)} options={RATE_CONVENTIONS.map((c) => ({ value: c, label: c }))} />
      </div>
      <TextField label={t.fields.term} hint={t.fields.termHint} value={term} onChange={setTerm} inputMode="numeric" maxLength={3} required error={touched && termValue === null ? t.termInvalid : null} />
      <SelectField
        label={t.fields.system}
        hint={t.fields.systemHint}
        value={system}
        onChange={(v) => setSystem(v as "french" | "constant_capital")}
        options={[
          { value: "french", label: dict.fin.systems.french },
          { value: "constant_capital", label: dict.fin.systems.constant_capital },
        ]}
      />
      <AmountField label={t.fields.insurance} hint={t.fields.insuranceHint} value={insurance} onChange={setInsurance} error={touched && insuranceValue === null ? dict.fin.common.invalidAmount : null} />
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

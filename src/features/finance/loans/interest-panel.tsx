"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Account, Loan, LoanInterestPayments } from "@/api/models";
import { paths } from "@/api/paths";
import { normalizeAmountInput } from "@/lib/amount-input";
import { formatDate, todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { fill, transferAccounts } from "../helpers";
import { useAll, useResource, useSubmit } from "../hooks";
import { AmountField, Banner, ErrorState, FormActions, Loading, Modal, Money, Section, SelectField, TextField } from "../kit";

/**
 * Intereses del periodo inicial: lo que el banco cobra aparte antes de la primera cuota (varios débitos, cada uno con el periodo que cubre).
 * Es gasto «Intereses» desde la cuenta que paga y NO baja el capital. Muestra también «Intereses pagados» en total.
 */
export function PrepaidInterestPanel({ loan, canWrite, onChanged }: { loan: Loan; canWrite: boolean; onChanged: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.own.prepaid;
  const list = useResource<LoanInterestPayments>(loan.unit === "UVR" ? null : paths.loanInterestPayments(loan.id));
  const [adding, setAdding] = useState(false);
  if (loan.unit === "UVR") return null;
  return (
    <Section
      title={t.title}
      aside={
        canWrite && loan.status === "active" ? (
          <button type="button" className="button button--ghost" onClick={() => setAdding(true)}>
            {t.add}
          </button>
        ) : undefined
      }
    >
      <p className="muted">{t.intro}</p>
      {list.loading && !list.data && <Loading />}
      {list.failure && <ErrorState message={dict.fin.errors.generic} onRetry={list.reload} />}
      {list.data && list.data.payments.length === 0 && <p className="muted">{t.none}</p>}
      {list.data && list.data.payments.length > 0 && (
        <ul className="fin-list">
          {list.data.payments.map((p) => (
            <li key={p.id} className="fin-row fin-row--static">
              <span className="fin-row__main">
                <span className="fin-row__title">{formatDate(p.date)}</span>
                <span className="fin-row__sub muted">{fill(t.covers, { from: formatDate(p.covers_from), to: formatDate(p.covers_to) })}</span>
              </span>
              <Money value={p.amount} />
            </li>
          ))}
        </ul>
      )}
      <dl className="fin-kpis">
        <div className="fin-kpi">
          <dt className="muted">{t.total}</dt>
          <dd className="fin-kpi__value">
            <Money value={loan.interest_prepaid} />
          </dd>
        </div>
        <div className="fin-kpi">
          <dt className="muted">{t.paidTotal}</dt>
          <dd className="fin-kpi__value">
            <Money value={loan.interest_paid_total} />
          </dd>
        </div>
      </dl>
      <Modal open={adding} title={t.add} onClose={() => setAdding(false)}>
        <InterestForm
          loan={loan}
          onCancel={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            list.reload();
            onChanged();
          }}
        />
      </Modal>
    </Section>
  );
}

function InterestForm({ loan, onDone, onCancel }: { loan: Loan; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.own.prepaid;
  const submit = useSubmit();
  const accounts = useAll<Account>(paths.accounts());
  const sources = transferAccounts(accounts.items).filter((a) => a.kind !== "credit_card");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayBogota());
  const [from, setFromDate] = useState(loan.disbursement_date);
  const [to, setToDate] = useState(loan.interest_start ? previousDay(loan.interest_start) : loan.disbursement_date);
  const [account, setAccount] = useState("");
  const [touched, setTouched] = useState(false);
  const value = normalizeAmountInput(amount);
  const accountId = account || sources[0]?.id || "";
  const valid = value !== null && value !== "0" && accountId !== "" && date !== "" && from !== "" && to !== "" && to >= from;
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const body = { from_account_id: accountId, date, amount: value!, covers_from: from, covers_to: to };
    const result = await submit.run(body, (key) => api.post<LoanInterestPayments>(paths.loanInterestPayments(loan.id), body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} noValidate className="fin-form">
      <AmountField label={t.amount} hint={t.hint} value={amount} onChange={setAmount} required error={touched && (value === null || value === "0") ? dict.fin.common.invalidAmount : null} />
      <TextField label={t.date} type="date" value={date} onChange={setDate} required />
      <div className="fin-grid-2">
        <TextField label={t.coversFrom} type="date" value={from} onChange={setFromDate} required />
        <TextField label={t.coversTo} type="date" value={to} onChange={setToDate} required error={touched && to < from ? dict.fin.errors.invalid_interest_payment : null} />
      </div>
      <SelectField label={t.payFrom} value={accountId} onChange={setAccount} options={sources.map((a) => ({ value: a.id, label: a.name }))} />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : t.submit}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

/** El día anterior a una fecha `AAAA-MM-DD` (calendario civil, sin zona horaria). */
function previousDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - 1));
  return date.toISOString().slice(0, 10);
}

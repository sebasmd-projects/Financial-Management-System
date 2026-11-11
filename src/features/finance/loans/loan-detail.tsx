"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { Account, Loan, LoanInstallment, Movement } from "@/api/models";
import { paths } from "@/api/paths";
import { fractionToPercent, normalizeAmountInput } from "@/lib/amount-input";
import { addAmounts } from "@/lib/money";
import { daysBetween, formatDate, todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { amountToInput } from "../movements/movement-form";
import { relativeDays, transferAccounts } from "../helpers";
import { useAll, useHref, useResource, useSubmit } from "../hooks";
import { AmountField, Badge, Banner, DefinitionList, ErrorState, FormActions, Loading, Modal, Money, Progress, ScreenHeader, Section, SelectField, TextField } from "../kit";

/** Un préstamo (`/creditos/[id]`): saldo, avance, próxima cuota con su reparto y «Pagar cuota». */
export function LoanDetail({ id }: { id: string }) {
  const { dict } = useI18n();
  const t = dict.fin.loans;
  const href = useHref();
  const loan = useResource<Loan>(paths.loan(id));
  const [paying, setPaying] = useState(false);
  const back = { href: href("creditos"), label: dict.screens.creditos };

  if (loan.loading && !loan.data) return <div className="screen"><ScreenHeader title={dict.screens.credito} back={back} /><Loading /></div>;
  if (loan.failure || !loan.data) {
    return (
      <div className="screen">
        <ScreenHeader title={dict.screens.credito} back={back} />
        <ErrorState message={loan.failure?.status === 404 ? dict.fin.errors.notFound : dict.fin.errors.generic} onRetry={loan.reload} />
      </div>
    );
  }
  const l = loan.data;
  const next = l.next_installment;
  const today = todayBogota();
  return (
    <div className="screen">
      <ScreenHeader title={l.name} eyebrow={dict.screens.credito} back={back} actions={l.status === "paid" ? <Badge tone="positive">{t.paidOff}</Badge> : undefined} />
      <section className="fin-card" aria-label={t.balance}>
        <p className="muted">
          {t.balance} <Money value={l.balance} /> {t.of} <Money value={l.principal} />
        </p>
        <Progress percent={l.paid_percent} label={`${t.paidPercent}: ${l.paid_percent}%`} tone="positive" />
        <p className="muted">
          {l.paid_percent}% {t.paidPercentSuffix} · {t.installmentsPaid.replace("{n}", String(l.installments_paid)).replace("{total}", String(l.term))}
        </p>
        {next && l.status === "active" && (
          <>
            <p className="fin-big">
              <span className="muted fin-big__label">{t.installment}</span> <Money value={next.payment} />
            </p>
            <p className="muted">
              {t.next} {formatDate(next.adjusted_due_date)} ({relativeDays(daysBetween(today, next.adjusted_due_date), dict.fin.relative)})
            </p>
            <p className="muted">
              {t.split.capital} <Money value={next.capital} /> · {t.split.interest} <Money value={next.interest} /> · {t.split.insurance} <Money value={next.insurance} />
            </p>
            <button type="button" className="button button--primary" onClick={() => setPaying(true)}>
              {t.payInstallment}
            </button>
          </>
        )}
      </section>
      <div className="actions">
        <Link className="button button--ghost" href={href("credito-tabla", [l.id])}>
          {t.table}
        </Link>
        <Link className="button button--ghost" href={`${href("movimientos")}?cuenta=${encodeURIComponent(l.account_id)}`}>
          {t.viewMovements}
        </Link>
      </div>
      <Section title={t.data}>
        <DefinitionList
          rows={[
            { label: t.fields.rate, value: `${fractionToPercent(l.rate)} % ${l.rate_convention}` },
            { label: t.fields.system, value: dict.fin.systems[l.system] ?? l.system },
            { label: t.fields.term, value: String(l.term) },
            { label: t.fields.insurance, value: <Money value={l.insurance} /> },
          ]}
        />
      </Section>
      {next && (
        <Modal open={paying} title={t.payInstallment} onClose={() => setPaying(false)}>
          <PayForm
            loanId={l.id}
            installment={next}
            onCancel={() => setPaying(false)}
            onDone={() => {
              setPaying(false);
              loan.reload();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

/** El reparto viene precalculado de la tabla y se puede editar (si el banco cobró distinto). */
function PayForm({ loanId, installment, onDone, onCancel }: { loanId: string; installment: LoanInstallment; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.loans;
  const submit = useSubmit();
  const accounts = useAll<Account>(paths.accounts());
  const [capital, setCapital] = useState(amountToInput(installment.capital));
  const [interest, setInterest] = useState(amountToInput(installment.interest));
  const [insurance, setInsurance] = useState(amountToInput(installment.insurance));
  const [fees, setFees] = useState("");
  const [date, setDate] = useState(todayBogota());
  const [fromAccount, setFromAccount] = useState("");
  const sources = transferAccounts(accounts.items).filter((a) => a.kind !== "credit_card");
  const from = fromAccount || sources[0]?.id || "";

  const parts = { capital: normalizeAmountInput(capital || "0"), interest: normalizeAmountInput(interest || "0"), insurance: normalizeAmountInput(insurance || "0"), fees: normalizeAmountInput(fees || "0") };
  const valid = parts.capital !== null && parts.interest !== null && parts.insurance !== null && parts.fees !== null && from !== "";
  const total = valid ? addAmounts(parts.capital!, parts.interest!, parts.insurance!, parts.fees!) : null;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    const body = { from_account_id: from, date, capital: parts.capital!, interest: parts.interest!, insurance: parts.insurance!, fees: parts.fees! };
    const result = await submit.run(body, (key) => api.post<Movement>(paths.loanPay(loanId, installment.number), body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  const bad = dict.fin.common.invalidAmount;
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <p className="muted">{t.payIntro.replace("{n}", String(installment.number))}</p>
      <AmountField label={t.split.capital} value={capital} onChange={setCapital} error={parts.capital === null ? bad : null} />
      <AmountField label={t.split.interest} value={interest} onChange={setInterest} error={parts.interest === null ? bad : null} />
      <AmountField label={t.split.insurance} value={insurance} onChange={setInsurance} error={parts.insurance === null ? bad : null} />
      <AmountField label={t.split.fees} value={fees} onChange={setFees} error={parts.fees === null ? bad : null} />
      {total && (
        <p className="fin-phrase">
          {t.total} <Money value={total} />
        </p>
      )}
      <SelectField label={t.fields.payFrom} value={from} onChange={setFromAccount} options={sources.map((a) => ({ value: a.id, label: a.name }))} />
      <TextField label={dict.fin.form.date} type="date" value={date} onChange={setDate} required />
      <p className="hint">{t.payHint}</p>
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending || !valid}>
          {submit.pending ? dict.fin.common.saving : t.payInstallment}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

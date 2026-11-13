"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { Account, LateQuote, Loan, LoanInstallment, Movement } from "@/api/models";
import { paths } from "@/api/paths";
import { fractionToPercent, normalizeAmountInput } from "@/lib/amount-input";
import { formatRate, formatUnits } from "@/lib/decimal";
import { addAmounts } from "@/lib/money";
import { daysBetween, formatDate, todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { amountToInput } from "../movements/movement-form";
import { fill, relativeDays, transferAccounts } from "../helpers";
import { LatePanel } from "../credit/late-panel";
import { RateMissingNotice } from "../credit/notes";
import { RatesPanel } from "./rates-panel";
import { useAll, useHref, useResource, useSubmit } from "../hooks";
import { useConventionLabel } from "../conventions";
import { AmountField, Badge, Banner, DefinitionList, ErrorState, FormActions, Loading, Modal, Money, Progress, ScreenHeader, Section, SelectField, TextField } from "../kit";
import { indexOf, isUvr, pesoEstimate } from "../uvr/logic";
import { PendingAmount, RegisterIndexLink } from "../uvr/pending";
import { IndexValues, useValuation, ValuationPanel, VariableRatePanel } from "../uvr/panels";

/** Un préstamo (`/creditos/[id]`): saldo, avance, próxima cuota con su reparto y «Pagar cuota». */
export function LoanDetail({ id }: { id: string }) {
  const { dict } = useI18n();
  const convName = useConventionLabel();
  const t = dict.fin.loans;
  const href = useHref();
  const loan = useResource<Loan>(paths.loan(id));
  const [paying, setPaying] = useState(false);
  // UVR: el saldo en pesos y la estimación de la cuota salen de la UVR de la fecha consultada (hoy por defecto).
  const [valuationOn, setValuationOn] = useState(todayBogota());
  const uvrLoan = loan.data ? isUvr(loan.data) : false;
  const valuation = useValuation(id, valuationOn, uvrLoan);
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
  const uvr = isUvr(l);
  const index = indexOf(l);
  const uvrNow = valuation.data?.uvr_value ?? null;
  return (
    <div className="screen">
      <ScreenHeader title={l.name} eyebrow={dict.screens.credito} back={back} actions={l.status === "paid" ? <Badge tone="positive">{t.paidOff}</Badge> : undefined} />
      {(uvr || index) && (
        <p className="fin-row__badges">
          {uvr && <Badge tone="info">{dict.fin.uvr.units.UVR}</Badge>}
          {index && <Badge tone="info">{dict.fin.uvr.variableBadge}</Badge>}
        </p>
      )}
      <section className="fin-card" aria-label={t.balance}>
        <p className="muted">
          {t.balance} <Money value={l.balance} /> {t.of} {uvr ? <span className="tabular">{formatUnits(l.principal, "UVR")}</span> : <Money value={l.principal} />}
        </p>
        {uvr && <p className="hint">{dict.fin.uvr.ledgerNote}</p>}
        <Progress percent={l.paid_percent} label={`${t.paidPercent}: ${l.paid_percent}%`} tone="positive" />
        <p className="muted">
          {l.paid_percent}% {t.paidPercentSuffix} · {t.installmentsPaid.replace("{n}", String(l.installments_paid)).replace("{total}", String(l.term))}
        </p>
        {next && l.status === "active" && (
          <>
            <p className="fin-big">
              <span className="muted fin-big__label">{t.installment}</span> {uvr ? <span className="tabular">{formatUnits(next.payment, "UVR")}</span> : <Money value={next.payment} />}
            </p>
            {uvr && (
              <p className="muted" data-testid="installment-estimate">
                {pesoEstimate(next.payment, uvrNow) !== null && valuation.data ? (
                  <>
                    <Money value={pesoEstimate(next.payment, uvrNow)!} estimated /> · {fill(dict.fin.uvr.estimateWith, { uvr: formatRate(uvrNow!), date: formatDate(valuation.data.on) })}
                  </>
                ) : (
                  <>
                    <PendingAmount /> <RegisterIndexLink />
                  </>
                )}
              </p>
            )}
            <p className="muted">
              {t.next} {formatDate(next.adjusted_due_date)} ({relativeDays(daysBetween(today, next.adjusted_due_date), dict.fin.relative)})
            </p>
            <p className="muted">
              {uvr ? (
                <>
                  {t.split.capital} {formatUnits(next.capital, "UVR")} · {t.split.interest} {formatUnits(next.interest, "UVR")} · {t.split.insurance} {formatUnits(next.insurance, "UVR")}
                </>
              ) : (
                <>
                  {t.split.capital} <Money value={next.capital} /> · {t.split.interest} <Money value={next.interest} /> · {t.split.insurance} <Money value={next.insurance} />
                </>
              )}
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
        <Link className="button button--ghost" href={href("simulador-abono-extra")}>
          {dict.fin.credit.detail.extraPayment}
        </Link>
        <Link className="button button--ghost" href={href("simulador-comparar")}>
          {dict.fin.credit.detail.whatIf}
        </Link>
        {uvr && <IndexValues indexKey="UVR_VALUE" label={dict.fin.uvr.uvrValues} />}
        {index && <IndexValues indexKey={index} label={dict.fin.uvr.indexValues} />}
        <Link className="button button--ghost" href={`${href("movimientos")}?cuenta=${encodeURIComponent(l.account_id)}`}>
          {t.viewMovements}
        </Link>
      </div>
      <Section title={t.data}>
        <DefinitionList
          rows={[
            { label: t.fields.rate, value: `${fractionToPercent(l.rate)} % ${convName(l.rate_convention)}` },
            ...(index ? [{ label: dict.fin.uvr.variableRate, value: `${dict.fin.uvr.indices[index]} + ${fractionToPercent(l.margin ?? "0")} %` }] : []),
            { label: t.fields.system, value: dict.fin.systems[l.system] ?? l.system },
            { label: t.fields.term, value: String(l.term) },
            { label: t.fields.insurance, value: uvr ? <span className="tabular">{formatUnits(l.insurance, "UVR")}</span> : <Money value={l.insurance} /> },
            { label: dict.fin.credit.form.otherCharges, value: uvr ? <span className="tabular">{formatUnits(l.other_charges, "UVR")}</span> : <Money value={l.other_charges} /> },
            { label: dict.fin.credit.form.kind, value: dict.fin.credit.kinds[l.kind] },
          ]}
        />
      </Section>
      {uvr && <ValuationPanel loan={l} on={valuationOn} onOn={setValuationOn} valuation={valuation} onChanged={loan.reload} />}
      {index && <VariableRatePanel loan={l} onChanged={loan.reload} />}
      <RatesPanel loanId={l.id} canRecalculate={l.system !== "custom"} onChanged={loan.reload} />
      <LatePanel loanId={l.id} />
      {next && (
        <Modal open={paying} title={t.payInstallment} onClose={() => setPaying(false)}>
          <PayForm
            loanId={l.id}
            uvr={uvr}
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

/**
 * El reparto viene precalculado de la tabla y se puede editar (si el banco cobró distinto). En un crédito en UVR la cuota está en
 * UNIDADES: no se corrige a mano (`uvr_split_not_editable`); se paga en pesos con la UVR de la fecha del pago y aquí solo se elige
 * la cuenta, la fecha y, si hubo, la mora.
 */
function PayForm({ loanId, uvr, installment, onDone, onCancel }: { loanId: string; uvr: boolean; installment: LoanInstallment; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.loans;
  const submit = useSubmit();
  const accounts = useAll<Account>(paths.accounts());
  const [capital, setCapital] = useState(uvr ? "" : amountToInput(installment.capital));
  const [interest, setInterest] = useState(uvr ? "" : amountToInput(installment.interest));
  const [insurance, setInsurance] = useState(uvr ? "" : amountToInput(installment.insurance));
  const [fees, setFees] = useState("");
  const [late, setLate] = useState<string | null>(null);
  const [date, setDate] = useState(todayBogota());
  const quote = useResource<LateQuote>(installment.adjusted_due_date < date ? paths.loanLate(loanId, date) : null);
  const valuation = useValuation(loanId, date, uvr && date !== "");
  const suggested = quote.data?.rows.find((row) => row.number === installment.number)?.late_interest ?? null;
  const lateText = late ?? (suggested ? amountToInput(suggested) : "");
  const [fromAccount, setFromAccount] = useState("");
  const sources = transferAccounts(accounts.items).filter((a) => a.kind !== "credit_card");
  const from = fromAccount || sources[0]?.id || "";

  const parts = { capital: normalizeAmountInput(capital || "0"), interest: normalizeAmountInput(interest || "0"), insurance: normalizeAmountInput(insurance || "0"), fees: normalizeAmountInput(fees || "0"), late: normalizeAmountInput(lateText || "0") };
  const valid = uvr ? parts.late !== null && from !== "" && date !== "" : parts.capital !== null && parts.interest !== null && parts.insurance !== null && parts.fees !== null && parts.late !== null && from !== "";
  const total = valid && !uvr ? addAmounts(parts.capital!, parts.interest!, parts.insurance!, parts.fees!, parts.late!) : null;
  const estimate = uvr ? pesoEstimate(installment.payment, valuation.data?.uvr_value) : null;
  const uvrMissing = uvr && valuation.failure?.code === "index_missing";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    const late_interest = parts.late !== "0" ? { late_interest: parts.late! } : {};
    const body = uvr
      ? { from_account_id: from, date, ...late_interest }
      : { from_account_id: from, date, capital: parts.capital!, interest: parts.interest!, insurance: parts.insurance!, fees: parts.fees!, ...late_interest };
    const result = await submit.run(body, (key) => api.post<Movement>(paths.loanPay(loanId, installment.number), body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  const bad = dict.fin.common.invalidAmount;
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <p className="muted">{t.payIntro.replace("{n}", String(installment.number))}</p>
      {uvr ? (
        <>
          <p className="fin-phrase tabular" data-testid="uvr-installment">
            {t.installment} {formatUnits(installment.payment, "UVR")}
          </p>
          <p className="muted" role="status">
            {estimate !== null && valuation.data ? (
              <>
                <Money value={estimate} estimated /> · {fill(dict.fin.uvr.estimateWith, { uvr: formatRate(valuation.data.uvr_value!), date: formatDate(valuation.data.on) })}
              </>
            ) : uvrMissing ? (
              <>
                <PendingAmount /> <RegisterIndexLink />
              </>
            ) : null}
          </p>
          <p className="hint">{dict.fin.uvr.payHint}</p>
        </>
      ) : (
        <>
          <AmountField label={t.split.capital} value={capital} onChange={setCapital} error={parts.capital === null ? bad : null} />
          <AmountField label={t.split.interest} value={interest} onChange={setInterest} error={parts.interest === null ? bad : null} />
          <AmountField label={t.split.insurance} value={insurance} onChange={setInsurance} error={parts.insurance === null ? bad : null} />
          <AmountField label={t.split.fees} value={fees} onChange={setFees} error={parts.fees === null ? bad : null} />
        </>
      )}
      <AmountField label={dict.fin.credit.late.lateInterest} hint={dict.fin.credit.late.payHint} value={lateText} onChange={setLate} error={parts.late === null ? bad : null} />
      {quote.data?.rate_missing && <RateMissingNotice />}
      {total && (
        <p className="fin-phrase">
          {t.total} <Money value={total} />
        </p>
      )}
      <SelectField label={t.fields.payFrom} value={from} onChange={setFromAccount} options={sources.map((a) => ({ value: a.id, label: a.name }))} />
      <TextField label={dict.fin.form.date} type="date" value={date} onChange={setDate} required />
      <p className="hint">{t.payHint}</p>
      {submit.error && (
        <Banner tone="negative" live="assertive">
          {submit.error}
          {submit.errorCode === "index_missing" && (
            <>
              {" "}
              <RegisterIndexLink />
            </>
          )}
        </Banner>
      )}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending || !valid || uvrMissing}>
          {submit.pending ? dict.fin.common.saving : t.payInstallment}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

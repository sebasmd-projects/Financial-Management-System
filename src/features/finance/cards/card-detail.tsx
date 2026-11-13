"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/api";
import type { Account, AdvanceResult, Card, PlanSummary, Statements } from "@/api/models";
import { paths } from "@/api/paths";
import { parsePositiveAmount } from "@/lib/amount-input";
import { daysBetween, formatDate, todayBogota } from "@/lib/dates";
import { compareAmounts } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { relativeDays, transferAccounts } from "../helpers";
import { useAll, useHref, useResource, useSubmit } from "../hooks";
import { useConventionLabel } from "../conventions";
import { AmountField, Badge, Banner, DefinitionList, Empty, ErrorState, FormActions, Loading, Modal, Money, Progress, ScreenHeader, Section, SelectField, SpentFigure, TextField } from "../kit";
import { FeesPanel } from "./card-rates";
import { PurchasePanel } from "./card-purchase";
import { CardEditForm } from "./card-edit";
import { RemoveDialog } from "../shared/remove";
import { Icon } from "@/ui/icons";
import { useCanWrite } from "../../household/scope-store";

/** Tarjeta de crédito (`/tarjetas/[id]`, diseño §3.7): cupo, fechas, extracto, acciones y compras a cuotas pendientes. */
export function CardDetail({ id }: { id: string }) {
  const { dict } = useI18n();
  const convName = useConventionLabel();
  const t = dict.fin.cards;
  const href = useHref();
  const card = useResource<Card>(paths.card(id));
  const statements = useResource<Statements>(paths.cardStatements(id));
  const plans = useResource<PlanSummary[]>(paths.cardPlans(id));
  const [action, setAction] = useState<"purchase" | "advance" | null>(null);
  const [editing, setEditing] = useState(useSearchParams().get("editar") === "1");
  const [removing, setRemoving] = useState(false);
  const router = useRouter();
  const canWrite = useCanWrite();
  const back = { href: href("cuentas-credito"), label: dict.screens["cuentas-credito"] };

  if (card.loading && !card.data) return <div className="screen"><ScreenHeader title={dict.screens.tarjeta} back={back} /><Loading /></div>;
  if (card.failure || !card.data) {
    return (
      <div className="screen">
        <ScreenHeader title={dict.screens.tarjeta} back={back} />
        <ErrorState message={card.failure?.status === 404 ? dict.fin.errors.notFound : dict.fin.errors.generic} onRetry={card.reload} />
      </div>
    );
  }
  const c = card.data;
  const today = todayBogota();
  const statement = statements.data?.statement ?? null;
  const rel = (date: string) => relativeDays(daysBetween(today, date), dict.fin.relative);
  const active = c.status === "active";
  const done = () => {
    setAction(null);
    card.reload();
    statements.reload();
    plans.reload();
  };

  return (
    <div className="screen">
      <ScreenHeader title={c.name} eyebrow={c.last4 ? `•••• ${c.last4}` : dict.screens.tarjeta} back={back} actions={
          <>
            {c.is_default && (
              <Badge tone="info">
                <Icon name="star" size={14} /> {dict.fin.own.default.badge}
              </Badge>
            )}
            {!active && <Badge tone="warning">{dict.fin.accounts.status[c.status]}</Badge>}
            {canWrite && (
              <>
                <button type="button" className="button button--ghost" onClick={() => setEditing(true)}>
                  {dict.fin.own.edit}
                </button>
                <button type="button" className="button button--ghost" onClick={() => setRemoving(true)}>
                  {dict.fin.own.delete}
                </button>
              </>
            )}
          </>
        }
      />
      <Modal open={editing} title={dict.fin.own.card.editTitle} onClose={() => setEditing(false)}>
        <CardEditForm card={c} onCancel={() => setEditing(false)} onDone={() => { setEditing(false); card.reload(); }} />
      </Modal>
      <RemoveDialog open={removing} name={c.name} deletePath={paths.card(c.id)} closePath={paths.card(c.id)} onClose={() => setRemoving(false)} onDone={() => { setRemoving(false); router.push(back.href); }} />

      <section className="fin-card" aria-label={t.limitSection}>
        <p className="muted">
          {t.used} <Money value={c.used} /> {t.of} <Money value={c.limit} />
        </p>
        <Progress percent={c.utilization_percent} label={`${t.utilization}: ${c.utilization_percent}%`} tone={c.utilization_percent >= 90 ? "negative" : c.utilization_percent >= 70 ? "warning" : "primary"} />
        <p className="fin-big">
          <span className="muted fin-big__label">{t.available}</span> <Money value={c.available} />
        </p>
        <p className="muted">
          {t.cutoff}: {formatDate(c.next_cutoff)} ({rel(c.next_cutoff)}) · {t.payment}: {formatDate(c.next_payment_date)} ({rel(c.next_payment_date)})
        </p>
      </section>

      {statement && (
        <section className="fin-card" aria-label={t.lastStatement}>
          <h2 className="title-s">{t.lastStatement}</h2>
          <p>
            {t.payTotal} <Money value={statement.total_due} /> · {t.payMinimum} <Money value={statement.minimum_due} />
          </p>
          <p className="muted">
            {t.dueOn} {formatDate(statement.due_date)} ({rel(statement.due_date)})
          </p>
          {compareAmounts(statement.total_due, "0") > 0 && (
            <Link className="button button--primary" href={href("tarjeta-pagar", [c.id])}>
              {t.pay}
            </Link>
          )}
        </section>
      )}
      {!statement && statements.data && (
        <div className="actions">
          <Link className="button button--primary" href={href("tarjeta-pagar", [c.id])}>
            {t.pay}
          </Link>
        </div>
      )}

      <div className="actions">
        <button type="button" className="button button--primary" disabled={!active} onClick={() => setAction("purchase")}>
          {t.purchase}
        </button>
        <button type="button" className="button button--ghost" disabled={!active} onClick={() => setAction("advance")}>
          {t.advance}
        </button>
        <Link className="button button--ghost" href={href("tarjeta-simular", [c.id])}>
          {t.simulate}
        </Link>
        <Link className="button button--ghost" href={`${href("movimientos")}?cuenta=${encodeURIComponent(c.account_id)}`}>
          {t.viewMovements}
        </Link>
        <Link className="button button--ghost" href={href("tarjeta-extractos", [c.id])}>
          {dict.fin.stm.title}
        </Link>
        <Link className="button button--ghost" href={href("tarjeta-extracto", [c.id, dict.fin.currentPeriodParam])}>
          {t.statements}
        </Link>
        <Link className="button button--ghost" href={href("tarjeta-tasas", [c.id])}>
          {dict.fin.rates.title}
        </Link>
      </div>

      <Section title={t.pendingPlans}>
        {plans.loading && !plans.data && <Loading />}
        {plans.failure && <ErrorState message={dict.fin.errors.generic} onRetry={plans.reload} />}
        {plans.data && plans.data.length === 0 && <Empty icon="card" title={t.noPlans} />}
        {plans.data && plans.data.length > 0 && (
          <ul className="fin-list">
            {plans.data.map((plan) => (
              <li key={plan.movement_id}>
                <Link href={href("movimiento", [plan.movement_id])} className="fin-row fin-row--plan">
                  <span className="fin-row__main">
                    <span className="fin-row__title">
                      {t.purchaseOf} {formatDate(plan.date)}
                    </span>
                    <span className="fin-row__sub muted">
                      {t.installmentOf.replace("{n}", String(plan.billed)).replace("{total}", String(plan.installments))}
                      {plan.next_payment ? ` · ` : ""}
                      {plan.next_payment ? <Money value={plan.next_payment} /> : null}
                    </span>
                    <SpentFigure totalRealCost={plan.total_real_cost} purchaseValue={plan.purchase_value} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t.data}>
        <DefinitionList
          rows={[
            { label: dict.fin.cardForm.rateType, value: c.rate_type === "variable" ? dict.fin.cardForm.variable : dict.fin.cardForm.fixed },
            { label: t.fields.rate, value: `${c.rate} ${convName(c.rate_convention)}` },
            { label: t.fields.cutDay, value: String(c.cut_day) },
            { label: t.fields.payDay, value: String(c.pay_day) },
            { label: t.fields.system, value: dict.fin.systems[c.installment_system] ?? c.installment_system },
          ]}
        />
      </Section>

      {c.rate_outdated && (
        <Banner tone="warning">
          <p>{dict.fin.rates.outdated}</p>
          <Link href={href("tarjeta-tasas", [c.id])}>{dict.fin.stm.updateRates}</Link>
        </Banner>
      )}

      <FeesPanel cardId={c.id} />

      <Modal open={action === "purchase"} title={t.purchase} onClose={() => setAction(null)}>
        <PurchasePanel card={c} onDone={done} />
      </Modal>
      <Modal open={action === "advance"} title={t.advance} onClose={() => setAction(null)}>
        <AdvanceForm card={c} onDone={done} onCancel={() => setAction(null)} />
      </Modal>
    </div>
  );
}

function AdvanceForm({ card, onDone, onCancel }: { card: Card; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.cards;
  const submit = useSubmit();
  const accounts = useAll<Account>(paths.accounts());
  const [amountText, setAmountText] = useState("");
  const [feeText, setFeeText] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [date, setDate] = useState(todayBogota());
  const amount = parsePositiveAmount(amountText);
  const fee = feeText.trim() === "" ? null : parsePositiveAmount(feeText);
  const targets = transferAccounts(accounts.items).filter((a) => a.kind !== "credit_card");
  const target = toAccount || targets[0]?.id || "";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!amount || !target || (feeText.trim() !== "" && !fee)) return;
    const body = { amount, to_account_id: target, date, ...(fee ? { fee } : {}) };
    const result = await submit.run(body, (key) => api.post<AdvanceResult>(paths.cardAction(card.id, "advances"), body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <p className="muted">{t.advanceIntro}</p>
      <AmountField label={t.fields.advanceAmount} value={amountText} onChange={setAmountText} required error={amountText && !amount ? dict.fin.common.invalidAmount : null} />
      <SelectField label={t.fields.advanceTo} value={target} onChange={setToAccount} options={targets.map((a) => ({ value: a.id, label: a.name }))} />
      <AmountField label={t.fields.fee} hint={t.fields.feeHint} value={feeText} onChange={setFeeText} error={feeText.trim() !== "" && !fee ? dict.fin.common.invalidAmount : null} />
      <TextField label={dict.fin.form.date} type="date" value={date} onChange={setDate} required />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending || !amount || !target}>
          {submit.pending ? dict.fin.common.saving : t.advance}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

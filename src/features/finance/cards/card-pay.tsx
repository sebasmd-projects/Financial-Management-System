"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { Account, Card, Movement, Statements } from "@/api/models";
import { paths } from "@/api/paths";
import { parsePositiveAmount } from "@/lib/amount-input";
import { formatDate, todayBogota } from "@/lib/dates";
import { formatCop } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { fill, transferAccounts } from "../helpers";
import { useAll, useHref, useResource, useSubmit } from "../hooks";
import { AmountField, Banner, ErrorState, FormActions, Loading, Money, ScreenHeader, Segmented, SelectField, TextField } from "../kit";
import { warningText } from "../movements/movement-form";

type PayKind = "total" | "minimum" | "amount";

/** Pagar la tarjeta (`/tarjetas/[id]/pagar`): total del extracto (por omisión), mínimo u otro valor. Baja la deuda; no es un gasto nuevo. */
export function CardPay({ id }: { id: string }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.cards;
  const href = useHref();
  const submit = useSubmit();
  const card = useResource<Card>(paths.card(id));
  const statements = useResource<Statements>(paths.cardStatements(id));
  const accounts = useAll<Account>(paths.accounts());
  const [kind, setKind] = useState<PayKind>("total");
  const [amountText, setAmountText] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [date, setDate] = useState(todayBogota());
  const [saved, setSaved] = useState<Movement | null>(null);

  const back = { href: href("tarjeta", [id]), label: card.data?.name ?? dict.screens.tarjeta };
  const sources = transferAccounts(accounts.items).filter((a) => a.kind !== "credit_card");
  const from = fromAccount || sources[0]?.id || "";
  const statement = statements.data?.statement ?? null;
  const amount = kind === "amount" ? parsePositiveAmount(amountText) : null;
  const fromName = sources.find((a) => a.id === from)?.name ?? "";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!from || (kind === "amount" && !amount)) return;
    const body = { kind, from_account_id: from, date, ...(kind === "amount" ? { amount: amount! } : {}) };
    const result = await submit.run(body, (key) => api.post<Movement>(paths.cardAction(id, "payments"), body, { idempotencyKey: key, locale }));
    if (result.ok) setSaved(result.data);
  }

  return (
    <div className="screen screen--form">
      <ScreenHeader title={dict.screens["tarjeta-pagar"]} back={back} />
      {(card.loading || statements.loading) && !card.data && <Loading />}
      {card.failure && <ErrorState message={card.failure.status === 404 ? dict.fin.errors.notFound : dict.fin.errors.generic} onRetry={card.reload} />}
      {saved ? (
        <>
          <Banner tone="positive">
            <p>{t.paid}</p>
            {(saved.warnings ?? []).map((w, i) => (
              <p key={`${w.code}-${i}`}>{warningText(w, dict.fin.warnings, accounts.items)}</p>
            ))}
          </Banner>
          <div className="actions">
            <Link className="button button--primary" href={href("tarjeta", [id])}>
              {t.backToCard}
            </Link>
            <Link className="button button--ghost" href={href("movimiento", [saved.id])}>
              {dict.fin.form.viewSaved}
            </Link>
          </div>
        </>
      ) : (
        card.data && (
          <form onSubmit={onSubmit} className="fin-form" noValidate>
            <p className="fin-phrase">{fill(t.payPhrase, { card: card.data.name })}</p>
            {statement && (
              <p className="muted">
                {t.dueOn} {formatDate(statement.due_date)}
              </p>
            )}
            <Segmented
              legend={t.payHow}
              options={[
                { value: "total", label: statement ? `${t.payTotal} ${formatCop(statement.total_due)}` : t.payTotal },
                { value: "minimum", label: statement ? `${t.payMinimum} ${formatCop(statement.minimum_due)}` : t.payMinimum },
                { value: "amount", label: t.payOther },
              ]}
              value={kind}
              onChange={(v) => setKind(v as PayKind)}
            />
            {kind === "amount" && <AmountField label={t.fields.payAmount} value={amountText} onChange={setAmountText} required error={amountText && !amount ? dict.fin.common.invalidAmount : null} />}
            <SelectField label={t.fields.payFrom} value={from} onChange={setFromAccount} options={sources.map((a) => ({ value: a.id, label: a.name }))} />
            {fromName && sources.find((a) => a.id === from) && (
              <p className="muted">
                {fromName}: <Money value={sources.find((a) => a.id === from)!.posted_balance} />
              </p>
            )}
            <TextField label={dict.fin.form.date} type="date" value={date} onChange={setDate} required />
            {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
            <FormActions>
              <button type="submit" className="button button--primary" disabled={submit.pending || !from || (kind === "amount" && !amount)}>
                {submit.pending ? dict.fin.common.saving : t.pay}
              </button>
            </FormActions>
          </form>
        )
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Account, PersonBalance, SharedDirection } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate, todayBogota } from "@/lib/dates";
import { formatCop } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { fill, movementAccounts } from "../helpers";
import { useAll, useHref, useResource, useSubmit } from "../hooks";
import { AmountField, Badge, Banner, ErrorState, FormActions, Loading, Money, ScreenHeader, Section, Segmented, SelectField, TextField } from "../kit";
import { balanceSides, settleAmount } from "./logic";
import { BalanceLines } from "./shared-screen";

/**
 * Saldar con una persona (`/movimientos/compartidos/[persona]`): el detalle de lo que se deben y [Saldar] (todo, o un abono parcial).
 * Saldar es una transferencia que cierra la cuenta por cobrar o por pagar; no es ingreso ni gasto. Al terminar, el saldo queda en $0.
 */
export function PersonScreen({ id }: { id: string }) {
  const { dict } = useI18n();
  const t = dict.fin.shared;
  const href = useHref();
  const person = useResource<PersonBalance>(paths.sharedPerson(id));
  const [done, setDone] = useState<string | null>(null);
  const back = { href: href("compartidos"), label: dict.screens.compartidos };
  const p = person.data;
  return (
    <div className="screen screen--form">
      <ScreenHeader title={p?.name ?? dict.screens["compartidos-persona"]} eyebrow={dict.screens["compartidos-persona"]} back={back} />
      {person.loading && !p && <Loading />}
      {person.failure && <ErrorState message={person.failure.status === 404 ? dict.fin.errors.notFound : dict.fin.errors.generic} onRetry={person.reload} />}
      {done && <Banner tone="positive">{done}</Banner>}
      {p && (
        <>
          <section className="fin-card" aria-label={t.balancesTitle} data-testid="person-balance">
            <BalanceLines person={p} />
            <p className="muted">
              {t.net} <Money value={p.net} sign="always" />
            </p>
          </section>
          <Section title={t.debtsTitle}>
            {p.debts.length === 0 && <p className="muted">{t.noDebts}</p>}
            <ul className="fin-list">
              {p.debts.map((debt) => (
                <li key={debt.debt_id} className="fin-row fin-row--static">
                  <span className="fin-row__main">
                    <span className="fin-row__title">{debt.direction === "owed" ? t.directionOwed : t.directionOwe}</span>
                    <span className="fin-row__sub muted">
                      {formatDate(debt.agreed_date)}
                      {debt.note ? ` · ${debt.note}` : ""}
                    </span>
                    <Badge>{debt.direction === "owed" ? t.theyOwe : t.youOwe}</Badge>
                  </span>
                  <Money value={debt.balance} />
                </li>
              ))}
            </ul>
          </Section>
          {(balanceSides(p).owed || balanceSides(p).owe) && (
            <SettleForm
              person={p}
              onDone={(after) => {
                person.reload();
                setDone(!balanceSides(after).owed && !balanceSides(after).owe ? fill(t.settledDone, { name: after.name }) : fill(t.partialDone, { name: after.name }));
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function SettleForm({ person, onDone }: { person: PersonBalance; onDone: (after: PersonBalance) => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.shared;
  const submit = useSubmit();
  const accounts = useAll<Account>(paths.accounts());
  const sides = balanceSides(person);
  const [direction, setDirection] = useState<SharedDirection>(sides.owed ? "owed" : "owe");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(todayBogota());
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const usable = movementAccounts(accounts.items).filter((a) => a.kind !== "credit_card");
  const account = accountId || usable[0]?.id || "";
  const parsed = settleAmount(amount);
  // Con ambos sentidos abiertos hay que elegir cuál saldar; con uno solo, ese.
  const effective: SharedDirection = sides.owed && sides.owe ? direction : sides.owed ? "owed" : "owe";
  const open = effective === "owed" ? person.owed_to_me : person.i_owe;
  const valid = account !== "" && date !== "" && parsed !== undefined;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const body = { account_id: account, date, direction: effective, ...(parsed ? { amount: parsed } : {}) };
    const result = await submit.run({ person: person.counterparty_id, ...body }, (key) => api.post<PersonBalance>(paths.sharedSettle(person.counterparty_id), body, { idempotencyKey: key, locale }));
    if (result.ok) {
      setAmount("");
      onDone(result.data);
    }
  }
  return (
    <Section title={t.settleTitle}>
      <form onSubmit={onSubmit} className="fin-form" noValidate>
        {sides.owed && sides.owe && (
          <Segmented legend={t.settleWhich} value={direction} onChange={(v) => setDirection(v as SharedDirection)} options={[{ value: "owed", label: t.settleOwed }, { value: "owe", label: t.settleOwe }]} />
        )}
        <p className="muted">{effective === "owed" ? t.settleOwedHint : t.settleOweHint}</p>
        <AmountField label={t.settleAmount} hint={fill(t.settleAmountHint, { amount: formatCop(open) })} value={amount} onChange={setAmount} error={touched && parsed === undefined ? dict.fin.common.invalidAmount : null} apiCode={submit.errorCode} />
        <SelectField label={effective === "owed" ? t.settleIntoAccount : t.settleFromAccount} value={account} onChange={setAccountId} options={usable.map((a) => ({ value: a.id, label: a.name }))} error={touched && account === "" ? dict.fin.common.requiredField : null} />
        <TextField label={t.date} type="date" value={date} onChange={setDate} required />
        {submit.error && submit.errorCode !== "too_many_decimals" && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
        <FormActions>
          <button type="submit" className="button button--primary" disabled={submit.pending}>
            {submit.pending ? dict.fin.common.saving : parsed ? t.settlePartial : t.settleAll}
          </button>
        </FormActions>
      </form>
    </Section>
  );
}

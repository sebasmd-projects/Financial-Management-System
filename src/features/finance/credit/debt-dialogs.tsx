"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Account, Debt, DebtCreate, DebtPatch, DebtReminder } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { parsePositiveAmount } from "@/lib/amount-input";
import { formatCop } from "@/lib/money";
import { toInt } from "@/lib/ints";
import { isBusinessDate, todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { fill, transferAccounts } from "../helpers";
import { useAll, useResource, useSubmit } from "../hooks";
import { AmountField, Banner, ErrorState, FormActions, Loading, SelectField, TextArea, TextField } from "../kit";

function Buttons({ pending, label, onCancel }: { pending: boolean; label: string; onCancel: () => void }) {
  const { dict } = useI18n();
  return (
    <FormActions>
      <button type="submit" className="button button--primary" disabled={pending}>
        {pending ? dict.fin.common.saving : label}
      </button>
      <button type="button" className="button button--ghost" onClick={onCancel}>
        {dict.common.cancel}
      </button>
    </FormActions>
  );
}

/** «Debo» y «me deben»: alta de una deuda personal (§3.8). Con cuenta, el dinero se movió ese día; sin ella la deuda ya existía y arranca con su saldo. */
export function DebtForm({ initialDirection, onDone, onCancel }: { initialDirection: "owe" | "owed"; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.credit.debts;
  const submit = useSubmit();
  const accounts = useAll<Account>(paths.accounts());
  const [direction, setDirection] = useState<"owe" | "owed">(initialDirection);
  const [person, setPerson] = useState("");
  const [principal, setPrincipal] = useState("");
  const [agreed, setAgreed] = useState(todayBogota());
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [remindOn, setRemindOn] = useState("");
  const [every, setEvery] = useState("");
  const [account, setAccount] = useState("");
  const [touched, setTouched] = useState(false);
  const principalValue = parsePositiveAmount(principal);
  const everyValue = every.trim() === "" ? null : toInt(every, 1, 365);
  const everyBad = every.trim() !== "" && everyValue === null;
  const valid = person.trim() !== "" && principalValue !== null && isBusinessDate(agreed) && !everyBad;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const body: DebtCreate = {
      direction,
      person: person.trim(),
      principal: principalValue!,
      agreed_date: agreed,
      ...(due ? { due_date: due } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(remindOn ? { remind_on: remindOn } : {}),
      ...(everyValue !== null ? { remind_every_days: everyValue } : {}),
      ...(account ? { account_id: account } : {}),
    };
    const result = await submit.run(body, (key) => api.post(roots.debts, body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  const req = dict.fin.common.requiredField;
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <SelectField label={t.direction} value={direction} onChange={(v) => setDirection(v as "owe" | "owed")} options={[{ value: "owe", label: t.owe }, { value: "owed", label: t.owed }]} />
      <TextField label={t.person} value={person} onChange={setPerson} maxLength={80} required error={touched && person.trim() === "" ? req : null} />
      <AmountField label={t.principal} value={principal} onChange={setPrincipal} required error={touched && principalValue === null ? dict.fin.common.invalidAmount : null} />
      <div className="fin-grid-2">
        <TextField label={t.agreedDate} type="date" value={agreed} onChange={setAgreed} required />
        <TextField label={t.dueDate} type="date" value={due} onChange={setDue} />
      </div>
      <SelectField label={t.account} hint={direction === "owed" ? t.accountHintOwed : t.accountHintOwe} value={account} onChange={setAccount} placeholder={t.noAccount} options={transferAccounts(accounts.items).filter((a) => a.kind !== "credit_card").map((a) => ({ value: a.id, label: a.name }))} />
      <div className="fin-grid-2">
        <TextField label={t.remindOn} type="date" value={remindOn} onChange={setRemindOn} />
        <TextField label={t.remindEvery} hint={t.remindEveryHint} value={every} onChange={setEvery} inputMode="numeric" maxLength={3} error={touched && everyBad ? dict.fin.loans.termInvalid : null} />
      </div>
      <TextArea label={t.note} value={note} onChange={setNote} maxLength={200} rows={2} />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <Buttons pending={submit.pending} label={t.create} onCancel={onCancel} />
    </form>
  );
}

/**
 * Registrar un abono. «Me deben»: lo paga la persona (un tercero respecto a tus cuentas) y entra a tu cuenta; es una
 * transferencia que baja «Me deben», no un ingreso. «Debo»: sale de tu cuenta y baja tu pasivo; no es gasto. Ningún abono pasa del saldo.
 */
export function DebtPayForm({ debt, onDone, onCancel }: { debt: Debt; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.credit.debts;
  const submit = useSubmit();
  const accounts = useAll<Account>(paths.accounts());
  const options = transferAccounts(accounts.items).filter((a) => a.kind !== "credit_card");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayBogota());
  const [account, setAccount] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const amountValue = parsePositiveAmount(amount);
  const from = account || options[0]?.id || "";
  const valid = amountValue !== null && from !== "" && isBusinessDate(date);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const body = { amount: amountValue!, date, account_id: from, ...(note.trim() ? { note: note.trim() } : {}) };
    const result = await submit.run(body, (key) => api.post(paths.debtPayments(debt.id), body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <p className="muted">{fill(debt.direction === "owed" ? t.payIntroOwed : t.payIntroOwe, { person: debt.person })}</p>
      <AmountField label={t.paymentAmount} hint={fill(t.paymentMax, { balance: formatCop(debt.balance) })} value={amount} onChange={setAmount} required error={touched && amountValue === null ? dict.fin.common.invalidAmount : null} apiCode={submit.errorCode} />
      <SelectField label={debt.direction === "owed" ? t.receivingAccount : t.payingAccount} value={from} onChange={setAccount} options={options.map((a) => ({ value: a.id, label: a.name }))} />
      <TextField label={dict.fin.form.date} type="date" value={date} onChange={setDate} required />
      <TextField label={t.note} value={note} onChange={setNote} maxLength={200} />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <Buttons pending={submit.pending} label={t.register} onCancel={onCancel} />
    </form>
  );
}

/** Fecha acordada, nota y recordatorio propio (una fecha y cada cuántos días se repite). */
export function DebtEditForm({ debt, onDone, onCancel }: { debt: Debt; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.credit.debts;
  const submit = useSubmit();
  const [due, setDue] = useState(debt.due_date ?? "");
  const [note, setNote] = useState(debt.note ?? "");
  const [remindOn, setRemindOn] = useState(debt.remind_on ?? "");
  const [every, setEvery] = useState(debt.remind_every_days === null ? "" : String(debt.remind_every_days));
  const everyValue = every.trim() === "" ? null : toInt(every, 1, 365);
  const everyBad = every.trim() !== "" && everyValue === null;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (everyBad) return;
    const body: DebtPatch = { due_date: due || null, note: note.trim() || null, remind_on: remindOn || null, remind_every_days: remindOn ? everyValue : null };
    const result = await submit.run(body, () => api.patch(paths.debt(debt.id), body, { locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <TextField label={t.dueDate} type="date" value={due} onChange={setDue} />
      <div className="fin-grid-2">
        <TextField label={t.remindOn} type="date" value={remindOn} onChange={setRemindOn} />
        <TextField label={t.remindEvery} hint={t.remindEveryHint} value={every} onChange={setEvery} inputMode="numeric" maxLength={3} error={everyBad ? dict.fin.loans.termInvalid : null} />
      </div>
      <TextArea label={t.note} value={note} onChange={setNote} maxLength={200} rows={2} />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <Buttons pending={submit.pending} label={dict.fin.common.save} onCancel={onCancel} />
    </form>
  );
}

/** El texto del recordatorio («Hola, Camilo: te recuerdo los $300.000 del 02/10») para copiar o compartir. Se arma en el servidor; no se guarda. */
export function DebtReminderView({ debtId, onClose }: { debtId: string; onClose: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.credit.debts;
  const reminder = useResource<DebtReminder>(paths.debtReminder(debtId, locale));
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  const text = reminder.data?.text ?? "";
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }
  async function share() {
    try {
      await navigator.share({ text });
    } catch {
      // La persona canceló el cuadro de compartir: no es un error.
    }
  }
  return (
    <div className="fin-form">
      {reminder.loading && !reminder.data && <Loading />}
      {reminder.failure && <ErrorState message={dict.fin.errors.generic} onRetry={reminder.reload} />}
      {reminder.data && (
        <>
          <p className="fin-card" data-testid="reminder-text">{text}</p>
          <p className="hint" role="status">{copied === "done" ? t.copied : copied === "failed" ? t.copyFailed : t.reminderHint}</p>
          <FormActions>
            <button type="button" className="button button--primary" onClick={copy}>
              {t.copy}
            </button>
            {canShare && (
              <button type="button" className="button button--ghost" onClick={share}>
                {t.share}
              </button>
            )}
            <button type="button" className="button button--ghost" onClick={onClose}>
              {dict.common.close}
            </button>
          </FormActions>
        </>
      )}
    </div>
  );
}

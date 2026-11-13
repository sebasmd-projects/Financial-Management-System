"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { Account, Goal, GoalCreate, GoalKind } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { parsePositiveAmount } from "@/lib/amount-input";
import { formatDate, isBusinessDate, todayBogota } from "@/lib/dates";
import { formatPercent, percentWidth } from "@/lib/percent";
import { useI18n } from "@/i18n/provider";
import { DrillLink } from "../drill-link";
import { fill, transferAccounts } from "../helpers";
import { useAll, useHref, useSubmit } from "../hooks";
import { AmountField, Badge, Banner, FormActions, Money, Progress, SelectField, TextField } from "../kit";
import { EMPTY_GOAL, GOAL_KINDS, goalBody, type GoalInputs } from "./logic";

/** Una meta (§3.12): `$3.200.000 de $12.000.000 · 27 %`, aporte mensual necesario, aportar y «Ver movimientos». El progreso es el saldo de su cuenta. */
export function GoalCard({ goal, onContribute, detail = true }: { goal: Goal; onContribute: () => void; detail?: boolean }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.plan.goals;
  const href = useHref();
  return (
    <article className="fin-card" aria-label={goal.name}>
      <h2 className="title-s">{detail ? <Link href={href("plan-meta", [goal.id])}>{goal.name}</Link> : goal.name}</h2>
      <p className="muted">{dict.fin.plan.goalKinds[goal.kind]}</p>
      <p>
        <strong><Money value={goal.saved} /></strong> <span className="muted">{t.of}</span> <Money value={goal.target_amount} /> · {formatPercent(goal.percent, locale)}
      </p>
      <Progress percent={percentWidth(goal.percent)} label={`${goal.name}: ${formatPercent(goal.percent, locale)}`} tone={goal.reached ? "positive" : "primary"} />
      <p className="fin-row__badges">
        {goal.reached && <Badge tone="positive">{t.reached}</Badge>}
        {goal.status === "archived" && <Badge>{t.archivedBadge}</Badge>}
      </p>
      {goal.target_date && (
        <p className="muted">
          {fill(t.targetDate, { date: formatDate(goal.target_date) })}
          {goal.months_left !== null ? ` · ${fill(t.monthsLeft, { n: String(goal.months_left) })}` : ""}
        </p>
      )}
      {!goal.reached && goal.monthly_needed !== null && goal.target_date && (
        <p>
          <Money value={goal.monthly_needed} /> {t.monthlyNeeded} {fill(t.toReach, { date: formatDate(goal.target_date) })}
        </p>
      )}
      {goal.planned_contribution !== null && (
        <p className="muted">
          {t.planned} <Money value={goal.planned_contribution} />
        </p>
      )}
      <div className="actions">
        {goal.status === "active" && goal.kind !== "pay_debt" && (
          <button type="button" className="button button--primary" onClick={onContribute}>
            {t.contribute}
          </button>
        )}
        <DrillLink className="button button--ghost" filter={goal.movements_filter}>
          {dict.fin.loans.viewMovements}
        </DrillLink>
      </div>
    </article>
  );
}

/** Aportar (§3.12): una transferencia desde una cuenta a la de la meta, con la misma regla del 4x1000 que cualquier transferencia. */
export function ContributeForm({ goal, onDone, onCancel }: { goal: Goal; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.plan.goals;
  const submit = useSubmit();
  const accounts = useAll<Account>(paths.accounts());
  const sources = transferAccounts(accounts.items).filter((a) => a.kind !== "credit_card" && a.id !== goal.account_id);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayBogota());
  const [from, setFrom] = useState("");
  const [touched, setTouched] = useState(false);
  const amountValue = parsePositiveAmount(amount);
  const source = from || sources[0]?.id || "";
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (amountValue === null || source === "" || !isBusinessDate(date)) return;
    const body = { from_account_id: source, amount: amountValue, date };
    const result = await submit.run(body, (key) => api.post(paths.goalContribute(goal.id), body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <p className="muted">{fill(t.contributeIntro, { goal: goal.name })}</p>
      <AmountField label={t.contributeAmount} value={amount} onChange={setAmount} required error={touched && amountValue === null ? dict.fin.common.invalidAmount : null} apiCode={submit.errorCode} />
      <SelectField label={t.fromAccount} value={source} onChange={setFrom} options={sources.map((a) => ({ value: a.id, label: a.name }))} />
      <TextField label={dict.fin.form.date} type="date" value={date} onChange={setDate} required />
      <p className="hint">{t.gmfHint}</p>
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : t.contribute}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

/** Crear una meta: crea o enlaza un fondo de ahorro; «pagar una deuda» enlaza el pasivo y su progreso es lo abonado a capital. */
export function GoalForm({ initialKind, onDone, onCancel }: { initialKind: GoalKind; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.plan.goals;
  const submit = useSubmit();
  const accounts = useAll<Account>(paths.accounts());
  const [input, setInput] = useState<GoalInputs>({ ...EMPTY_GOAL, kind: initialKind });
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof GoalInputs>(key: K) => (value: GoalInputs[K]) => setInput((prev) => ({ ...prev, [key]: value }));
  const built = goalBody(input);
  const funds = accounts.items.filter((a) => ["savings", "fund", "pocket", "wallet"].includes(a.kind) && a.status !== "closed");
  const liabilities = accounts.items.filter((a) => (a.kind === "loan" || a.kind === "credit_card") && a.status !== "closed");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    const body: GoalCreate | null = built.body;
    if (!body) return;
    const result = await submit.run(body, (key) => api.post(roots.goals, body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  const req = dict.fin.common.requiredField;
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <TextField label={t.name} value={input.name} onChange={set("name")} maxLength={80} required error={touched && built.problems.name ? req : null} />
      <SelectField label={t.kind} value={input.kind} onChange={(v) => set("kind")(v as GoalKind)} options={GOAL_KINDS.map((k) => ({ value: k, label: dict.fin.plan.goalKinds[k] }))} />
      <AmountField label={t.target} value={input.target} onChange={set("target")} required error={touched && built.problems.target ? dict.fin.common.invalidAmount : null} apiCode={submit.errorCode} />
      <TextField label={t.date} type="date" value={input.date} onChange={set("date")} />
      <AmountField label={t.plannedField} hint={t.plannedHint} value={input.planned} onChange={set("planned")} error={touched && built.problems.planned ? dict.fin.common.invalidAmount : null} />
      {input.kind === "pay_debt" ? (
        <SelectField label={t.debtAccount} hint={t.debtAccountHint} value={input.debtAccount} onChange={set("debtAccount")} placeholder={t.pickOne} options={liabilities.map((a) => ({ value: a.id, label: a.name }))} required error={touched && built.problems.debt ? req : null} />
      ) : (
        <SelectField label={t.fund} hint={t.fundHint} value={input.account} onChange={set("account")} placeholder={t.createFund} options={funds.map((a) => ({ value: a.id, label: a.name }))} />
      )}
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

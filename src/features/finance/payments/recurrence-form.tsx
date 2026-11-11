"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/api";
import type { ApiResult } from "@/api/client";
import type { Account, Category, Frequency, Recurrence, RecurrenceKind } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { normalizeAmountInput } from "@/lib/amount-input";
import { toInt } from "@/lib/ints";
import { formatCop } from "@/lib/money";
import { formatDate, todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { movementAccounts } from "../helpers";
import { useAll, useHref, useSubmit } from "../hooks";
import { AmountField, Banner, Checkbox, Empty, FormActions, Loading, ScreenHeader, SelectField, TextField } from "../kit";
import { EMPTY_PAUSES, EMPTY_TERMS, pauseFields, termsFields, type PausesState, type TermsState } from "./conditions";
import { MonthChecks, PauseFields, TermsFields } from "./conditions-fields";
import { FREQUENCIES, scheduleFields, usesDay, usesInterval, usesMonth, usesMonths, usesWeekday } from "./schedule";

interface PreviewDates {
  dates: { original: string; adjusted: string; moved: boolean }[];
}

/** Nueva recurrencia (`/pagos/recurrencias/nueva`, diseño §3.10): gasto fijo, suscripción, ingreso u otro; con vista previa de las 3 próximas fechas. */
export function RecurrenceForm() {
  const { dict, locale } = useI18n();
  const t = dict.fin.recurrence;
  const href = useHref();
  const submit = useSubmit();
  const accounts = useAll<Account>(paths.accounts());
  const categories = useAll<Category>(paths.categories({ archived: false }));
  const [kind, setKind] = useState<RecurrenceKind>("fixed_expense");
  const [name, setName] = useState("");
  const [amountText, setAmountText] = useState("");
  const [estimate, setEstimate] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [startDate, setStartDate] = useState(todayBogota());
  const [endDate, setEndDate] = useState("");
  const [day, setDay] = useState(String(+todayBogota().slice(8)));
  const [lastDay, setLastDay] = useState(false);
  const [weekday, setWeekday] = useState("0");
  const [month, setMonth] = useState(String(+todayBogota().slice(5, 7)));
  const [interval, setInterval_] = useState("30");
  const [holidayRule, setHolidayRule] = useState<"none" | "next" | "previous">("next");
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [provider, setProvider] = useState("");
  const [renewal, setRenewal] = useState("");
  const [autoRenews, setAutoRenews] = useState(false);
  const [months, setMonths] = useState<number[]>([]);
  const [pauses, setPauses] = useState<PausesState>(EMPTY_PAUSES);
  const [terms, setTerms] = useState<TermsState>(EMPTY_TERMS);
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState<Recurrence | null>(null);

  const sources = movementAccounts(accounts.items);
  const account = accountId || sources[0]?.id || "";
  const amount = normalizeAmountInput(amountText);
  const schedule = scheduleFields({ frequency, startDate, endDate, day, lastDay, weekday, month, interval, holidayRule, months });
  const isIncome = kind === "income";
  const pausesBody = pauseFields(pauses);

  // Vista previa de las próximas fechas (el motor es del servidor): espera 350 ms tras el último cambio.
  const previewKey = schedule && pausesBody.valid ? JSON.stringify({ ...schedule, ...(pauses.months.length > 0 ? { skip_months: pausesBody.fields.skip_months } : {}), ...(pauses.ranges.length > 0 ? { skip_ranges: pausesBody.fields.skip_ranges } : {}), count: 3 }) : null;
  const [preview, setPreview] = useState<{ key: string; result: ApiResult<PreviewDates> } | null>(null);
  useEffect(() => {
    if (previewKey === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api.post<PreviewDates>(paths.recurrencePreview(), JSON.parse(previewKey), { signal: controller.signal }).then((result) => {
        if (!controller.signal.aborted) setPreview({ key: previewKey, result });
      });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [previewKey]);
  const current = previewKey !== null && preview?.key === previewKey ? preview.result : null;

  const termsBody = isIncome ? { fields: {}, problems: {} } : termsFields(terms);
  const valid = name.trim() !== "" && amount !== null && schedule !== null && account !== "" && pausesBody.valid && Object.keys(termsBody.problems).length === 0;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid || !schedule) return;
    const body = {
      ...schedule,
      kind,
      name: name.trim(),
      expected_amount: amount!,
      is_estimate: estimate,
      account_id: account,
      auto_confirm: autoConfirm,
      ...(pauses.months.length > 0 ? { skip_months: pausesBody.fields.skip_months } : {}),
      ...(pauses.ranges.length > 0 ? { skip_ranges: pausesBody.fields.skip_ranges } : {}),
      ...termsBody.fields,
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(kind === "subscription"
        ? { ...(provider.trim() ? { provider: provider.trim() } : {}), ...(renewal ? { renewal_date: renewal } : {}), auto_renews: autoRenews }
        : {}),
    };
    const result = await submit.run(body, (key) => api.post<Recurrence>(roots.recurrences, body, { idempotencyKey: key, locale }));
    if (result.ok) setSaved(result.data);
  }

  const req = dict.fin.common.requiredField;
  const back = { href: href("pagos-fijos"), label: dict.screens["pagos-fijos"] };
  if (saved) {
    return (
      <div className="screen">
        <ScreenHeader title={dict.screens["pagos-recurrencia-nueva"]} back={back} />
        <Banner tone="positive">
          <p>{t.saved}</p>
        </Banner>
        <div className="actions">
          <Link className="button button--primary" href={href("pagos-recurrencia", [saved.id])}>
            {t.view}
          </Link>
          <Link className="button button--ghost" href={back.href}>
            {back.label}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="screen screen--form">
      <ScreenHeader title={dict.screens["pagos-recurrencia-nueva"]} back={back} />
      {accounts.loading && !accounts.data && <Loading />}
      {accounts.data && sources.length === 0 && <Empty title={dict.fin.form.noAccountsTitle} body={dict.fin.form.noAccountsBody} action={<Link className="button button--primary" href={href("cuentas")}>{dict.fin.form.goToAccounts}</Link>} />}
      {accounts.data && sources.length > 0 && (
        <form onSubmit={onSubmit} noValidate className="fin-form">
          <SelectField label={t.kind} value={kind} onChange={(v) => setKind(v as RecurrenceKind)} options={(["fixed_expense", "subscription", "income", "other"] as const).map((k) => ({ value: k, label: t.kinds[k] }))} />
          <TextField label={t.name} value={name} onChange={setName} maxLength={80} required error={touched && name.trim() === "" ? req : null} />
          <AmountField label={t.amount} value={amountText} onChange={setAmountText} required error={touched && amount === null ? dict.fin.common.invalidAmount : null} preview={amount ? formatCop(amount) : null} />
          <Checkbox label={t.estimate} hint={t.estimateHint} checked={estimate} onChange={setEstimate} />
          <SelectField label={isIncome ? t.accountIn : t.accountOut} value={account} onChange={setAccountId} options={sources.map((a) => ({ value: a.id, label: a.name }))} />
          <SelectField label={dict.fin.form.category} value={categoryId} onChange={setCategoryId} placeholder={dict.fin.form.noCategory} options={categories.items.filter((c) => c.kind === (isIncome ? "income" : "expense")).map((c) => ({ value: c.id, label: c.path.join(" › ") }))} />

          <SelectField label={t.frequency} value={frequency} onChange={(v) => setFrequency(v as Frequency)} options={FREQUENCIES.map((f) => ({ value: f, label: dict.fin.frequencies[f] }))} />
          <div className="fin-grid-2">
            <TextField label={t.startDate} type="date" value={startDate} onChange={setStartDate} required />
            <TextField label={t.endDate} type="date" value={endDate} onChange={setEndDate} hint={t.endDateHint} error={endDate && endDate < startDate ? t.endBeforeStart : null} />
          </div>
          {usesDay(frequency) && (
            <>
              <TextField label={t.day} value={day} onChange={setDay} inputMode="numeric" maxLength={2} hint={t.dayHint} error={!lastDay && toInt(day, 1, 31) === null ? t.dayInvalid : null} />
              <Checkbox label={t.lastDay} checked={lastDay} onChange={setLastDay} />
            </>
          )}
          {usesMonths(frequency) && <MonthChecks legend={dict.fin.terms.monthsLegend} hint={dict.fin.terms.monthsHint} value={months} onChange={setMonths} />}
          {usesMonth(frequency) && months.length === 0 && <SelectField label={t.month} value={month} onChange={setMonth} options={dict.fin.months.map((label, index) => ({ value: String(index + 1), label }))} />}
          {usesWeekday(frequency) && <SelectField label={t.weekday} value={weekday} onChange={setWeekday} options={dict.fin.weekdays.map((label, index) => ({ value: String(index), label }))} />}
          {usesInterval(frequency) && <TextField label={t.interval} value={interval} onChange={setInterval_} inputMode="numeric" maxLength={3} error={toInt(interval, 1, 365) === null ? t.intervalInvalid : null} />}
          <SelectField
            label={t.holidayRule}
            hint={t.holidayHint}
            value={holidayRule}
            onChange={(v) => setHolidayRule(v as "none" | "next" | "previous")}
            options={[
              { value: "none", label: t.holiday.none },
              { value: "next", label: t.holiday.next },
              { value: "previous", label: t.holiday.previous },
            ]}
          />

          <div className="fin-sim" aria-live="polite">
            <h2 className="title-s">{t.nextDates}</h2>
            {previewKey === null && <p className="muted">{t.completeSchedule}</p>}
            {previewKey !== null && current === null && <Loading />}
            {current && !current.ok && <p className="muted">{t.noDates}</p>}
            {current?.ok && current.data.dates.length === 0 && <p className="muted">{t.noDates}</p>}
            {current?.ok && current.data.dates.length > 0 && (
              <ul>
                {current.data.dates.map((d) => (
                  <li key={d.original}>
                    {formatDate(d.adjusted)}
                    {d.moved ? ` (${t.originally} ${formatDate(d.original)})` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {kind === "subscription" && (
            <>
              <TextField label={t.provider} value={provider} onChange={setProvider} maxLength={80} />
              <TextField label={t.renewalDate} type="date" value={renewal} onChange={setRenewal} />
              <Checkbox label={t.autoRenews} checked={autoRenews} onChange={setAutoRenews} />
            </>
          )}
          <details className="fin-details">
            <summary>{dict.fin.terms.pausesTitle}</summary>
            <PauseFields value={pauses} onChange={setPauses} />
          </details>
          {!isIncome && (
            <details className="fin-details">
              <summary>{dict.fin.terms.windowsTitle}</summary>
              <TermsFields value={terms} onChange={setTerms} problems={termsBody.problems} touched={touched} />
            </details>
          )}
          <Checkbox label={t.autoConfirm} hint={t.autoConfirmHint} checked={autoConfirm} onChange={setAutoConfirm} />

          {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
          <FormActions>
            <button type="submit" className="button button--primary button--block" disabled={submit.pending}>
              {submit.pending ? dict.fin.common.saving : t.create}
            </button>
          </FormActions>
        </form>
      )}
    </div>
  );
}

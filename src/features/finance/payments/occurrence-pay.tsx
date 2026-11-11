"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { Account, Occurrence, OccurrencePaid } from "@/api/models";
import { paths } from "@/api/paths";
import { parsePositiveAmount } from "@/lib/amount-input";
import { daysBetween, formatDate, todayBogota } from "@/lib/dates";
import { compareAmounts, formatCop } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { fill, movementAccounts, relativeDays } from "../helpers";
import { useAll, useHref, useResource, useSubmit } from "../hooks";
import { AmountField, Banner, ErrorState, FormActions, Loading, Money, Progress, ScreenHeader, Segmented, SelectField, TextArea, TextField } from "../kit";
import { warningText } from "../movements/movement-form";

type How = "remaining" | "partial" | "final";

/** Marcar un pago (`/pagos/fijos/[id]/pagar`, diseño §3.5): lo que falta, «era todo» con otro valor, o un abono. */
export function OccurrencePay({ id }: { id: string }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.fixed;
  const href = useHref();
  const submit = useSubmit();
  const skip = useSubmit();
  const occurrence = useResource<Occurrence>(paths.occurrence(id));
  const accounts = useAll<Account>(paths.accounts());
  const [how, setHow] = useState<How>("remaining");
  const [amountText, setAmountText] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [date, setDate] = useState(todayBogota());
  const [reason, setReason] = useState("");
  const [skipping, setSkipping] = useState(false);
  const [result, setResult] = useState<OccurrencePaid | null>(null);
  const [skipped, setSkipped] = useState(false);

  const back = { href: href("pagos-fijos"), label: dict.screens["pagos-fijos"] };
  const o = occurrence.data;
  const sources = movementAccounts(accounts.items);
  const from = fromAccount || sources[0]?.id || "";
  const amount = how === "remaining" ? null : parsePositiveAmount(amountText);
  const valid = from !== "" && (how === "remaining" || amount !== null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    const body = { mode: how, account_id: from, date, ...(how !== "remaining" ? { amount: amount! } : {}) };
    const response = await submit.run(body, (key) => api.post<OccurrencePaid>(paths.occurrenceAction(id, "pay"), body, { idempotencyKey: key, locale }));
    if (response.ok) setResult(response.data);
  }

  async function onSkip(event: React.FormEvent) {
    event.preventDefault();
    if (reason.trim() === "") return;
    const body = { reason: reason.trim() };
    const response = await skip.run(body, (key) => api.post(paths.occurrenceAction(id, "skip"), body, { idempotencyKey: key, locale }));
    if (response.ok) setSkipped(true);
  }

  if (occurrence.loading && !o) return <div className="screen"><ScreenHeader title={dict.screens["pagos-fijo-pagar"]} back={back} /><Loading /></div>;
  if (occurrence.failure || !o) {
    return (
      <div className="screen">
        <ScreenHeader title={dict.screens["pagos-fijo-pagar"]} back={back} />
        <ErrorState message={occurrence.failure?.status === 404 ? dict.fin.errors.notFound : dict.fin.errors.generic} onRetry={occurrence.reload} />
      </div>
    );
  }

  const today = todayBogota();
  const done = result !== null || skipped;
  const live = result?.occurrence ?? o;
  return (
    <div className="screen screen--form">
      <ScreenHeader title={o.name} eyebrow={dict.screens["pagos-fijo-pagar"]} back={back} />
      <section className="fin-card" aria-label={t.progress}>
        <p>
          <Money value={live.paid} /> {t.paidOfShort} <Money value={live.expected} estimated={live.estimated} />
        </p>
        <Progress percent={live.percent} label={`${live.name}: ${live.percent}%`} tone="positive" />
        <p className="muted">
          {t.dueOn} {formatDate(live.adjusted_date)} ({relativeDays(daysBetween(today, live.adjusted_date), dict.fin.relative)})
        </p>
      </section>

      {skipped && (
        <Banner tone="positive">
          <p>{t.skippedDone}</p>
        </Banner>
      )}
      {result && (
        <Banner tone="positive">
          <p>{t.paidDone}</p>
          {compareAmounts(result.overpaid, "0") > 0 && (
            <p>
              {t.overpaid} <Money value={result.overpaid} />
            </p>
          )}
          {result.warnings.map((w, i) => (
            <p key={`${w.code}-${i}`}>{warningText(w, dict.fin.warnings, accounts.items)}</p>
          ))}
        </Banner>
      )}
      {done && (
        <div className="actions">
          <Link className="button button--primary" href={back.href}>
            {back.label}
          </Link>
        </div>
      )}

      {!done && live.status !== "open" && <Banner tone="warning">{live.status === "paid" ? t.alreadyPaid : t.alreadySkipped}</Banner>}

      {!done && live.status === "open" && !skipping && (
        <form onSubmit={onSubmit} className="fin-form" noValidate>
          <Segmented
            legend={t.how}
            options={[
              { value: "remaining", label: `${t.payRemaining} ${formatCop(live.pending)}` },
              { value: "partial", label: t.payPartial },
              { value: "final", label: t.payFinal },
            ]}
            value={how}
            onChange={(v) => setHow(v as How)}
          />
          {how !== "remaining" && <AmountField label={t.otherAmount} hint={how === "partial" ? t.partialHint : t.finalHint} value={amountText} onChange={setAmountText} required error={amountText && !amount ? dict.fin.common.invalidAmount : null} preview={amount ? formatCop(amount) : null} />}
          <SelectField label={t.payFrom} value={from} onChange={setFromAccount} options={sources.map((a) => ({ value: a.id, label: a.name }))} />
          <TextField label={dict.fin.form.date} type="date" value={date} onChange={setDate} required />
          {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
          <FormActions>
            <button type="submit" className="button button--primary" disabled={submit.pending || !valid}>
              {submit.pending ? dict.fin.common.saving : t.pay}
            </button>
            <button type="button" className="button button--ghost" onClick={() => setSkipping(true)}>
              {t.skip}
            </button>
          </FormActions>
        </form>
      )}

      {!done && live.status === "open" && skipping && (
        <form onSubmit={onSkip} className="fin-form" noValidate>
          <p className="muted">{fill(t.skipIntro, { name: live.name })}</p>
          <TextArea label={t.skipReason} value={reason} onChange={setReason} required maxLength={280} />
          {skip.error && <Banner tone="negative" live="assertive">{skip.error}</Banner>}
          <FormActions>
            <button type="submit" className="button button--primary" disabled={skip.pending || reason.trim() === ""}>
              {skip.pending ? dict.fin.common.saving : t.skip}
            </button>
            <button type="button" className="button button--ghost" onClick={() => setSkipping(false)}>
              {dict.common.cancel}
            </button>
          </FormActions>
        </form>
      )}
    </div>
  );
}

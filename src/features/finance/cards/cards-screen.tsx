"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { Card, Institution } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { normalizeAmountInput, percentToFraction } from "@/lib/amount-input";
import { toInt } from "@/lib/ints";
import { formatCop } from "@/lib/money";
import { formatDateShort, todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { useAll, useHref, useResource, useSubmit } from "../hooks";
import { AmountField, Badge, Banner, Empty, ErrorState, FormActions, Loading, Modal, Money, Progress, Section, SelectField, TextField } from "../kit";

export const RATE_CONVENTIONS = ["EA", "EM", "ET", "ED", "NMV", "NTV", "NAV"] as const;
export type RateConventionCode = (typeof RATE_CONVENTIONS)[number];

/** Las tarjetas de crédito: cupo usado, disponible y fechas (todo derivado del libro). `embedded` = dentro de «Cuentas». */
export function CardList({ embedded = false }: { embedded?: boolean }) {
  const { dict } = useI18n();
  const t = dict.fin.cards;
  const cards = useAll<Card>(paths.cards());
  const [creating, setCreating] = useState(false);

  const body = (
    <>
      {cards.loading && !cards.data && <Loading />}
      {cards.failure && <ErrorState message={dict.fin.errors.generic} onRetry={cards.reload} />}
      {cards.data && cards.items.length === 0 && (
        <Empty
          icon="card"
          title={t.emptyTitle}
          body={t.emptyBody}
          action={
            <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
              {t.addFirst}
            </button>
          }
        />
      )}
      {cards.items.length > 0 && (
        <ul className="fin-list">
          {cards.items.map((card) => (
            <li key={card.id}>
              <CardTile card={card} />
            </li>
          ))}
        </ul>
      )}
      <Modal open={creating} title={t.add} onClose={() => setCreating(false)}>
        <CardForm
          onCancel={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            cards.reload();
          }}
        />
      </Modal>
    </>
  );

  if (embedded) {
    return (
      <Section
        title={t.title}
        aside={
          cards.items.length > 0 ? (
            <button type="button" className="button button--ghost" onClick={() => setCreating(true)}>
              {t.add}
            </button>
          ) : undefined
        }
      >
        {body}
      </Section>
    );
  }
  return (
    <>
      {cards.items.length > 0 && (
        <div className="actions">
          <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={20} />
            {t.add}
          </button>
        </div>
      )}
      {body}
    </>
  );
}

function CardTile({ card }: { card: Card }) {
  const { dict } = useI18n();
  const t = dict.fin.cards;
  const href = useHref();
  return (
    <Link href={href("tarjeta", [card.id])} className="fin-row fin-row--card">
      <span className="fin-row__main">
        <span className="fin-row__title">
          {card.name}
          {card.last4 ? ` · •••• ${card.last4}` : ""}
        </span>
        <span className="fin-row__sub muted">
          {t.used} <Money value={card.used} /> {t.of} <Money value={card.limit} />
        </span>
        <Progress percent={card.utilization_percent} label={`${t.utilization}: ${card.utilization_percent}%`} tone={card.utilization_percent >= 90 ? "negative" : card.utilization_percent >= 70 ? "warning" : "primary"} />
        <span className="fin-row__sub muted">
          {t.cutoff} {formatDateShort(card.next_cutoff)} · {t.payment} {formatDateShort(card.next_payment_date)}
        </span>
        {card.status !== "active" && (
          <span className="fin-row__badges">
            <Badge tone="warning">{dict.fin.accounts.status[card.status]}</Badge>
          </span>
        )}
      </span>
      <span className="fin-row__amount">
        <span className="muted">{t.available}</span>
        <Money value={card.available} />
      </span>
      <Icon name="chevron-right" size={20} />
    </Link>
  );
}

function CardForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.cards;
  const submit = useSubmit();
  const institutions = useResource<Institution[]>(paths.institutions());
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [limit, setLimit] = useState("");
  const [cutDay, setCutDay] = useState("");
  const [payDay, setPayDay] = useState("");
  const [rate, setRate] = useState("");
  const [convention, setConvention] = useState<RateConventionCode>("EA");
  const [last4, setLast4] = useState("");
  const [owed, setOwed] = useState("");
  const [touched, setTouched] = useState(false);

  const limitValue = normalizeAmountInput(limit);
  const cut = toInt(cutDay, 1, 31);
  const pay = toInt(payDay, 1, 31);
  const rateValue = rate.trim() === "" ? "0" : percentToFraction(rate);
  const owedValue = owed.trim() === "" ? "0" : normalizeAmountInput(owed);
  const last4Bad = last4 !== "" && !/^\d{4}$/.test(last4);
  const valid = name.trim() !== "" && limitValue !== null && cut !== null && pay !== null && rateValue !== null && owedValue !== null && !last4Bad;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const body = {
      name: name.trim(),
      limit: limitValue!,
      cut_day: cut!,
      pay_day: pay!,
      rate: rateValue!,
      rate_convention: convention,
      opening_balance: owedValue!,
      opening_date: todayBogota(),
      ...(issuer ? { issuer_id: toInt(issuer) } : {}),
      ...(last4 ? { last4 } : {}),
    };
    const result = await submit.run(body, (key) => api.post(roots.cards, body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  const req = dict.fin.common.requiredField;
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <TextField label={t.fields.name} value={name} onChange={setName} maxLength={80} required error={touched && name.trim() === "" ? req : null} />
      <SelectField label={t.fields.issuer} value={issuer} onChange={setIssuer} placeholder={dict.fin.accounts.noInstitution} options={(institutions.data ?? []).map((i) => ({ value: String(i.id), label: i.name }))} />
      <AmountField label={t.fields.limit} value={limit} onChange={setLimit} required error={touched && limitValue === null ? dict.fin.common.invalidAmount : null} preview={limitValue ? formatCop(limitValue) : null} />
      <div className="fin-grid-2">
        <TextField label={t.fields.cutDay} value={cutDay} onChange={setCutDay} inputMode="numeric" maxLength={2} required error={touched && cut === null ? t.dayInvalid : null} />
        <TextField label={t.fields.payDay} value={payDay} onChange={setPayDay} inputMode="numeric" maxLength={2} required error={touched && pay === null ? t.dayInvalid : null} />
      </div>
      <div className="fin-grid-2">
        <TextField label={t.fields.rate} hint={t.fields.rateHint} value={rate} onChange={setRate} inputMode="decimal" error={touched && rateValue === null ? t.rateInvalid : null} />
        <SelectField label={t.fields.convention} value={convention} onChange={(v) => setConvention(v as RateConventionCode)} options={RATE_CONVENTIONS.map((c) => ({ value: c, label: c }))} />
      </div>
      <AmountField label={t.fields.owed} hint={t.fields.owedHint} value={owed} onChange={setOwed} error={touched && owedValue === null ? dict.fin.common.invalidAmount : null} />
      <TextField label={dict.fin.accounts.fields.last4} value={last4} onChange={setLast4} inputMode="numeric" maxLength={4} error={last4Bad ? dict.fin.accounts.last4Invalid : null} />
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

"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Card, CardAdjustment, CardFee, CardFees, CardRate, CardRates, Movement } from "@/api/models";
import { paths } from "@/api/paths";
import { fractionToPercent, normalizeAmountInput, percentToFraction } from "@/lib/amount-input";
import { formatDate, todayBogota } from "@/lib/dates";
import { compareAmounts, formatCop } from "@/lib/money";
import { formatPercent } from "@/lib/percent";
import { useI18n } from "@/i18n/provider";
import { ConventionSelect, useConventionLabel, type RateConventionCode } from "../conventions";
import { UsuryRateCheck } from "../credit/usury-check";
import { fill } from "../helpers";
import { useHref, useResource, useSubmit } from "../hooks";
import { AmountField, Badge, Banner, DefinitionList, ErrorState, FormActions, Loading, Modal, Money, ScreenHeader, Section, SelectField, TextField } from "../kit";

/** «Tasas» de la tarjeta (`/tarjetas/[id]/tasas`): historial con vigencia, ajustes sugeridos y cuota de manejo y seguro. */
export function CardRatesScreen({ id }: { id: string }) {
  const { dict, locale } = useI18n();
  const convName = useConventionLabel();
  const t = dict.fin.rates;
  const href = useHref();
  const card = useResource<Card>(paths.card(id));
  const rates = useResource<CardRates>(paths.cardRates(id));
  const [editing, setEditing] = useState<CardRate | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const remove = useSubmit();
  const [notice, setNotice] = useState<string | null>(null);
  const today = todayBogota();
  const variable = (rates.data?.rate_type ?? card.data?.rate_type) === "variable";
  const sorted = [...(rates.data?.rates ?? [])].sort((a, b) => (a.valid_from < b.valid_from ? 1 : a.valid_from > b.valid_from ? -1 : 0));
  const inForce = sorted.find((rate) => rate.valid_from <= today)?.id ?? null;
  const back = { href: href("tarjeta", [id]), label: card.data?.name ?? dict.screens.tarjeta };

  async function onDelete(rate: CardRate) {
    const result = await remove.run({ delete: rate.id }, () => api.delete<CardRates>(paths.cardRate(id, rate.id), { locale }));
    if (result.ok) {
      setConfirmDelete(null);
      setNotice(t.deleted);
      rates.reload();
    }
  }

  return (
    <div className="screen">
      <ScreenHeader title={t.cardTitle} eyebrow={card.data?.name} back={back} />
      <p className="muted">{t.intro}</p>
      {card.failure && <ErrorState message={card.failure.status === 404 ? dict.fin.errors.notFound : dict.fin.errors.generic} onRetry={card.reload} />}
      {rates.loading && !rates.data && <Loading />}
      {rates.failure && <ErrorState message={dict.fin.errors.generic} onRetry={rates.reload} />}
      {rates.data && !variable && <Banner tone="warning">{t.fixedNotice}</Banner>}
      {rates.data?.rate_outdated && <Banner tone="warning">{t.outdated}</Banner>}
      {notice && <Banner tone="positive">{notice}</Banner>}

      {rates.data && (
        <Section
          title={t.title}
          aside={
            variable ? (
              <button type="button" className="button button--ghost" onClick={() => setEditing("new")}>
                {t.add}
              </button>
            ) : undefined
          }
        >
          {sorted.length === 0 && <p className="muted">{t.none}</p>}
          <ul className="fin-list">
            {sorted.map((rate) => (
              <li key={rate.id} className="fin-row fin-row--static">
                <span className="fin-row__main">
                  <span className="fin-row__title">
                    {formatPercent(fractionToPercent(rate.rate, 4), locale, 4)} {convName(rate.convention)}
                  </span>
                  <span className="fin-row__sub muted">
                    {t.validFrom} {formatDate(rate.valid_from)}
                    {rate.source ? ` · ${rate.source}` : ""}
                  </span>
                  {rate.id === inForce && <Badge tone="info">{t.inForce}</Badge>}
                  {confirmDelete === rate.id && (
                    <span className="stm-confirm" role="group" aria-label={fill(t.confirmDelete, { date: formatDate(rate.valid_from) })}>
                      <span>{fill(t.confirmDelete, { date: formatDate(rate.valid_from) })}</span>
                      <button type="button" className="button button--primary" disabled={remove.pending} onClick={() => void onDelete(rate)}>
                        {t.confirmYes}
                      </button>
                      <button type="button" className="button button--ghost" onClick={() => setConfirmDelete(null)}>
                        {dict.common.cancel}
                      </button>
                    </span>
                  )}
                </span>
                {variable && confirmDelete !== rate.id && (
                  <span className="actions">
                    <button type="button" className="button button--ghost" onClick={() => setEditing(rate)}>
                      {t.edit}
                    </button>
                    <button type="button" className="button button--ghost" onClick={() => { remove.clearError(); setConfirmDelete(rate.id); }}>
                      {t.delete}
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {remove.error && <Banner tone="negative" live="assertive">{remove.error}</Banner>}
        </Section>
      )}

      {rates.data && rates.data.adjustments.length > 0 && <AdjustmentsPanel cardId={id} adjustments={rates.data.adjustments} />}

      <FeesPanel cardId={id} />

      <Modal open={editing !== null} title={editing === "new" || editing === null ? t.add : t.edit} onClose={() => setEditing(null)}>
        {editing !== null && (
          <RateForm
            cardId={id}
            rate={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onDone={() => {
              setEditing(null);
              setNotice(t.saved);
              rates.reload();
              card.reload();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function RateForm({ cardId, rate, onDone, onCancel }: { cardId: string; rate: CardRate | null; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.rates;
  const submit = useSubmit();
  const [text, setText] = useState(rate ? fractionToPercent(rate.rate, 6) : "");
  const [convention, setConvention] = useState<RateConventionCode>((rate?.convention as RateConventionCode | undefined) ?? "EA");
  const [validFrom, setValidFrom] = useState(rate?.valid_from ?? todayBogota());
  const [source, setSource] = useState(rate?.source ?? "");
  const [touched, setTouched] = useState(false);
  const fraction = percentToFraction(text);
  const valid = fraction !== null && validFrom !== "";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const common = { rate: fraction!, valid_from: validFrom, source: source.trim() === "" ? null : source.trim() };
    const result = rate
      ? await submit.run({ edit: rate.id, ...common, convention }, () => api.patch<CardRates>(paths.cardRate(cardId, rate.id), { ...common, convention }, { locale }))
      : await submit.run({ ...common, rate_convention: convention }, (key) => api.post<CardRates>(paths.cardRates(cardId), { ...common, rate_convention: convention }, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <div className="fin-grid-2">
        <TextField label={t.rate} help={dict.fin.help.texts.rate} hint={dict.fin.cards.fields.rateHint} value={text} onChange={setText} inputMode="decimal" required error={touched && fraction === null ? dict.fin.cards.rateInvalid : null} />
        <ConventionSelect label={t.convention} value={convention} onChange={setConvention} />
      </div>
      <UsuryRateCheck rate={fraction} convention={convention} on={validFrom} />
      <TextField label={t.validFrom} type="date" value={validFrom} onChange={setValidFrom} required />
      <TextField label={t.source} hint={t.sourceHint} value={source} onChange={setSource} maxLength={120} />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : t.save}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

/**
 * Ajustes SUGERIDOS por una tasa retroactiva: el servidor no escribe nada. Si falta cargar (diferencia positiva), la persona puede
 * registrarlo como un cargo de interés con el endpoint de cargos existente, tras confirmar el monto.
 */
function AdjustmentsPanel({ cardId, adjustments }: { cardId: string; adjustments: readonly CardAdjustment[] }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.rates;
  const submit = useSubmit();
  const [confirming, setConfirming] = useState<number | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set());

  async function register(adjustment: CardAdjustment, index: number) {
    const body = { kind: "interest" as const, date: todayBogota(), amount: adjustment.difference };
    const result = await submit.run({ ...body, cutoff: adjustment.cutoff, n: adjustment.installment_number }, (key) => api.post<Movement>(paths.cardAction(cardId, "charges"), body, { idempotencyKey: key, locale }));
    if (result.ok) {
      setConfirming(null);
      setDone((prev) => new Set(prev).add(index));
    }
  }

  return (
    <Section title={t.adjustments}>
      <p className="muted">{t.adjustmentsIntro}</p>
      <ul className="fin-list">
        {adjustments.map((adjustment, index) => {
          const missing = compareAmounts(adjustment.difference, "0") > 0;
          const title = adjustment.kind === "installment" ? fill(t.adjustmentInstallment, { n: String(adjustment.installment_number ?? ""), date: formatDate(adjustment.cutoff) }) : fill(t.adjustmentRevolving, { date: formatDate(adjustment.cutoff) });
          return (
            <li key={`${adjustment.cutoff}-${adjustment.purchase_id ?? "saldo"}-${adjustment.installment_number ?? 0}`} className="fin-row fin-row--static">
              <span className="fin-row__main">
                <span className="fin-row__title">{title}</span>
                <DefinitionList
                  rows={[
                    { label: t.billed, value: <Money value={adjustment.billed_interest} /> },
                    { label: t.expected, value: <Money value={adjustment.expected_interest} /> },
                    { label: t.difference, value: <Money value={adjustment.difference} sign="always" /> },
                  ]}
                />
                {!missing && <span className="hint">{t.registerOnlyPositive}</span>}
                {done.has(index) && <Badge tone="positive">{t.registered}</Badge>}
                {missing && !done.has(index) && confirming !== index && (
                  <button type="button" className="button button--ghost" onClick={() => { submit.clearError(); setConfirming(index); }}>
                    {t.register}
                  </button>
                )}
                {confirming === index && (
                  <span className="stm-confirm" role="group" aria-label={t.register}>
                    <span>{fill(t.registerConfirm, { amount: formatCop(adjustment.difference) })}</span>
                    <button type="button" className="button button--primary" disabled={submit.pending} onClick={() => void register(adjustment, index)}>
                      {t.registerYes}
                    </button>
                    <button type="button" className="button button--ghost" onClick={() => setConfirming(null)}>
                      {dict.common.cancel}
                    </button>
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
    </Section>
  );
}

/** «Cuota de manejo y seguro»: montos mensuales con vigencia. Agregar (un monto 0 termina el cobro) y borrar. */
export function FeesPanel({ cardId }: { cardId: string }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.fees;
  const fees = useResource<CardFees>(paths.cardFees(cardId));
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const remove = useSubmit();
  const sorted = [...(fees.data?.fees ?? [])].sort((a, b) => (a.valid_from < b.valid_from ? 1 : a.valid_from > b.valid_from ? -1 : 0));

  async function onDelete(fee: CardFee) {
    const result = await remove.run({ delete: fee.id }, () => api.delete<CardFees>(paths.cardFee(cardId, fee.id), { locale }));
    if (result.ok) {
      setConfirming(null);
      fees.reload();
    }
  }

  return (
    <Section
      title={t.title}
      aside={
        <button type="button" className="button button--ghost" onClick={() => setAdding(true)}>
          {t.add}
        </button>
      }
    >
      <p className="muted">{t.intro}</p>
      {fees.loading && !fees.data && <Loading />}
      {fees.failure && <ErrorState message={dict.fin.errors.generic} onRetry={fees.reload} />}
      {fees.data && sorted.length === 0 && <p className="muted">{t.none}</p>}
      <ul className="fin-list">
        {sorted.map((fee) => (
          <li key={fee.id} className="fin-row fin-row--static">
            <span className="fin-row__main">
              <span className="fin-row__title">{fee.kind === "insurance" ? t.insurance : t.handling_fee}</span>
              <span className="fin-row__sub muted">
                {t.validFrom} {formatDate(fee.valid_from)}
              </span>
              {confirming === fee.id && (
                <span className="stm-confirm" role="group" aria-label={t.confirmDelete}>
                  <span>{t.confirmDelete}</span>
                  <button type="button" className="button button--primary" disabled={remove.pending} onClick={() => void onDelete(fee)}>
                    {t.confirmYes}
                  </button>
                  <button type="button" className="button button--ghost" onClick={() => setConfirming(null)}>
                    {dict.common.cancel}
                  </button>
                </span>
              )}
            </span>
            <span className="fin-row__amount">{compareAmounts(fee.amount, "0") === 0 ? t.ended : <Money value={fee.amount} />}</span>
            {confirming !== fee.id && (
              <button type="button" className="button button--ghost" aria-label={`${t.delete}: ${fee.kind === "insurance" ? t.insurance : t.handling_fee} ${formatDate(fee.valid_from)}`} onClick={() => { remove.clearError(); setConfirming(fee.id); }}>
                {t.delete}
              </button>
            )}
          </li>
        ))}
      </ul>
      {remove.error && <Banner tone="negative" live="assertive">{remove.error}</Banner>}
      <Modal open={adding} title={t.add} onClose={() => setAdding(false)}>
        {adding && (
          <FeeForm
            cardId={cardId}
            onCancel={() => setAdding(false)}
            onDone={() => {
              setAdding(false);
              fees.reload();
            }}
          />
        )}
      </Modal>
    </Section>
  );
}

function FeeForm({ cardId, onDone, onCancel }: { cardId: string; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.fees;
  const submit = useSubmit();
  const [kind, setKind] = useState<"handling_fee" | "insurance">("handling_fee");
  const [amountText, setAmountText] = useState("");
  const [validFrom, setValidFrom] = useState(todayBogota());
  const [touched, setTouched] = useState(false);
  const amount = normalizeAmountInput(amountText);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (amount === null || validFrom === "") return;
    const body = { kind, amount, valid_from: validFrom };
    const result = await submit.run(body, (key) => api.post<CardFees>(paths.cardFees(cardId), body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <SelectField label={t.kind} value={kind} onChange={(v) => setKind(v as "handling_fee" | "insurance")} help={kind === "insurance" ? dict.fin.help.texts.insurance : dict.fin.help.texts.handlingFee} options={[{ value: "handling_fee", label: t.handling_fee }, { value: "insurance", label: t.insurance }]} />
      <AmountField label={t.amount} hint={t.intro} value={amountText} onChange={setAmountText} required error={touched && amount === null ? dict.fin.common.invalidAmount : null} />
      <TextField label={t.validFrom} type="date" value={validFrom} onChange={setValidFrom} required />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : t.save}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

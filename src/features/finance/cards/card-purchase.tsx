"use client";

import { useEffect, useState } from "react";
import { api } from "@/api";
import type { ApiResult } from "@/api/client";
import type { Account, Card, Category, Purchase, Simulation } from "@/api/models";
import { paths } from "@/api/paths";
import { fractionToPercent, parsePositiveAmount, percentToFraction } from "@/lib/amount-input";
import { toInt } from "@/lib/ints";
import { compareAmounts, formatCop } from "@/lib/money";
import { formatDate, todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { useAll, useHref, useResource, useSubmit } from "../hooks";
import { useConventionLabel } from "../conventions";
import { AmountField, Banner, ErrorState, FormActions, Loading, Money, ScreenHeader, SelectField, SpentFigure, TextField } from "../kit";
import { warningText } from "../movements/movement-form";
import { ConventionSelect, type RateConventionCode } from "../conventions";

/**
 * Simular y registrar una compra con tarjeta (diseño §3.7): valor, cuotas y tasa; el plan sale del servidor (capital e interés en
 * columnas separadas) y «Gastado» muestra, grande y en naranja, el costo total real y, pequeño y en rojo, el valor de la compra.
 */
export function PurchasePanel({ card, simulator = false, onDone }: { card: Card; simulator?: boolean; onDone?: () => void }) {
  const { dict, locale } = useI18n();
  const convName = useConventionLabel();
  const t = dict.fin.purchase;
  const submit = useSubmit();
  const categories = useAll<Category>(paths.categories({ archived: false, kind: "expense" }));
  const accounts = useAll<Account>(paths.accounts());
  const [amountText, setAmountText] = useState("");
  const [installmentsText, setInstallmentsText] = useState("1");
  const [rateText, setRateText] = useState("");
  const [convention, setConvention] = useState<RateConventionCode>(card.rate_convention);
  const [date, setDate] = useState(todayBogota());
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [saved, setSaved] = useState<Purchase | null>(null);
  const [touched, setTouched] = useState(false);

  const amount = parsePositiveAmount(amountText);
  const installments = toInt(installmentsText, 1, 48);
  const rateFraction = rateText.trim() === "" ? null : percentToFraction(rateText);
  const rateInvalid = rateText.trim() !== "" && rateFraction === null;
  const blocked = card.status !== "active";

  // La vista previa del plan: el servidor calcula; aquí solo se pide, con una espera de 350 ms al teclear.
  const simKey = amount && installments && !rateInvalid ? JSON.stringify({ amount, installments, date, ...(rateFraction !== null ? { rate: rateFraction, rate_convention: convention } : {}) }) : null;
  const [sim, setSim] = useState<{ key: string; result: ApiResult<Simulation> } | null>(null);
  useEffect(() => {
    if (simKey === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api.post<Simulation>(paths.cardAction(card.id, "simulate"), JSON.parse(simKey), { signal: controller.signal }).then((result) => {
        if (!controller.signal.aborted) setSim({ key: simKey, result });
      });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [simKey, card.id]);
  const preview = simKey !== null && sim?.key === simKey ? sim.result : null;
  const previewLoading = simKey !== null && preview === null;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!amount || !installments || rateInvalid || blocked) return;
    const body = {
      amount,
      date,
      installments,
      ...(rateFraction !== null ? { rate: rateFraction, rate_convention: convention } : {}),
      ...(category ? { category_id: category } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    };
    const result = await submit.run(body, (key) => api.post<Purchase>(paths.cardAction(card.id, "purchases"), body, { idempotencyKey: key, locale }));
    if (result.ok) setSaved(result.data);
  }

  if (saved) {
    return (
      <div className="fin-form">
        <Banner tone="positive">
          <p>{t.saved}</p>
          {saved.warnings.map((w, i) => (
            <p key={`${w.code}-${i}`}>{warningText(w, dict.fin.warnings, accounts.items)}</p>
          ))}
        </Banner>
        <SpentFigure totalRealCost={saved.plan.total_real_cost} purchaseValue={saved.plan.purchase_value} />
        <PlanTable rows={saved.plan.rows} />
        <FormActions>
          <button type="button" className="button button--primary" onClick={onDone}>
            {t.done}
          </button>
        </FormActions>
      </div>
    );
  }

  const data = preview?.ok ? preview.data : null;
  const noInterest = data ? compareAmounts(data.total_interest, "0") === 0 : false;
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      {blocked && <Banner tone="warning">{t.blocked}</Banner>}
      <AmountField label={t.amount} value={amountText} onChange={setAmountText} required error={touched && !amount ? dict.fin.common.invalidAmount : null} />
      <div className="fin-grid-2">
        <TextField label={t.installments} hint={t.installmentsHint} value={installmentsText} onChange={setInstallmentsText} inputMode="numeric" maxLength={2} required error={touched && !installments ? t.installmentsInvalid : null} />
        <TextField label={t.rate} help={dict.fin.help.texts.rate} hint={`${t.rateHint} ${fractionToPercent(card.rate)} % ${convName(card.rate_convention)}`} value={rateText} onChange={setRateText} inputMode="decimal" error={rateInvalid ? t.rateInvalid : null} />
      </div>
      {rateText.trim() !== "" && <ConventionSelect label={t.convention} value={convention} onChange={setConvention} />}

      <div aria-live="polite" className="fin-sim">
        {previewLoading && <Loading />}
        {preview && !preview.ok && <ErrorState message={dict.fin.errors.generic} />}
        {data && (
          <>
            <p className="fin-phrase">
              {fill(noInterest ? t.noInterest : t.withInterest, { n: String(data.installments) })} <Money value={data.first_payment} />
              {noInterest ? null : (
                <>
                  {" "}
                  · {t.totalInterest} <Money value={data.total_interest} />
                </>
              )}
            </p>
            <SpentFigure totalRealCost={data.total_real_cost} purchaseValue={data.purchase_value} />
            {data.exceeds_limit ? (
              <Banner tone="warning">{fill(t.exceedsLimit, { available: formatCop(card.available) })}</Banner>
            ) : (
              <p className="muted">
                {t.availableAfter} <Money value={data.available_after} />
              </p>
            )}
            <details className="fin-details">
              <summary>{t.viewPlan}</summary>
              <PlanTable rows={data.rows} />
            </details>
          </>
        )}
      </div>

      <TextField label={t.date} type="date" value={date} onChange={setDate} required />
      <SelectField label={dict.fin.form.category} value={category} onChange={setCategory} placeholder={dict.fin.form.noCategory} options={categories.items.map((c) => ({ value: c.id, label: c.path.join(" › ") }))} />
      <TextField label={dict.fin.form.description} value={description} onChange={setDescription} maxLength={200} />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending || blocked || !amount || !installments}>
          {submit.pending ? dict.fin.common.saving : simulator ? t.registerThis : t.register}
        </button>
      </FormActions>
    </form>
  );
}

export function PlanTable({ rows }: { rows: readonly { number: number; due_date: string; capital: string; interest: string; payment: string }[] }) {
  const { dict } = useI18n();
  const t = dict.fin.purchase;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">{t.number}</th>
            <th scope="col">{t.dueDate}</th>
            <th scope="col" className="table__num">{t.capital}</th>
            <th scope="col" className="table__num">{t.interest}</th>
            <th scope="col" className="table__num">{t.payment}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.number}>
              <th scope="row">{row.number}</th>
              <td>{formatDate(row.due_date)}</td>
              <td className="table__num"><Money value={row.capital} /></td>
              <td className="table__num"><Money value={row.interest} /></td>
              <td className="table__num"><Money value={row.payment} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** `/tarjetas/[id]/simular` */
export function CardSimulateScreen({ id }: { id: string }) {
  const { dict } = useI18n();
  const href = useHref();
  const card = useResource<Card>(paths.card(id));
  const back = { href: href("tarjeta", [id]), label: card.data?.name ?? dict.screens.tarjeta };
  return (
    <div className="screen screen--form">
      <ScreenHeader title={dict.screens["tarjeta-simular"]} back={back} />
      {card.loading && !card.data && <Loading />}
      {card.failure && <ErrorState message={card.failure.status === 404 ? dict.fin.errors.notFound : dict.fin.errors.generic} onRetry={card.reload} />}
      {card.data && <PurchasePanel card={card.data} simulator onDone={() => undefined} />}
    </div>
  );
}

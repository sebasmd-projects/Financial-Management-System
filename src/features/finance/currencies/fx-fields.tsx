"use client";

import Link from "next/link";
import type { Currency, ExchangeRate } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate } from "@/lib/dates";
import { formatForeign, formatRate } from "@/lib/decimal";
import { formatCop } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { useAll, useHref, useResource } from "../hooks";
import { Checkbox, Segmented, TextField } from "../kit";
import { resolveForeign, type ForeignResult, type ForeignState } from "./logic";

/** Monedas y tasas del cobro en otra moneda: solo se piden mientras la casilla está marcada. */
export function useForeign(state: ForeignState, date: string): { currencies: Currency[]; loading: boolean; result: ForeignResult } {
  const currencies = useResource<Currency[]>(state.enabled ? paths.currencies() : null);
  const list = currencies.data ?? [];
  // La moneda por defecto es la primera de la lista; la persona puede cambiarla.
  const effective = state.currency || list[0]?.code || "";
  const rates = useAll<ExchangeRate>(state.enabled && effective ? paths.exchangeRates({ currency: effective }) : null);
  const result = resolveForeign({ ...state, currency: effective }, list, rates.items, date);
  return { currencies: list, loading: state.enabled && ((currencies.loading && !currencies.data) || (rates.loading && !rates.data)), result };
}

/**
 * «Cobro en otra moneda» del formulario de movimiento (diseño §3.2 y §3.15): monto original, tasa (la registrada o una propia con
 * su fuente) y los pesos que resultan. El peso del libro lo calcula el servidor; aquí solo se muestra una vista previa.
 */
export function ForeignFields({ state, onChange, fx, touched }: { state: ForeignState; onChange: (next: ForeignState) => void; fx: ReturnType<typeof useForeign>; touched: boolean }) {
  const { dict } = useI18n();
  const t = dict.fin.fx.form2;
  const href = useHref();
  const set = (patch: Partial<ForeignState>) => onChange({ ...state, ...patch });
  const { result, currencies } = fx;
  const code = result.currency?.code ?? state.currency;
  const has = (problem: (typeof result.problems)[number]) => touched && result.problems.includes(problem);
  return (
    <div className="fin-more fin-form" data-testid="foreign-fields">
      <Checkbox label={t.toggle} hint={t.toggleHint} checked={state.enabled} onChange={(enabled) => set({ enabled })} />
      {state.enabled && (
        <>
          {!fx.loading && currencies.length === 0 && <p className="hint">{t.noCurrencies}</p>}
          {currencies.length > 0 && (
            <>
              <Segmented legend={t.currency} variant="chips" value={result.currency?.code ?? ""} onChange={(v) => set({ currency: v })} options={currencies.map((c) => ({ value: c.code, label: c.code }))} />
              <TextField
                label={fill(t.amount, { currency: code })}
                value={state.amount}
                onChange={(amount) => set({ amount })}
                inputMode="decimal"
                required
                error={has("amount") || (state.amount.trim() !== "" && result.problems.includes("amount")) ? fill(t.amountInvalid, { currency: code, decimals: String(result.currency?.decimals ?? 2) }) : null}
              />
              {!state.ownRate && result.rate && (
                <p className="hint" data-testid="fx-rate">
                  {fill(t.rateFound, { currency: code, rate: formatRate(result.rate.value), date: formatDate(result.rate.on) })}. {fill(t.rateSource, { source: result.rate.source })}
                </p>
              )}
              {!state.ownRate && !fx.loading && result.problems.includes("rate_missing") && (
                <p className="field__error" role="alert" data-testid="fx-rate-missing">
                  {fill(t.rateMissing, { currency: code })} <Link href={href("config-monedas")}>{t.goToCurrencies}</Link>
                </p>
              )}
              <Checkbox label={t.ownRate} checked={state.ownRate} onChange={(ownRate) => set({ ownRate })} />
              {state.ownRate && (
                <>
                  <TextField label={fill(t.rate, { currency: code })} value={state.rate} onChange={(rate) => set({ rate })} inputMode="decimal" required error={has("rate_invalid") ? dict.fin.fx.form.rateInvalid : null} />
                  <TextField label={t.ownRateSource} hint={t.ownRateSourceHint} value={state.rateSource} onChange={(rateSource) => set({ rateSource })} maxLength={300} required error={has("source_required") ? dict.fin.errors.source_required : null} />
                </>
              )}
              {result.pesos && result.originalAmount && result.rate && (
                <div className="fin-phrase" aria-live="polite" data-testid="fx-preview">
                  <p>{fill(t.summary, { original: formatForeign(result.originalAmount, code, result.currency?.decimals ?? 2), rate: formatRate(result.rate.value), pesos: formatCop(result.pesos) })}</p>
                  <p className="hint">{t.previewNote}</p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

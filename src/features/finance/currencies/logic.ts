import type { Currency, ExchangeRate } from "@/api/models";
import { convertToPesos, parseForeignAmount, parseRateInput } from "@/lib/decimal";

/** La tasa vigente para una fecha: la más reciente que no sea posterior (igual que el servidor). Sin ninguna: `null` (no se inventa). */
export function pickRate(rates: readonly ExchangeRate[], currency: string, date: string): ExchangeRate | null {
  let best: ExchangeRate | null = null;
  for (const rate of rates) {
    if (rate.currency !== currency || rate.on > date) continue;
    if (best === null || rate.on > best.on) best = rate;
  }
  return best;
}

/** Las tasas de una moneda, de la más reciente a la más antigua. */
export function sortRates(rates: readonly ExchangeRate[]): ExchangeRate[] {
  return [...rates].sort((a, b) => (a.on === b.on ? 0 : a.on < b.on ? 1 : -1));
}

export interface ForeignState {
  enabled: boolean;
  currency: string;
  amount: string;
  /** Escribir una tasa propia en lugar de la que hay registrada. */
  ownRate: boolean;
  rate: string;
  rateSource: string;
}

export const EMPTY_FOREIGN: ForeignState = { enabled: false, currency: "", amount: "", ownRate: false, rate: "", rateSource: "" };

export type ForeignProblem = "currency" | "amount" | "rate_missing" | "rate_invalid" | "source_required";

export interface ForeignResult {
  /** La moneda elegida (con sus decimales), si hay. */
  currency: Currency | null;
  originalAmount: string | null;
  /** Tasa que se usará y de qué fecha/fuente; `null` si falta. */
  rate: { value: string; on: string; source: string; own: boolean } | null;
  /** Vista previa en pesos (el servidor es quien decide el valor que se asienta). */
  pesos: string | null;
  problems: ForeignProblem[];
  /** Campos del cuerpo de `POST movements` (sin `amount`: el servidor lo calcula). */
  body: Record<string, string> | null;
}

/** Resuelve el bloque «cobro en otra moneda»: validación, tasa elegida, vista previa en pesos y los campos que se envían. */
export function resolveForeign(state: ForeignState, currencies: readonly Currency[], rates: readonly ExchangeRate[], date: string): ForeignResult {
  const currency = currencies.find((c) => c.code === state.currency) ?? null;
  const problems: ForeignProblem[] = [];
  if (!currency) problems.push("currency");
  const originalAmount = currency ? parseForeignAmount(state.amount, currency.decimals) : null;
  if (currency && originalAmount === null) problems.push("amount");

  let rate: ForeignResult["rate"] = null;
  if (currency) {
    if (state.ownRate) {
      const value = parseRateInput(state.rate);
      if (value === null) problems.push("rate_invalid");
      else if (state.rateSource.trim() === "") problems.push("source_required");
      else rate = { value, on: date, source: state.rateSource.trim(), own: true };
    } else {
      const found = pickRate(rates, currency.code, date);
      if (found) rate = { value: found.rate, on: found.on, source: found.source, own: false };
      else problems.push("rate_missing");
    }
  }
  const pesos = originalAmount && rate ? convertToPesos(originalAmount, rate.value) : null;
  const body =
    currency && originalAmount && rate && problems.length === 0
      ? {
          original_amount: originalAmount,
          original_currency: currency.code,
          // Una tasa registrada la busca el servidor por la fecha; solo se envía la que la persona escribió.
          ...(rate.own ? { fx_rate: rate.value, fx_rate_date: rate.on, fx_source: rate.source } : {}),
        }
      : null;
  return { currency, originalAmount, rate, pesos, problems, body };
}

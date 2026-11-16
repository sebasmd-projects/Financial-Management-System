/**
 * Lógica pura del simulador de pagos y de las compras a cuotas vigentes (sin React): de lo que la persona escribe a la petición de la
 * API, o `null` si aún está incompleto. Solo cadenas decimales: nunca `Number`/`parseFloat` con dinero. Nada se guarda: los simuladores
 * calculan; los planes de apertura los escribe el servidor.
 */
import type { LoanPayRequest, OpeningPlanCreate, PayStrategyRequest, PayTargetRequest, RateConvention, StrategyOutcome, StrategyRow } from "@/api/models";
import { fractionToPercent, normalizeAmountInput, parsePositiveAmount, percentToFraction } from "@/lib/amount-input";
import { formatPercent } from "@/lib/percent";
import { isBusinessDate } from "@/lib/dates";
import { toInt } from "@/lib/ints";
import { absAmount, compareAmounts } from "@/lib/money";
import { scaleWidths } from "../charts-logic";

export const DEFER_TERM_CHOICES = [3, 6, 12, 24, 36, 48] as const;
export const DEFAULT_DEFER_TERMS: readonly number[] = [6, 12, 24];
export type Continue = "same" | "minimum" | "total";
export type Scope = "statement" | "all";
export type Goal = "no_interest" | "finish_in" | "max_payment";

export interface CardSimInputs {
  payAmount: string;
  continueWith: Continue;
  payNow: string;
  terms: readonly number[];
  deferRate: string;
  convention: RateConvention;
  scope: Scope;
}

export const EMPTY_CARD_SIM: CardSimInputs = { payAmount: "", continueWith: "same", payNow: "", terms: DEFAULT_DEFER_TERMS, deferRate: "", convention: "EA", scope: "statement" };

export type CardSimProblem = "pay_amount" | "pay_now" | "defer_rate" | null;

/** Un campo opcional de monto: vacío es válido (`undefined`); escrito pero inválido es un problema (`false`). */
function optionalAmount(text: string): string | undefined | false {
  if (text.trim() === "") return undefined;
  return parsePositiveAmount(text) ?? false;
}

/** `POST cards/{id}/simulators/payment-strategy`. Siempre se puede comparar (total y mínimo no piden nada); los campos escritos tienen que ser válidos. */
export function buildCardRequest(input: CardSimInputs): { body: PayStrategyRequest | null; problem: CardSimProblem } {
  const pay = optionalAmount(input.payAmount);
  const now = optionalAmount(input.payNow);
  const rate = input.deferRate.trim() === "" ? undefined : (percentToFraction(input.deferRate) ?? false);
  if (pay === false) return { body: null, problem: "pay_amount" };
  if (now === false) return { body: null, problem: "pay_now" };
  if (rate === false) return { body: null, problem: "defer_rate" };
  const terms = [...input.terms].sort((a, b) => a - b);
  return {
    body: {
      ...(pay !== undefined ? { pay_amount: pay } : {}),
      ...(now !== undefined ? { pay_now: now } : {}),
      continue_with: input.continueWith,
      defer_terms: terms,
      ...(rate !== undefined ? { defer_rate: rate, defer_rate_convention: input.convention } : {}),
      defer_scope: input.scope,
      horizon_months: 120,
    },
    problem: null,
  };
}

export interface TargetInputs {
  goal: Goal;
  months: string;
  maxPayment: string;
}

export const EMPTY_TARGET: TargetInputs = { goal: "no_interest", months: "", maxPayment: "" };

/** `POST cards/{id}/simulators/payment-target`: cada meta pide su dato (`finish_in` los meses, `max_payment` el techo de la cuota). */
export function buildTargetRequest(card: CardSimInputs, target: TargetInputs): PayTargetRequest | null {
  const base = buildCardRequest(card);
  if (!base.body) return null;
  const months = toInt(target.months, 1, 120);
  const cap = parsePositiveAmount(target.maxPayment);
  if (target.goal === "finish_in" && months === null) return null;
  if (target.goal === "max_payment" && cap === null) return null;
  return {
    ...base.body,
    goal: target.goal,
    ...(target.goal === "finish_in" && months !== null ? { months } : {}),
    ...(target.goal === "max_payment" && cap !== null ? { max_payment: cap } : {}),
  };
}

export interface LoanSimInputs {
  extra: string;
  months: string;
}

export const EMPTY_LOAN_SIM: LoanSimInputs = { extra: "", months: "" };

/** `POST loans/{id}/simulators/payment-strategy`: el abono y los meses son opcionales; escritos tienen que ser válidos. */
export function buildLoanRequest(input: LoanSimInputs): { body: LoanPayRequest | null; problem: "extra" | "months" | null } {
  const extra = optionalAmount(input.extra);
  if (extra === false) return { body: null, problem: "extra" };
  const months = input.months.trim() === "" ? undefined : (toInt(input.months, 1, 120) ?? false);
  if (months === false) return { body: null, problem: "months" };
  return { body: { ...(extra !== undefined ? { extra } : {}), ...(months !== undefined ? { months } : {}) }, problem: null };
}

/** El texto del rótulo de una estrategia: la clave del diccionario y sus variables. */
export function strategyLabel(o: StrategyOutcome): { key: "total" | "minimum" | "amount" | "defer" | "deferAll"; amount: string; n: string } {
  const terms = o.params.defer_terms;
  if (o.key === "defer") return { key: o.params.defer_scope === "all" ? "deferAll" : "defer", amount: o.pay_now, n: String(terms ?? "") };
  return { key: o.key, amount: o.pay_now, n: "" };
}

/** Las estrategias que se dibujan (hasta 4: la gráfica distingue por forma y rótulo): la más barata primero, y las demás en el orden recibido. */
export function chartPicks(outcomes: readonly StrategyOutcome[], limit = 4): StrategyOutcome[] {
  const cheapest = outcomes.filter((o) => o.cheapest);
  return [...cheapest, ...outcomes.filter((o) => !o.cheapest)].slice(0, limit);
}

export interface ChartMonth {
  number: number;
  due: string;
  amounts: (string | null)[];
  widths: number[];
}

/** Lo que se paga cada mes por estrategia (los primeros `months` extractos). Los anchos salen del mayor pago de todo el conjunto (`BigInt`, nunca `Number`). */
export function chartMonths(outcomes: readonly StrategyOutcome[], months: number): ChartMonth[] {
  const count = Math.min(months, Math.max(0, ...outcomes.map((o) => o.rows.length)));
  const flat: (string | null)[] = [];
  const grid: (string | null)[][] = [];
  for (let i = 0; i < count; i += 1) {
    const row = outcomes.map((o) => o.rows[i]?.payment ?? null);
    grid.push(row);
    flat.push(...row);
  }
  const widths = scaleWidths(flat);
  return grid.map((amounts, i) => ({
    number: i,
    due: outcomes.map((o) => o.rows[i]?.due_date).find((d): d is string => !!d) ?? "",
    amounts,
    widths: amounts.map((_, j) => widths[i * outcomes.length + j] ?? 0),
  }));
}

/** ¿Alguna estrategia quedó sin saldar al horizonte? */
export function anyTruncated(outcomes: readonly StrategyOutcome[]): boolean {
  return outcomes.some((o) => o.truncated);
}

/** El pago más alto de una fila de la tabla y si baja la deuda (para marcar el mes en que se «paga de más»). */
export function rowOwes(row: StrategyRow): boolean {
  return compareAmounts(row.balance_after, "0") > 0;
}

/** Cantidad de meses legible: «1 extracto» / «N extractos». */
export function monthsLabel(n: number, one: string, other: string): string {
  return n === 1 ? one : other.replace("{n}", String(n));
}

/** Lo que cuesta de más una estrategia (cadena; `0` en la más barata). */
export function extraCost(o: StrategyOutcome): string {
  return compareAmounts(o.extra_cost, "0") > 0 ? absAmount(o.extra_cost) : "0";
}

// --- compras a cuotas vigentes (planes de apertura) ----------------------------------------------------------------------------------

export interface OpeningInputs {
  purchaseDate: string;
  description: string;
  original: string;
  count: string;
  billed: string;
  remaining: string;
  rate: string;
  convention: RateConvention;
  nextDate: string;
  addToOpening: boolean;
}

export const EMPTY_OPENING: OpeningInputs = { purchaseDate: "", description: "", original: "", count: "", billed: "", remaining: "", rate: "", convention: "EA", nextDate: "", addToOpening: false };

export type OpeningProblem = "date" | "original" | "count" | "billed" | "remaining" | "rate" | "next" | null;

/**
 * `POST cards/{id}/opening-plans`. Las cuotas facturadas tienen que ser menos que las totales (si ya están todas, no queda nada que
 * registrar). El saldo, la tasa y la próxima cuota son opcionales; escritos tienen que ser válidos.
 */
export function buildOpening(input: OpeningInputs): { body: OpeningPlanCreate | null; problem: OpeningProblem } {
  if (!isBusinessDate(input.purchaseDate)) return { body: null, problem: input.purchaseDate === "" ? null : "date" };
  const original = parsePositiveAmount(input.original);
  if (original === null) return { body: null, problem: input.original.trim() === "" ? null : "original" };
  const count = toInt(input.count, 2, 48);
  if (count === null) return { body: null, problem: input.count.trim() === "" ? null : "count" };
  const billed = toInt(input.billed, 0, 47);
  if (billed === null) return { body: null, problem: "billed" };
  if (billed >= count) return { body: null, problem: "billed" };
  const remaining = input.remaining.trim() === "" ? undefined : (normalizeAmountInput(input.remaining) ?? false);
  if (remaining === false) return { body: null, problem: "remaining" };
  const rate = input.rate.trim() === "" ? undefined : (percentToFraction(input.rate) ?? false);
  if (rate === false) return { body: null, problem: "rate" };
  if (input.nextDate.trim() !== "" && !isBusinessDate(input.nextDate)) return { body: null, problem: "next" };
  return {
    body: {
      purchase_date: input.purchaseDate,
      description: input.description.trim(),
      original,
      count,
      billed,
      ...(remaining !== undefined ? { remaining } : {}),
      ...(rate !== undefined ? { rate, rate_convention: input.convention } : {}),
      ...(input.nextDate.trim() !== "" ? { next_date: input.nextDate } : {}),
      add_to_opening: input.addToOpening,
    },
    problem: null,
  };
}

export const OPENING_ACCEPTED = [".csv", ".txt", ".xlsx"] as const;

/** El multipart de `POST imports/opening-plans[/preview]`: el archivo se envía y no se guarda en ningún lado. */
export function buildOpeningUpload(file: File, cardId: string, addToOpening: boolean): FormData {
  const form = new FormData();
  form.set("file", file);
  form.set("card_id", cardId);
  form.set("add_to_opening", addToOpening ? "true" : "false");
  return form;
}

/** La huella de la intención de importar (para la `Idempotency-Key`): identifica el archivo sin leerlo. */
export function openingFingerprint(file: File, cardId: string, addToOpening: boolean): unknown {
  return { name: file.name, size: file.size, modified: file.lastModified, card: cardId, add: addToOpening };
}

export function openingFileProblem(file: File, maxBytes = 10 * 1024 * 1024): "extension" | "too_large" | null {
  const name = file.name.toLowerCase();
  if (!OPENING_ACCEPTED.some((ext) => name.endsWith(ext))) return "extension";
  return file.size > maxBytes ? "too_large" : null;
}

/** Una tasa fraccional de la API como porcentaje legible (`0.296` → «29,6 %»), sin `Number`. */
export function ratePercent(fraction: string, locale: "es" | "en"): string {
  return formatPercent(fractionToPercent(fraction, 4), locale, 4);
}

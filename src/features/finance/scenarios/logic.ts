/**
 * Lógica pura de escenarios e independencia financiera (FMS-3a, corte 3.2). Un escenario es un DATO (un nombre y una lista de
 * ajustes de una lista cerrada): no escribe en el libro. Los montos son cadenas decimales (hasta 2 decimales, nunca se redondean);
 * las tasas, fracciones. Nunca `Number`/`parseFloat` con dinero.
 */
import type { CompareColumn, IndependenceRequest, ScenarioAdjustment } from "@/api/models";
import { normalizeAmountInput, parsePositiveAmount, percentToFraction } from "@/lib/amount-input";
import { isBusinessDate } from "@/lib/dates";
import { toInt } from "@/lib/ints";

export const ADJUSTMENT_KINDS = ["cancel_recurrence", "change_income", "add_expense", "add_loan"] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];
export const LOAN_SYSTEMS = ["french", "constant_capital", "interest_only"] as const;
export const MAX_COMPARED = 3;
export const MAX_EXPENSE_MONTHS = 120;

/** Lo que se escribe en el formulario de un ajuste: todo texto hasta que se valida. */
export interface AdjustmentDraft {
  kind: AdjustmentKind;
  recurrence_id: string;
  start: string;
  until: string;
  monthly_delta: string;
  amount: string;
  months: string;
  principal: string;
  rate: string;
  convention: string;
  term: string;
  first_payment: string;
  system: string;
  insurance: string;
  disbursed_on: string;
}

export function emptyDraft(kind: AdjustmentKind, today: string): AdjustmentDraft {
  return { kind, recurrence_id: "", start: today, until: "", monthly_delta: "", amount: "", months: "", principal: "", rate: "", convention: "EA", term: "", first_payment: "", system: "french", insurance: "", disbursed_on: "" };
}

export type AdjustmentField = keyof Omit<AdjustmentDraft, "kind">;

/** El monto con signo de `change_income`: positivo sube el ingreso, negativo lo baja; no puede ser cero. */
export function parseSignedAmount(text: string): string | null {
  const raw = text.trim();
  const negative = raw.startsWith("-");
  const value = parsePositiveAmount(negative ? raw.slice(1) : raw);
  return value === null ? null : negative ? `-${value}` : value;
}

/**
 * Un ajuste listo para enviar, o los campos que no valen. Cada tipo usa SOLO sus campos (el servidor rechaza cualquier otro con
 * `422 invalid_adjustment`): aquí tampoco se mandan.
 */
export function buildAdjustment(draft: AdjustmentDraft): { adjustment: ScenarioAdjustment | null; invalid: AdjustmentField[] } {
  const invalid: AdjustmentField[] = [];
  const date = (field: AdjustmentField, value: string) => {
    if (!isBusinessDate(value)) invalid.push(field);
    return value;
  };
  switch (draft.kind) {
    case "cancel_recurrence": {
      if (draft.recurrence_id === "") invalid.push("recurrence_id");
      const start = date("start", draft.start);
      return invalid.length > 0 ? { adjustment: null, invalid } : { adjustment: { kind: "cancel_recurrence", recurrence_id: draft.recurrence_id, start }, invalid };
    }
    case "change_income": {
      const delta = parseSignedAmount(draft.monthly_delta);
      if (delta === null) invalid.push("monthly_delta");
      const start = date("start", draft.start);
      const until = draft.until.trim() === "" ? null : date("until", draft.until);
      if (until !== null && isBusinessDate(until) && isBusinessDate(start) && until < start) invalid.push("until");
      return invalid.length > 0 ? { adjustment: null, invalid } : { adjustment: { kind: "change_income", monthly_delta: delta!, start, ...(until ? { until } : {}) }, invalid };
    }
    case "add_expense": {
      const amount = parsePositiveAmount(draft.amount);
      if (amount === null) invalid.push("amount");
      const start = date("start", draft.start);
      const months = draft.months.trim() === "" ? null : toInt(draft.months, 1, MAX_EXPENSE_MONTHS);
      if (draft.months.trim() !== "" && months === null) invalid.push("months");
      return invalid.length > 0 ? { adjustment: null, invalid } : { adjustment: { kind: "add_expense", amount: amount!, start, ...(months !== null && months > 1 ? { months } : {}) }, invalid };
    }
    case "add_loan": {
      const principal = parsePositiveAmount(draft.principal);
      if (principal === null) invalid.push("principal");
      const rate = percentToFraction(draft.rate);
      if (rate === null) invalid.push("rate");
      const term = toInt(draft.term, 1, 600);
      if (term === null) invalid.push("term");
      const first = date("first_payment", draft.first_payment);
      const insurance = draft.insurance.trim() === "" ? null : normalizeAmountInput(draft.insurance);
      if (draft.insurance.trim() !== "" && insurance === null) invalid.push("insurance");
      const disbursed = draft.disbursed_on.trim() === "" ? null : date("disbursed_on", draft.disbursed_on);
      if (invalid.length > 0) return { adjustment: null, invalid };
      return {
        adjustment: {
          kind: "add_loan",
          principal: principal!,
          rate: rate!,
          convention: draft.convention,
          term: term!,
          first_payment: first,
          system: draft.system,
          ...(insurance && !/^0*(\.0*)?$/.test(insurance) ? { insurance } : {}),
          ...(disbursed ? { disbursed_on: disbursed } : {}),
        },
        invalid,
      };
    }
  }
}

/** Un ajuste guardado → el formulario para editarlo. */
export function adjustmentToDraft(a: ScenarioAdjustment, today: string): AdjustmentDraft {
  const draft = emptyDraft(a.kind as AdjustmentKind, a.start ?? today);
  return {
    ...draft,
    recurrence_id: a.recurrence_id ?? "",
    until: a.until ?? "",
    monthly_delta: a.monthly_delta ?? "",
    amount: a.amount ?? "",
    months: a.months !== undefined ? String(a.months) : "",
    principal: a.principal ?? "",
    rate: a.rate ?? "",
    convention: a.convention ?? "EA",
    term: a.term !== undefined ? String(a.term) : "",
    first_payment: a.first_payment ?? "",
    system: a.system ?? "french",
    insurance: a.insurance ?? "",
    disbursed_on: a.disbursed_on ?? "",
  };
}

/** Qué escenarios hay marcados para comparar: como mucho 3 (el servidor rechaza más: `invalid_columns`); el cuarto no entra. */
export function toggleCompared(selected: readonly string[], id: string, on: boolean): string[] {
  if (!on) return selected.filter((s) => s !== id);
  if (selected.includes(id) || selected.length >= MAX_COMPARED) return [...selected];
  return [...selected, id];
}

/** Signo de una diferencia frente a «Hoy» (para escribir «más»/«menos»; no es dinero). */
export function sign(value: string): -1 | 0 | 1 {
  if (/^-?0*(\.0*)?$/.test(value)) return 0;
  return value.startsWith("-") ? -1 : 1;
}

/** Los meses de todas las columnas en una sola lista de filas (para la gráfica y la tabla): la 1.ª columna es «Hoy». */
export function monthlyRows(columns: readonly CompareColumn[]): { month: string; state: string; closings: string[] }[] {
  const today = columns[0];
  if (!today) return [];
  return today.monthly.map((point, index) => ({ month: point.month, state: point.state, closings: columns.map((c) => c.monthly[index]?.closing ?? "0") }));
}

export interface IndependenceDraft {
  spending: string;
  saving: string;
  returnPct: string;
  withdrawalPct: string;
  startingCapital: string;
  includeObligations: boolean;
}

export const DEFAULT_WITHDRAWAL_PCT = "4";

/**
 * El cuerpo de `POST independence`: gasto y ahorro mensual en pesos (el ahorro puede ser cero), rentabilidad REAL anual y tasa de
 * retiro en porcentaje → fracción. El capital inicial es opcional (sin él, el servidor parte de tus activos líquidos, de ahorro e
 * inversiones del libro). Todo en el cuerpo: nada de montos en la URL.
 */
export function buildIndependence(draft: IndependenceDraft): { body: IndependenceRequest | null; invalid: ("spending" | "saving" | "return" | "withdrawal" | "capital")[] } {
  const invalid: ("spending" | "saving" | "return" | "withdrawal" | "capital")[] = [];
  const spending = parsePositiveAmount(draft.spending);
  if (spending === null) invalid.push("spending");
  const saving = draft.saving.trim() === "" ? "0" : normalizeAmountInput(draft.saving);
  if (saving === null) invalid.push("saving");
  const realReturn = percentToFraction(draft.returnPct);
  if (realReturn === null) invalid.push("return");
  const withdrawal = draft.withdrawalPct.trim() === "" ? percentToFraction(DEFAULT_WITHDRAWAL_PCT) : percentToFraction(draft.withdrawalPct);
  if (withdrawal === null || /^0(\.0*)?$/.test(withdrawal)) invalid.push("withdrawal");
  const capital = draft.startingCapital.trim() === "" ? null : normalizeAmountInput(draft.startingCapital);
  if (draft.startingCapital.trim() !== "" && capital === null) invalid.push("capital");
  if (invalid.length > 0) return { body: null, invalid };
  return {
    body: {
      monthly_spending: spending!,
      monthly_saving: saving!,
      real_return: realReturn!,
      withdrawal_rate: withdrawal!,
      include_obligations: draft.includeObligations,
      ...(capital !== null ? { starting_capital: capital } : {}),
    },
    invalid,
  };
}

/** «3 años y 4 meses» a partir de los meses que faltan (`months` del servidor); solo enteros, no es dinero. */
export function yearsMonths(months: number): { years: number; months: number } {
  return { years: Math.floor(months / 12), months: months % 12 };
}

/**
 * Pausas y ventanas de pago de una recurrencia (FMS-1b, A.3), puras: validan lo que escribió la persona y arman los campos de la
 * API. Los porcentajes del descuento y del recargo van en PUNTOS (`10` = 10 %); los montos como cadenas (nunca `Number`).
 */
import { parsePercentPoints, parsePositiveAmount } from "@/lib/amount-input";
import { isBusinessDate } from "@/lib/dates";
import { toInt } from "@/lib/ints";
import type { Recurrence } from "@/api/models";

export type EarlyKind = "percent" | "fixed";
export type LateKind = "none" | "fixed" | "percent" | "daily";

/** La clave del parámetro con vigencia de la tasa de mora (catálogo del backend). */
export const LATE_RATE_KEY = "LATE_INTEREST_EA";

export interface TermsState {
  earlyDays: string;
  earlyKind: EarlyKind;
  earlyValue: string;
  lateKind: LateKind;
  lateValue: string;
}

export const EMPTY_TERMS: TermsState = { earlyDays: "", earlyKind: "percent", earlyValue: "", lateKind: "none", lateValue: "" };

export interface TermsFields {
  early_days_before?: number | null;
  early_kind?: EarlyKind | "";
  early_value?: string | null;
  late_kind?: LateKind;
  late_value?: string | null;
  late_rate_key?: string;
}

export type TermsProblems = Partial<Record<"earlyDays" | "earlyValue" | "lateValue", "invalid">>;

/**
 * `clear: true` (al EDITAR) manda los vacíos como `null` / `""` para borrar lo que había; al crear se omiten.
 */
export function termsFields(state: TermsState, clear = false): { fields: TermsFields; problems: TermsProblems } {
  const fields: TermsFields = {};
  const problems: TermsProblems = {};
  const hasEarly = state.earlyDays.trim() !== "" || state.earlyValue.trim() !== "";
  if (hasEarly) {
    const days = toInt(state.earlyDays, 1, 365);
    const value = state.earlyKind === "percent" ? parsePercentPoints(state.earlyValue) : parsePositiveAmount(state.earlyValue);
    if (days === null) problems.earlyDays = "invalid";
    if (value === null) problems.earlyValue = "invalid";
    if (days !== null && value !== null) {
      fields.early_days_before = days;
      fields.early_kind = state.earlyKind;
      fields.early_value = value;
    }
  } else if (clear) {
    fields.early_days_before = null;
    fields.early_kind = "";
    fields.early_value = null;
  }
  if (state.lateKind === "none") {
    if (clear) {
      fields.late_kind = "none";
      fields.late_value = null;
    }
  } else if (state.lateKind === "daily") {
    fields.late_kind = "daily";
    fields.late_rate_key = LATE_RATE_KEY;
    if (clear) fields.late_value = null;
  } else {
    const value = state.lateKind === "percent" ? parsePercentPoints(state.lateValue) : parsePositiveAmount(state.lateValue);
    if (value === null) problems.lateValue = "invalid";
    else {
      fields.late_kind = state.lateKind;
      fields.late_value = value;
    }
  }
  return { fields, problems };
}

/** El estado del formulario a partir de una recurrencia guardada (para editarla). */
export function termsFromRecurrence(r: Pick<Recurrence, "early_days_before" | "early_kind" | "early_value" | "late_kind" | "late_value">): TermsState {
  return {
    earlyDays: r.early_days_before ? String(r.early_days_before) : "",
    earlyKind: r.early_kind === "fixed" ? "fixed" : "percent",
    earlyValue: r.early_value ?? "",
    lateKind: r.late_kind ?? "none",
    lateValue: r.late_value ?? "",
  };
}

export interface DateRange {
  start: string;
  end: string;
}

export interface PausesState {
  /** Meses del año (1..12) sin ocurrencias cada año. */
  months: number[];
  ranges: DateRange[];
}

export const EMPTY_PAUSES: PausesState = { months: [], ranges: [] };

/** `null` si algún rango está incompleto o al revés (el motivo lo pinta la pantalla fila por fila con `rangeProblem`). */
export function rangeProblem(range: DateRange): "incomplete" | "reversed" | null {
  if (!isBusinessDate(range.start) || !isBusinessDate(range.end)) return "incomplete";
  return range.end < range.start ? "reversed" : null;
}

export function pauseFields(state: PausesState): { fields: { skip_months: number[]; skip_ranges: DateRange[] }; valid: boolean } {
  const months = [...new Set(state.months)].sort((a, b) => a - b);
  return { fields: { skip_months: months, skip_ranges: state.ranges }, valid: state.ranges.every((r) => rangeProblem(r) === null) };
}

export function pausesFromRecurrence(r: Pick<Recurrence, "skip_months" | "skip_ranges">): PausesState {
  return { months: [...(r.skip_months ?? [])], ranges: (r.skip_ranges ?? []).map((x) => ({ start: x.start, end: x.end })) };
}

/** Marca o desmarca un mes de una lista ordenada. */
export function toggleMonth(months: readonly number[], month: number): number[] {
  return months.includes(month) ? months.filter((m) => m !== month) : [...months, month].sort((a, b) => a - b);
}

/** Dividir una obligación abierta en cuotas (`POST occurrences/{id}/split`): las fechas las arma la persona; el servidor reparte los montos. */
import { addMonths, isBusinessDate } from "@/lib/dates";
import { toInt } from "@/lib/ints";
import { splitEqual } from "@/lib/money";

export interface SplitInput {
  count: string;
  first: string;
  /** Cada cuántos meses cae una cuota. */
  every: string;
}

export interface SplitPlan {
  dates: string[];
  /** Vista previa de las partes iguales (la última con la diferencia). */
  amounts: string[];
}

export const MAX_INSTALLMENTS = 24;

export function splitPlan(input: SplitInput, pending: string): SplitPlan | null {
  const count = toInt(input.count, 2, MAX_INSTALLMENTS);
  const every = toInt(input.every, 1, 12);
  if (count === null || every === null || !isBusinessDate(input.first)) return null;
  const dates = Array.from({ length: count }, (_, i) => addMonths(input.first, i * every));
  return { dates, amounts: splitEqual(pending, count) };
}

/** El cuerpo de la petición: solo fechas (partes iguales, la última con la diferencia). */
export function splitBody(plan: SplitPlan): { installments: { due_date: string }[] } {
  return { installments: plan.dates.map((due_date) => ({ due_date })) };
}

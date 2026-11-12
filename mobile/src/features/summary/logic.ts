/** Lógica pura del Resumen (sin React): el modelo viene del contrato generado; las cifras se operan con `core/money`. */
import type { components } from "@core/api/schema.gen";
import { addAmounts, compareAmounts, percentOfTotal } from "@core/money";

type S = components["schemas"];
export type Dashboard = S["Dashboard"];
export type Summary = S["Summary"];
export type RailItem = S["RailItem"];
export type FixedItem = S["FixedItem"];
export type Alert = S["Alert"];
export type Shortcut = S["Shortcut"];

/** Los tres tramos de la barra (gastado, comprometido, libre) como porcentaje entero de lo que suman; las partes negativas no cuentan. */
export function barSegments(bar: Dashboard["bar"]): { spent: number; committed: number; free: number } {
  const positive = [bar.spent, bar.committed, bar.free].filter((value) => compareAmounts(value, "0") > 0);
  const total = positive.length === 0 ? "0" : addAmounts(...positive);
  return { spent: percentOfTotal(bar.spent, total), committed: percentOfTotal(bar.committed, total), free: percentOfTotal(bar.free, total) };
}

export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

/** Primer uso sin datos: ningún gasto fijo, ningún pago próximo y ni un ingreso ni un gasto en el periodo. */
export function isFirstUse(d: Pick<Dashboard, "fixed_expenses" | "rail" | "kpi">): boolean {
  return d.fixed_expenses.total_count === 0 && d.rail.length === 0 && compareAmounts(d.kpi.income, "0") === 0 && compareAmounts(d.kpi.spent, "0") === 0;
}

/** La liquidez a `days` días, si el servidor la trajo. */
export function horizon(d: Pick<Dashboard, "liquidity">, days: number): string | null {
  return d.liquidity.horizons.find((h) => h.days === days)?.balance ?? null;
}

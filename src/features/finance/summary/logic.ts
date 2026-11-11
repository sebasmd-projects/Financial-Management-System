/** Lógica pura del Resumen (sin React): a dónde lleva cada elemento y cómo se pintan las barras. */
import type { Alert, Dashboard, RailItem } from "@/api/models";
import type { RouteId } from "@/nav/routes";
import { addAmounts, compareAmounts, percentOfTotal } from "@/lib/money";

export interface Target {
  route: RouteId;
  params: string[];
}

/** Tarjeta → su pantalla; cuota de préstamo → la lista de créditos (el aviso trae el id de la cuota, no el del préstamo). */
export function railTarget(item: Pick<RailItem, "ref_kind" | "ref_id">): Target {
  if (item.ref_kind === "card") return { route: "tarjeta", params: [item.ref_id] };
  return { route: "creditos", params: [] };
}

export function alertTarget(alert: Pick<Alert, "kind" | "ref_kind" | "ref_id">): Target {
  if (alert.ref_kind === "occurrence" && alert.ref_id) return { route: "pagos-fijo-pagar", params: [alert.ref_id] };
  if (alert.ref_kind === "card" && alert.ref_id) return { route: "tarjeta", params: [alert.ref_id] };
  if (alert.ref_kind === "loan_installment") return { route: "creditos", params: [] };
  return { route: "pagos-calendario", params: [] };
}

/**
 * Los tres tramos de la barra (gastado, comprometido, libre) como porcentaje entero de lo que suman. Las partes negativas no
 * cuentan; lo que sobra por el redondeo hacia abajo queda como el fondo de la barra.
 */
export function barSegments(bar: Dashboard["bar"]): { spent: number; committed: number; free: number } {
  const positive = [bar.spent, bar.committed, bar.free].filter((v) => compareAmounts(v, "0") > 0);
  const total = positive.length === 0 ? "0" : addAmounts(...positive);
  return { spent: percentOfTotal(bar.spent, total), committed: percentOfTotal(bar.committed, total), free: percentOfTotal(bar.free, total) };
}

/** Orden de las alertas: la API ya las trae por prioridad (vencidos, hoy, saldo, confirmaciones); aquí solo se acota el índice. */
export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

/** Primer uso sin datos: ningún gasto fijo, ningún pago próximo y ni un ingreso ni un gasto en el periodo. */
export function isFirstUse(d: Pick<Dashboard, "fixed_expenses" | "rail" | "kpi">): boolean {
  return d.fixed_expenses.total_count === 0 && d.rail.length === 0 && compareAmounts(d.kpi.income, "0") === 0 && compareAmounts(d.kpi.spent, "0") === 0;
}

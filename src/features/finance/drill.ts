/**
 * «Ver movimientos»: el filtro exacto con el que se lista lo que suma una cifra (presupuesto, meta, fila de un informe) pasa a
 * la pantalla de Movimientos EN MEMORIA (nunca en la URL: regla del propietario, los montos no viajan en la URL ni en los
 * registros). Movimientos lo envía en el cuerpo de `POST movements/search`. Lo que no está en la lista se descarta.
 */
import type { RouteId } from "@/nav/routes";
import { isBusinessDate } from "@/lib/dates";

export const DRILL_KEYS = ["from", "to", "account", "category", "tag", "cost_center", "counterparty", "ledger_account", "classification", "nature", "status", "min_amount", "max_amount"] as const;
export type DrillKey = (typeof DRILL_KEYS)[number];
export type Drill = Partial<Record<DrillKey, string>>;

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const WORD = /^[a-z_]{1,30}$/;
const STATUSES = new Set(["pendiente", "confirmado", "conciliado", "anulado"]);

function valid(key: DrillKey, value: string): boolean {
  if (key === "from" || key === "to") return isBusinessDate(value);
  if (key === "classification" || key === "nature") return WORD.test(value);
  if (key === "status") return STATUSES.has(value);
  if (key === "min_amount" || key === "max_amount") return /^\d{1,13}(\.\d{1,2})?$/.test(value);
  return ID.test(value);
}

/** Lo que la pantalla de Movimientos entiende de un filtro de la API (el resto, y los valores raros, se descartan). */
export function sanitizeDrill(filter: Record<string, unknown> | null | undefined): Drill {
  const out: Drill = {};
  if (!filter) return out;
  for (const key of DRILL_KEYS) {
    const value = filter[key];
    if (typeof value === "string" && value !== "" && valid(key, value)) out[key] = value;
  }
  return out;
}

export function drillRoute(filter: Record<string, unknown> | null | undefined): RouteId {
  const type = filter?.type;
  return type === "expense" ? "movimientos-egresos" : type === "income" ? "movimientos-ingresos" : type === "transfer" ? "movimientos-transferencias" : "movimientos";
}

let pending: Drill | null = null;

/** Deja el filtro listo para la pantalla de Movimientos (en memoria del módulo; se pierde al recargar). */
export function stageDrill(filter: Record<string, unknown> | null | undefined): void {
  pending = sanitizeDrill(filter);
}
export function peekDrill(): Drill {
  return pending ?? {};
}
export function clearDrill(): void {
  pending = null;
}

/**
 * «Ver movimientos»: el filtro exacto con el que `GET movements` lista lo que suma una cifra (presupuesto, meta, fila de un
 * informe) viaja a la pantalla de Movimientos en la cadena de consulta. SOLO claves que no son montos (ids, fechas y
 * clasificaciones): el filtro nunca lleva un monto (regla del propietario), y lo que no está en la lista se descarta. Por eso el
 * `max_amount` de un gasto hormiga NO viaja: la lista incluye también gastos mayores al umbral y la pantalla lo avisa.
 */
import type { RouteId } from "@/nav/routes";
import { isBusinessDate } from "@/lib/dates";

export const DRILL_KEYS = ["from", "to", "account", "category", "tag", "cost_center", "counterparty", "ledger_account", "classification", "nature", "status"] as const;
export type DrillKey = (typeof DRILL_KEYS)[number];
export type Drill = Partial<Record<DrillKey, string>>;

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const WORD = /^[a-z_]{1,30}$/;
const STATUSES = new Set(["pendiente", "confirmado", "conciliado", "anulado"]);

function valid(key: DrillKey, value: string): boolean {
  if (key === "from" || key === "to") return isBusinessDate(value);
  if (key === "classification" || key === "nature") return WORD.test(value);
  if (key === "status") return STATUSES.has(value);
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

export function readDrill(get: (key: string) => string | null): Drill {
  return sanitizeDrill(Object.fromEntries(DRILL_KEYS.map((key) => [key, get(key)])));
}

/** La pantalla de Movimientos que corresponde al tipo del filtro (`type`: egresos, ingresos, transferencias o todos). */
export function drillRoute(filter: Record<string, unknown> | null | undefined): RouteId {
  const type = filter?.type;
  return type === "expense" ? "movimientos-egresos" : type === "income" ? "movimientos-ingresos" : type === "transfer" ? "movimientos-transferencias" : "movimientos";
}

/** `href` de la pantalla de Movimientos + el filtro como cadena de consulta. Sin filtro válido, la pantalla sola. */
export function drillHref(href: (id: RouteId) => string, filter: Record<string, unknown> | null | undefined): string {
  const clean = sanitizeDrill(filter);
  const search = new URLSearchParams(Object.entries(clean));
  const text = search.toString();
  return `${href(drillRoute(filter))}${text ? `?${text}` : ""}`;
}

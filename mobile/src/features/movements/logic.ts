import type { components } from "@core/api/schema.gen";
import { absAmount, addAmounts, negateAmount } from "@core/money";
import { periodRange } from "@core/dates";

type S = components["schemas"];
export type Movement = S["Movement"];
export type MovementSearch = S["MovementSearch"];

export type TypeFilter = "all" | "income" | "expense" | "transfer";
export type StatusFilter = "all" | "pendiente" | "confirmado" | "conciliado" | "anulado";

/**
 * Los filtros de la lista, solo en memoria. Los montos (`minAmount`, `maxAmount`) son cadenas decimales y viajan en el CUERPO de
 * `POST movements/search`, nunca en la URL.
 */
export interface Filters {
  type: TypeFilter;
  status: StatusFilter;
  /** `AAAA-MM` o `null` (todos los periodos). */
  period: string | null;
  accountId: string | null;
  minAmount: string | null;
  maxAmount: string | null;
}

export const NO_FILTERS: Filters = { type: "all", status: "all", period: null, accountId: null, minAmount: null, maxAmount: null };

export function hasFilters(filters: Filters): boolean {
  return (Object.keys(NO_FILTERS) as (keyof Filters)[]).some((key) => filters[key] !== NO_FILTERS[key]);
}

/** Los filtros → el cuerpo de `POST movements/search` (el contrato `MovementSearch`). */
export function searchBody(filters: Filters, page: number, pageSize = 30): MovementSearch {
  const range = filters.period ? periodRange(filters.period) : null;
  return {
    ...(filters.type !== "all" ? { type: filters.type } : {}),
    ...(filters.status !== "all" ? { status: filters.status } : {}),
    ...(filters.accountId ? { account: filters.accountId } : {}),
    ...(range ? { from: range.from, to: range.to } : {}),
    ...(filters.minAmount ? { min_amount: filters.minAmount } : {}),
    ...(filters.maxAmount ? { max_amount: filters.maxAmount } : {}),
    ...(filters.status === "anulado" ? { show_annulled: true } : {}),
    page,
    page_size: pageSize,
  };
}

/** El monto con su signo para una lista: egreso negativo, ingreso positivo, transferencia sin signo. */
export function signedAmount(movement: Pick<Movement, "type" | "amount">): { value: string; sign: "auto" | "always" } {
  const magnitude = absAmount(movement.amount);
  if (movement.type === "expense") return { value: negateAmount(magnitude), sign: "auto" };
  if (movement.type === "income") return { value: magnitude, sign: "always" };
  return { value: magnitude, sign: "auto" };
}

/** Lo que el movimiento aporta al neto del día: ingresos suman, egresos restan; transferencias, pendientes y anulados no cuentan. */
export function netContribution(movement: Pick<Movement, "type" | "amount" | "status" | "voided">): string {
  if (movement.voided || movement.status === "pendiente" || movement.status === "anulado" || movement.type === "transfer") return "0.00";
  const magnitude = absAmount(movement.amount);
  return movement.type === "expense" ? negateAmount(magnitude) : magnitude;
}

export interface DayGroup {
  date: string;
  net: string;
  items: Movement[];
}

/** Agrupa por día (la lista llega ordenada del más nuevo al más viejo) con el neto de cada día. */
export function groupByDay(items: readonly Movement[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const movement of items) {
    let group = groups[groups.length - 1];
    if (!group || group.date !== movement.date) {
      group = { date: movement.date, net: "0.00", items: [] };
      groups.push(group);
    }
    group.items.push(movement);
    group.net = addAmounts(group.net, netContribution(movement));
  }
  return groups;
}

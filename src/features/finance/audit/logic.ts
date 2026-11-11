import type { AuditEntry } from "@/api/models";

export interface AuditFilters {
  object: string;
  action: string;
  by: "" | "me" | "admin";
  field: string;
  from: string;
  to: string;
}

export const EMPTY_FILTERS: AuditFilters = { object: "", action: "", by: "", field: "", from: "", to: "" };

export const AUDIT_ACTIONS = ["add", "change", "delete", "confirm", "discard", "annul", "reconcile", "reopen", "adjust", "alert"] as const;

/** Los tipos de objeto que se ofrecen como filtro (`app.modelo`, como los guarda el servidor). */
export const AUDIT_OBJECTS = [
  "finance_moves.movement",
  "finance_moves.category",
  "finance_moves.customattribute",
  "finance_ledger.ledgeraccount",
  "finance_ledger.exchangerate",
  "finance_ledger.userparameter",
  "finance_credit.creditcard",
  "finance_credit.loan",
  "finance_credit.personaldebt",
  "finance_recurring.recurrence",
  "finance_assets.asset",
  "finance_assets.assetvaluation",
  "finance_assets.vehiclecost",
  "finance_assets.maintenanceitem",
  "finance_import.importbatch",
] as const;

/** Los filtros como parámetros de la consulta: sin los vacíos. Son identificadores, fechas y nombres de campo: nunca montos. */
export function filterParams(filters: AuditFilters, fixed: { object?: string; object_id?: string } = {}, page = 1): Record<string, string | number | undefined> {
  return {
    object: fixed.object ?? (filters.object || undefined),
    object_id: fixed.object_id,
    action: filters.action || undefined,
    by: filters.by || undefined,
    field: filters.field.trim() || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    page: page > 1 ? page : undefined,
  };
}

export function filtersActive(filters: AuditFilters): boolean {
  return Object.values(filters).some((v) => v !== "");
}

export function datesProblem(filters: Pick<AuditFilters, "from" | "to">): boolean {
  return filters.from !== "" && filters.to !== "" && filters.from > filters.to;
}

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Los cambios de una entrada, campo por campo. El servidor entrega `changes` (`{field, before, after}`); si faltara, se
 * reconstruyen desde `before`/`after` y `changed_fields`. Un campo que no existía antes o después trae `null`.
 */
export function entryChanges(entry: Pick<AuditEntry, "changes" | "changed_fields" | "before" | "after">): FieldChange[] {
  const fromServer = entry.changes
    .filter((c) => typeof c.field === "string")
    .map((c) => ({ field: String(c.field), before: c.before ?? null, after: c.after ?? null }));
  if (fromServer.length > 0) return fromServer;
  const before = isRecord(entry.before) ? entry.before : {};
  const after = isRecord(entry.after) ? entry.after : {};
  const names = entry.changed_fields.length > 0 ? entry.changed_fields : [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return names.map((field) => ({ field, before: before[field] ?? null, after: after[field] ?? null }));
}

/** Un valor del antes o el después como texto. Todo llega ya descifrado y como cadena; lo demás se escribe sin inventar. */
export function valueText(value: unknown, none: string): string {
  if (value === null || value === undefined || value === "") return none;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length === 0 ? none : value.map((v) => valueText(v, none)).join(", ");
  return JSON.stringify(value);
}

/**
 * El ÁMBITO de lo que se ve, igual que en la web: Personal, un Hogar o Ambos (consolidado). Lógica pura: qué ruta de la API toca
 * en cada ámbito. Sin montos; vive en memoria (`store.ts`).
 */
import type { components } from "@core/api/schema.gen";

export type Household = components["schemas"]["HouseholdSummary"];
export type Scope = { kind: "personal" } | { kind: "household"; id: string } | { kind: "both"; id: string };

export const PERSONAL: Scope = { kind: "personal" };

export function sameScope(a: Scope, b: Scope): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "personal" || (b.kind !== "personal" && a.id === b.id);
}

/**
 * Las raíces de la API que el hogar sabe servir bajo `households/{id}/…` (las mismas que la web). Lo que no está aquí sigue
 * siendo solo personal.
 */
const HOUSEHOLD_ROOTS: ReadonlySet<string> = new Set(["accounts", "payment-methods", "entries", "movements", "transfers", "categories", "tags", "counterparties", "cost-centers", "reports", "liquidity", "dashboard", "summary", "deletions"]);

/** Una clave estable del ámbito (para comparar y para claves de consulta). */
export function scopeKey(scope: Scope): string {
  return scope.kind === "personal" ? "personal" : `${scope.kind}:${scope.id}`;
}

/** La ruta de la API en el ámbito activo. En «Ambos» las listas siguen siendo personales (el consolidado es del Resumen). */
export function scopedPath(path: string, scope: Scope): string {
  if (scope.kind !== "household") return path;
  const root = /^\/([^/?]+)/.exec(path)?.[1];
  if (!root || !HOUSEHOLD_ROOTS.has(root)) return path;
  return `/households/${encodeURIComponent(scope.id)}${path}`;
}

/** Quien puede crear datos del hogar (el servidor responde `403 household_read_only` al visor). */
export function canWrite(scope: Scope, households: readonly Household[]): boolean {
  if (scope.kind !== "household") return true;
  const role = households.find((household) => household.id === scope.id)?.role;
  return role === "owner" || role === "admin" || role === "editor";
}

export function scopeLabel(scope: Scope, households: readonly Household[], labels: { personal: string; both: string }): string {
  if (scope.kind === "personal") return labels.personal;
  const name = households.find((household) => household.id === scope.id)?.name ?? "";
  return scope.kind === "both" ? `${labels.both} · ${name}` : name;
}

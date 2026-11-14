/**
 * El ÁMBITO de lo que se ve: Personal, un Hogar o Ambos (consolidado). Lógica pura (sin React): qué ruta de la API toca en cada
 * ámbito, qué pantallas existen todavía solo para lo personal y cómo se reparten las cifras. Sin montos, nunca en la URL.
 */
import type { RouteId } from "@/nav/routes";

export type Scope = { kind: "personal" } | { kind: "household"; id: string } | { kind: "both"; id: string };

export const PERSONAL: Scope = { kind: "personal" };

export function sameScope(a: Scope, b: Scope): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "personal" || (b.kind !== "personal" && a.id === b.id);
}

/** Una clave estable del ámbito (para `key` de React y comparaciones). */
export function scopeKey(scope: Scope): string {
  return scope.kind === "personal" ? "personal" : `${scope.kind}:${scope.id}`;
}

/**
 * Las raíces de la API que el hogar sabe servir bajo `households/{id}/…` (`HOUSEHOLD_DATA` del backend). Lo que no está aquí
 * (créditos, recurrencias, presupuestos, metas, importaciones, activos, reglas…) sigue siendo solo personal.
 */
const HOUSEHOLD_ROOTS: ReadonlySet<string> = new Set([
  "accounts",
  "payment-methods",
  "entries",
  "movements",
  "transfers",
  "categories",
  "tags",
  "counterparties",
  "cost-centers",
  "reports",
  "liquidity",
  "dashboard",
  "summary",
  "deletions",
]);

/** `POST accounts/{id}/share` es personal aunque empiece por `accounts`: el hogar destino va en el cuerpo. */
const ALWAYS_PERSONAL = /^\/accounts\/[^/?]+\/share(?:[/?]|$)/;

/** La ruta de la API en el ámbito activo. En «Ambos» las listas siguen siendo personales (el consolidado es de Resumen e Informes). */
export function scopedPath(path: string, scope: Scope): string {
  if (scope.kind !== "household") return path;
  const root = /^\/([^/?]+)/.exec(path)?.[1];
  if (!root || !HOUSEHOLD_ROOTS.has(root) || ALWAYS_PERSONAL.test(path)) return path;
  return `/households/${encodeURIComponent(scope.id)}${path}`;
}

/** Los campos que `POST reports/{clave}/query|export` espera para el consolidado; en los demás ámbitos, nada. */
export function reportScopeFields(scope: Scope): { scope?: "both"; household_id?: string } {
  return scope.kind === "both" ? { scope: "both", household_id: scope.id } : {};
}

/**
 * Las pantallas que ya saben trabajar con un hogar (las rutas de datos del backend). El resto, en el ámbito del Hogar, dice que es
 * solo personal: ningún botón muerto.
 */
const HOUSEHOLD_ROUTES: ReadonlySet<RouteId> = new Set<RouteId>([
  "resumen",
  "cuentas",
  "cuentas-bancos",
  "cuentas-efectivo",
  "cuentas-debito",
  "cuenta",
  "movimientos",
  "movimientos-ingresos",
  "movimientos-egresos",
  "movimientos-transferencias",
  "movimientos-historial",
  "movimiento-nuevo",
  "movimiento",
  "movimiento-asientos",
  "informes",
  "informe",
  "informes-estadisticas",
  "config-categorias",
  "config-papelera",
  "config-etiquetas",
  "notificaciones",
  "hogares",
  "hogar",
  "hogar-invitaciones",
]);

export function isPersonalOnlyRoute(routeId: RouteId): boolean {
  return !HOUSEHOLD_ROUTES.has(routeId);
}

/** ¿Esta pantalla se reemplaza por el aviso «solo personal»? Solo en el ámbito del Hogar. */
export function blockedInScope(routeId: RouteId, scope: Scope): boolean {
  return scope.kind === "household" && isPersonalOnlyRoute(routeId);
}

export type Role = "owner" | "admin" | "editor" | "viewer";

/** Quien puede crear y editar datos del hogar (el servidor responde `403 household_read_only` al visor). */
export function canWriteRole(role: Role | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}

/** Quien gestiona miembros e invitaciones. */
export function canManageRole(role: Role | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Los roles a los que `actor` puede cambiar a `target` (el administrador solo toca editores y visores; el propietario no cambia aquí). */
export function assignableRoles(actor: Role, target: Role): Role[] {
  if (target === "owner") return [];
  if (actor === "owner") return ["admin", "editor", "viewer"];
  if (actor === "admin" && (target === "editor" || target === "viewer")) return ["editor", "viewer"];
  return [];
}

/** Los roles que `actor` puede dar al invitar. */
export function invitableRoles(actor: Role): Role[] {
  return actor === "owner" ? ["admin", "editor", "viewer"] : actor === "admin" ? ["editor", "viewer"] : [];
}

/** ¿Puede `actor` expulsar a `target`? (no a sí mismo —eso es «Salir»—, no al propietario; el administrador solo a editores y visores). */
export function canRemove(actor: Role, target: Role, you: boolean): boolean {
  if (you || target === "owner") return false;
  return actor === "owner" || (actor === "admin" && (target === "editor" || target === "viewer"));
}

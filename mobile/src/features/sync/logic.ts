/**
 * Lógica de los bancos por correo en la app (sin React Native): el cliente con el ámbito aplicado, los textos de error y las frases de la
 * condición de una regla. La regla de qué se propone, se aprueba o se confirma sola es del servidor; aquí solo se presenta. Sin montos en rutas.
 */
import type { ApiResult } from "@core/api/client";
import { describeCondition, type ConditionTexts, type SyncClient } from "@core/sync";
import { scopedPath, type Scope } from "@/features/scope/scope";
import { es } from "@/i18n/es";

type Raw = Pick<SyncClient, "get" | "post" | "put" | "patch" | "delete">;

/** El cliente del FMS con el ámbito activo aplicado: en un Hogar, `sync/connections` y `sync/events` cuelgan de `households/{id}/…`. */
export function scopedSyncClient(raw: Raw, scope: Scope): SyncClient {
  return {
    get: (path, options) => raw.get(scopedPath(path, scope), options),
    post: (path, body, options) => raw.post(scopedPath(path, scope), body, options),
    put: (path, body, options) => raw.put(scopedPath(path, scope), body, options),
    patch: (path, body, options) => raw.patch(scopedPath(path, scope), body, options),
    delete: (path, options) => raw.delete(scopedPath(path, scope), options),
  };
}

export const fill = (template: string, vars: Record<string, string>): string => template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? vars[name] : whole));

/** El texto de un fallo: sin red, uno propio por `code` (sin valores) o el genérico. */
export function failureText(result: Extract<ApiResult<unknown>, { ok: false }>): string {
  if (result.status === 0) return es.common.network;
  return es.sync.errors[result.code] ?? es.common.generic;
}

const c = es.sync.rules.conditions;
export const CONDITION_TEXTS: ConditionTexts = {
  institution: c.institution,
  kind: c.kind,
  kinds: es.sync.kinds,
  text: c.text,
  amountMin: c.amountMin,
  amountMax: c.amountMax,
  dayMin: c.dayMin,
  dayMax: c.dayMax,
};

export const describeConditions = (conditions: readonly { field: string; op: string; value: string }[], institutionName?: (code: string) => string | undefined): string[] => conditions.map((condition) => describeCondition(condition, CONDITION_TEXTS, institutionName));

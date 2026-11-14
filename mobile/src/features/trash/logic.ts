/**
 * Lógica pura de «Eliminar» y la Papelera en la app (sin React Native): las frases de lo que se verá afectado, los días que quedan y el cliente
 * con el ámbito aplicado. La regla de qué cae es del servidor (`GET deletions/preview`); aquí solo se presenta. Sin montos.
 */
import type { ApiResult, RequestOptions } from "@core/api/client";
import { formatDate } from "@core/dates";
import { affectedRows, daysLeft, type Deletion, type DeletionPreview, type TrashClient } from "@core/trash";
import { scopedPath, type Scope } from "@/features/scope/scope";

export interface PluralText {
  one: string;
  other: string;
}

const fill = (template: string, vars: Record<string, string>): string => template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? vars[name] : whole));

/** «3 movimientos» / «1 movimiento». Una clave desconocida se muestra tal cual, sin romper. */
export function affectedLabel(key: string, count: number, texts: Record<string, PluralText>): string {
  const entry = Object.hasOwn(texts, key) ? texts[key] : undefined;
  if (!entry) return `${count} ${key}`;
  return fill(count === 1 ? entry.one : entry.other, { n: String(count) });
}

export function affectedLines(preview: Pick<DeletionPreview, "affected">, texts: Record<string, PluralText>): string[] {
  return affectedRows(preview).map((row) => affectedLabel(row.key, row.count, texts));
}

export function daysLeftText(deletion: Pick<Deletion, "days_left">, texts: { daysLeftOne: string; daysLeftOther: string; daysLeftToday: string }): string {
  const n = daysLeft(deletion);
  if (n === 0) return texts.daysLeftToday;
  return n === 1 ? texts.daysLeftOne : fill(texts.daysLeftOther, { n: String(n) });
}

export function deletedByText(deletion: Pick<Deletion, "deleted_at" | "deleted_by">, texts: { deletedBy: string; deletedOn: string }): string {
  const date = formatDate(deletion.deleted_at);
  const name = deletion.deleted_by?.name;
  return name ? fill(texts.deletedBy, { name, date }) : fill(texts.deletedOn, { date });
}

interface Raw {
  get<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>>;
}

/** El cliente del FMS con el ámbito activo aplicado: en un Hogar, `deletions` cuelga de `households/{id}/…`. */
export function scopedClient(raw: Raw, scope: Scope): TrashClient {
  return {
    get: (path, options) => raw.get(scopedPath(path, scope), options),
    post: (path, body, options) => raw.post(scopedPath(path, scope), body, options),
  };
}

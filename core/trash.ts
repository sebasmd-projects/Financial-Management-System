/**
 * Eliminar con papelera (decisión del propietario, 2026-11-14), sin nada de plataforma: lo comparten la web y la app.
 *
 * Eliminar es un **borrado lógico**: lo elegido y todo lo que depende de ello caen juntos, se pueden restaurar 30 días desde la Papelera y
 * después se borran de verdad. Antes de confirmar, el servidor dice qué se verá afectado (`GET deletions/preview`): productos relacionados,
 * cuántos movimientos, conciliaciones que quedarían descuadradas y si se puede exportar antes. Aquí está la lógica pura de ese diálogo y el
 * cliente de esas rutas. Nunca hay un monto en la URL, ni en el estado, ni en un registro.
 */
import type { ApiResult, RequestOptions } from "./api/client";
import type { components } from "./api/schema.gen";

type S = components["schemas"];

export type DeletionKind = S["DeletionRequestKindEnum"];
export type DeletionPreview = S["DeletionPreview"];
export type Deletion = S["Deletion"];
export type ExportFormat = "csv" | "json";

const id = (value: string) => encodeURIComponent(value);

export const trashPaths = {
  /** `GET`: qué se verá afectado. `kind` e `id` no son montos. */
  preview: (kind: DeletionKind, objectId: string) => `/deletions/preview?kind=${id(kind)}&id=${id(objectId)}`,
  /** `GET` la papelera; `POST` eliminar. */
  list: "/deletions",
  restore: (deletionId: string) => `/deletions/${id(deletionId)}/restore`,
  export: "/deletions/export",
  /** Reabrir la conciliación que quedaría descuadrada (solo en el espacio personal). */
  reopenReconciliation: (reconciliationId: string) => `/reconciliations/${id(reconciliationId)}/reopen`,
} as const;

/** Lo mínimo que se pide al cliente de la API: el de la web y el de la app lo cumplen. */
export interface TrashClient {
  get<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>>;
}

/** Los tipos de cosas que caen con la raíz, en el orden en que se le muestran a la persona. Los que no están aquí van al final. */
export const AFFECTED_ORDER = [
  "movements",
  "accounts",
  "cards",
  "loans",
  "debts",
  "payment_methods",
  "recurrences",
  "budgets",
  "goals",
  "reconciliations",
  "categories",
  "assets",
  "attachments",
  "custom_attributes",
  "scenarios",
  "movements_uncategorized",
  "movements_without_payment_method",
  "recurrences_uncategorized",
  "recurrences_without_payment_method",
] as const;

export interface AffectedRow {
  key: string;
  count: number;
}

/** Lo que cae (o queda sin enlace) con cantidad mayor que cero, en orden estable. */
export function affectedRows(preview: Pick<DeletionPreview, "affected">): AffectedRow[] {
  const rows = Object.entries(preview.affected)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => ({ key, count }));
  const rank = (key: string) => {
    const i = (AFFECTED_ORDER as readonly string[]).indexOf(key);
    return i === -1 ? AFFECTED_ORDER.length : i;
  };
  return rows.sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
}

/** `true` si no cae nada más que lo elegido (la confirmación es corta). */
export function isSimple(preview: Pick<DeletionPreview, "affected" | "reconciled" | "export">): boolean {
  return affectedRows(preview).length === 0 && preview.reconciled.entries === 0 && !preview.export.available;
}

/** Hay asientos conciliados: se avisa y se ofrece reabrir la conciliación antes (opcional). */
export function hasReconciled(preview: Pick<DeletionPreview, "reconciled">): boolean {
  return preview.reconciled.entries > 0;
}

/** El formato que se ofrece primero para exportar (el CSV que el importador vuelve a leer, en cuentas de activo; el resto, JSON). */
export function exportChoices(preview: Pick<DeletionPreview, "export">): { available: boolean; formats: ExportFormat[]; preferred: ExportFormat | null } {
  const e = preview.export;
  const formats = e.formats.filter((f): f is ExportFormat => f === "csv" || f === "json");
  const preferred = e.preferred === "csv" || e.preferred === "json" ? e.preferred : null;
  return { available: e.available && formats.length > 0, formats, preferred };
}

export function exportFileName(kind: DeletionKind, format: ExportFormat, date: string): string {
  return `${kind}-movimientos-${date}.${format}`;
}

/** El cuerpo de la confirmación: el `digest` hace que lo que se confirma sea lo que se vio (si cambió, `409 preview_stale`). */
export function deletionBody(kind: DeletionKind, objectId: string, preview: Pick<DeletionPreview, "digest"> | null): { kind: DeletionKind; id: string; digest?: string } {
  return preview ? { kind, id: objectId, digest: preview.digest } : { kind, id: objectId };
}

/** Los códigos por los que conviene volver a pedir la vista previa en lugar de mostrar un error. */
export function shouldRefetchPreview(code: string): boolean {
  return code === "preview_stale";
}

/** La reapertura de una conciliación pide un motivo (queda en la auditoría). */
export function reopenReason(text: string): string | null {
  const reason = text.trim();
  return reason === "" || reason.length > 200 ? null : reason;
}

/** ¿Hay categorías en la papelera? Mientras las haya, no se ofrece «Añadir categorías por defecto» (el servidor las cuenta como existentes y no las
 * vuelve a crear): se restauran desde la Papelera. */
export function hasTrashedCategories(trashed: readonly Pick<Deletion, "kind">[] | null | undefined): boolean {
  return (trashed ?? []).some((d) => d.kind === "category");
}

/** Días que quedan para restaurar, acotados a 0..30 (para el texto «quedan N días»). */
export function daysLeft(deletion: Pick<Deletion, "days_left">): number {
  return Math.min(30, Math.max(0, Math.trunc(deletion.days_left)));
}

/** El cliente de las rutas de borrado lógico y papelera. `key` es la `Idempotency-Key` de la intención de la persona. */
export function trashApi(client: TrashClient) {
  return {
    preview: (kind: DeletionKind, objectId: string, options?: RequestOptions) => client.get<DeletionPreview>(trashPaths.preview(kind, objectId), options),
    remove: (kind: DeletionKind, objectId: string, preview: Pick<DeletionPreview, "digest"> | null, key: string, options?: RequestOptions) =>
      client.post<Deletion>(trashPaths.list, deletionBody(kind, objectId, preview), { ...options, idempotencyKey: key }),
    list: (options?: RequestOptions) => client.get<Deletion[]>(trashPaths.list, options),
    restore: (deletionId: string, options?: RequestOptions) => client.post<Deletion>(trashPaths.restore(deletionId), undefined, options),
    exportFile: (kind: DeletionKind, objectId: string, format: ExportFormat, options?: RequestOptions) =>
      client.post<Blob>(trashPaths.export, { kind, id: objectId, format }, { ...options, asBlob: true }),
    reopenReconciliation: (reconciliationId: string, reason: string, options?: RequestOptions) =>
      client.post<unknown>(trashPaths.reopenReconciliation(reconciliationId), { reason }, options),
  };
}

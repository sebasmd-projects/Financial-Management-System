/**
 * La cédula para abrir los extractos en PDF (propietario, 2026-11-14): `PUT/DELETE sync/settings/document` y `POST …/reveal`. Va aparte de
 * `core/sync.ts` porque solo la web la usa. Nada de la cédula en una URL: guardar y ver son PUT/POST con cuerpo.
 */
import type { ApiResult, RequestOptions } from "../../../../core/api/client";
import type { SyncClient, SyncSettings } from "../../../../core/sync";

export const idNumberPaths = { settings: "/sync/settings", save: "/sync/settings/document", reveal: "/sync/settings/document/reveal" } as const;

/** La cédula: de 4 a 20 letras o cifras (el servidor la cifra con la llave de la persona; nunca va a un registro ni a una URL). */
export function parseIdNumber(text: string): string | null {
  const value = text.replace(/[\s.\-]/g, "");
  return /^[A-Za-z0-9]{4,20}$/.test(value) ? value : null;
}

export function idNumberApi(client: Pick<SyncClient, "put" | "delete" | "post">) {
  return {
    save: (idNumber: string, options?: RequestOptions): Promise<ApiResult<SyncSettings>> => client.put<SyncSettings>(idNumberPaths.save, { document: idNumber }, options),
    clear: (options?: RequestOptions): Promise<ApiResult<SyncSettings>> => client.delete<SyncSettings>(idNumberPaths.save, options),
    reveal: (options?: RequestOptions): Promise<ApiResult<{ document: string }>> => client.post<{ document: string }>(idNumberPaths.reveal, undefined, options),
  };
}

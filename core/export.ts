/**
 * «Exportar todos mis datos de Finanzas» (propietario, 2026-11-16), sin nada de plataforma: lo comparten la web y la app.
 *
 * El espejo de «Borrar todos mis datos»: el servidor arma aparte (Celery) un ZIP con todo lo del ámbito descifrado (`finanzas.json`, un CSV por cuenta y
 * tarjeta en el formato del importador, los planes de apertura y un `LEEME.txt`), lo guarda cifrado y lo entrega **una sola vez** con un enlace firmado
 * de 15 minutos; se destruye al bajarlo o a las 24 h. Aquí está la lógica pura (estado, sondeo, rutas) y el cliente de las rutas. Nada financiero entra
 * en la URL ni en el estado: el trabajo solo dice estado, progreso y fechas.
 */
import type { ApiResult, RequestOptions } from "./api/client";
import type { components } from "./api/schema.gen";

type S = components["schemas"];

export type ExportJob = S["FmsExportJob"];
export type ExportLatest = S["FmsExportLatest"];

/** Una exportación pedida sobre lo personal (`null`) o sobre un hogar del que se es miembro (también un visor). */
export type ExportScope = { kind: "personal" } | { kind: "household"; id: string };

export const PERSONAL_EXPORT: ExportScope = { kind: "personal" };

/** El prefijo de la API que el cliente web antepone (`/api/fms/v1`): el enlace de descarga lo trae completo y se le quita. */
export const API_PREFIX = "/api/fms/v1";

export const exportPaths = {
  root: (scope: ExportScope): string => (scope.kind === "personal" ? "/me/export" : `/households/${encodeURIComponent(scope.id)}/export`),
  job: (scope: ExportScope, id: string): string => `${exportPaths.root(scope)}/${encodeURIComponent(id)}`,
} as const;

/** Lo mínimo que se pide al cliente de la API: el de la web y el de la app lo cumplen. */
export interface ExportClient {
  get<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>>;
}

/** El trabajo sigue armándose en el servidor. */
export function isActive(job: Pick<ExportJob, "status"> | null | undefined): boolean {
  return job?.status === "pending" || job?.status === "running";
}

/** El archivo está listo y el servidor dio un enlace vigente. */
export function canDownload(job: Pick<ExportJob, "status" | "download_url"> | null | undefined): job is Pick<ExportJob, "status" | "download_url"> & { download_url: string } {
  return job?.status === "ready" && typeof job.download_url === "string" && job.download_url.length > 0;
}

/** El archivo ya no existe (se bajó, caducó o falló): hay que pedir otro. */
export function isFinished(job: Pick<ExportJob, "status"> | null | undefined): boolean {
  return job?.status === "downloaded" || job?.status === "expired" || job?.status === "failed";
}

/** Cuánto esperar antes de volver a preguntar el estado: rápido al principio, más espaciado si tarda. Siempre acotado. */
export function pollDelay(attempt: number): number {
  return Math.min(5000, 1000 + Math.max(0, attempt) * 500);
}

/** Tope de sondeos (unos 5 minutos): pasado eso se deja de insistir y se invita a recargar. */
export const MAX_POLLS = 80;

/** El paso que se muestra (`collecting`, `files`, `packing`, `done`); cualquier otro valor cae en `collecting`. */
export type ExportStep = "collecting" | "files" | "packing" | "done";
export function stepOf(job: Pick<ExportJob, "step">): ExportStep {
  return job.step === "files" || job.step === "packing" || job.step === "done" ? job.step : "collecting";
}

/** Progreso entre 0 y 100, a prueba de valores raros. */
export function percent(job: Pick<ExportJob, "progress">): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(job.progress) ? job.progress : 0)));
}

/**
 * La ruta del cliente para un `download_url` del servidor (`/api/fms/v1/me/export/{id}/download?t=…`): sin el prefijo de la API. `null` si no es un
 * enlace de esta API (nunca se pide una URL que venga de otro sitio).
 */
export function downloadPath(url: string): string | null {
  return url.startsWith(`${API_PREFIX}/`) && !url.includes("//", API_PREFIX.length) && !url.includes("..") ? url.slice(API_PREFIX.length) : null;
}

/** El nombre del archivo que se entrega al navegador. */
export function exportFileName(scope: ExportScope, date: string): string {
  const day = date.replace(/[^0-9-]/g, "");
  return `${scope.kind === "personal" ? "finanzas" : "finanzas-hogar"}-${day}.zip`;
}

export function exportApi(client: ExportClient) {
  return {
    /** Pide el export (reautenticación reciente: el cliente abre el aviso). Si ya hay uno en curso, el servidor lo devuelve. */
    start: (scope: ExportScope, options?: RequestOptions): Promise<ApiResult<ExportJob>> => client.post<ExportJob>(exportPaths.root(scope), undefined, { ...options, unscoped: true }),
    /** El último trabajo de ese ámbito (para retomar tras recargar). */
    latest: (scope: ExportScope, options?: RequestOptions): Promise<ApiResult<ExportLatest>> => client.get<ExportLatest>(exportPaths.root(scope), { ...options, unscoped: true }),
    /** Estado y, si está listo, un enlace de descarga NUEVO de un solo uso (anula el anterior). */
    job: (scope: ExportScope, id: string, options?: RequestOptions): Promise<ApiResult<ExportJob>> => client.get<ExportJob>(exportPaths.job(scope, id), { ...options, unscoped: true }),
    /** Baja el ZIP con el enlace firmado (una sola vez). */
    download: (url: string, options?: RequestOptions): Promise<ApiResult<Blob>> => {
      const path = downloadPath(url);
      if (path === null) return Promise.resolve({ ok: false, status: 0, code: "invalid_link", data: undefined });
      return client.get<Blob>(path, { ...options, unscoped: true, asBlob: true });
    },
  };
}

export type ExportOutcome = "ok" | "cancelled" | "failed" | "link_used" | "error";

/** Del fallo de una petición al resultado que la interfaz sabe contar. */
export function outcomeOf(result: Extract<ApiResult<unknown>, { ok: false }>): ExportOutcome {
  if (result.status === 410) return "link_used";
  if (result.status === 403 && result.code === "reauthentication_required") return "cancelled";
  return "error";
}

/**
 * Pide el export y espera a que esté listo (sondeo acotado), sin plataforma: `wait` y `onProgress` los pone quien llama. Resuelve con el trabajo
 * listo (con su enlace de descarga) o con el resultado de lo que falló. Nunca reintenta un `POST`.
 */
export async function runExport(
  api: ReturnType<typeof exportApi>,
  scope: ExportScope,
  deps: { wait: (ms: number) => Promise<void>; onProgress?: (job: ExportJob) => void; locale?: string; signal?: AbortSignal },
): Promise<{ ok: true; job: ExportJob } | { ok: false; outcome: ExportOutcome; code: string }> {
  const options = { locale: deps.locale, signal: deps.signal };
  const started = await api.start(scope, options);
  if (!started.ok) return { ok: false, outcome: outcomeOf(started), code: started.code };
  let job = started.data;
  for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
    deps.onProgress?.(job);
    if (canDownload(job)) return { ok: true, job };
    if (isFinished(job)) return { ok: false, outcome: job.status === "failed" ? "failed" : "error", code: job.error_code || job.status };
    await deps.wait(pollDelay(attempt));
    if (deps.signal?.aborted) return { ok: false, outcome: "cancelled", code: "aborted" };
    const next = await api.job(scope, job.id, options);
    if (!next.ok) return { ok: false, outcome: outcomeOf(next), code: next.code };
    job = next.data;
  }
  return { ok: false, outcome: "error", code: "timeout" };
}

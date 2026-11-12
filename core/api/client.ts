/**
 * El cliente de la API del FMS, sin nada de plataforma (sin DOM, sin React Native): lo comparten la web y la app.
 * Cada plataforma inyecta lo suyo (`CoreClientDeps`):
 *
 *  - web: `credentials: "same-origin"` + CSRF (`src/api/client.ts`);
 *  - móvil: `credentials: "omit"` + `X-Session-Token` y cabeceras del dispositivo (`mobile/src/api`).
 *
 * Reglas comunes:
 *  - 401 → `onUnauthorized` (la plataforma decide: redirigir al login o volver a la pantalla de entrada).
 *  - Sin reintentos automáticos de un POST/PUT/PATCH/DELETE. Lo que repite una acción lo decide la persona; para que
 *    repetirla no duplique nada, las altas llevan `Idempotency-Key` (un UUID por acción de la persona).
 *  - `cache: "no-store"`; nada se escribe en consola ni en almacenamiento.
 */
import type { ApiErrorBody } from "./types";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | {
      ok: false;
      /** `0` si no hubo respuesta (sin red, o la plataforma no pudo preparar la petición). */
      status: number;
      /** `code` del cuerpo de error, o `network` / `csrf` / `invalid_response` / lo que diga `prepare`. */
      code: string;
      data: unknown;
    };

export interface RequestOptions {
  body?: unknown;
  /** Un UUID por acción de la persona: obligatorio para crear movimientos (regla 9). */
  idempotencyKey?: string;
  /** Para cancelar al desmontar. */
  signal?: AbortSignal;
  /** `false` para no avisar en un 401 (la compuerta lo maneja ella misma). */
  redirectOn401?: boolean;
  /** Va en `Accept-Language`: Django escribe en ese idioma sus mensajes. */
  locale?: string;
  /** `true`: la ruta se usa tal cual, sin pasar por `rewritePath` (p. ej. pedir lo PERSONAL estando en el ámbito del Hogar). */
  unscoped?: boolean;
  /** La respuesta buena es un archivo (exportaciones): se entrega como `Blob`, sin leerla como JSON. Los errores siguen siendo JSON. */
  asBlob?: boolean;
  /** Cabeceras extra de esta petición (p. ej. las del dispositivo en el inicio de sesión de la app). */
  headers?: Record<string, string>;
}

/** Lo que la plataforma añade a una petición (`headers`) o por qué no puede enviarla (`fail`: el `code` del resultado). */
export type Prepared = { headers: Record<string, string> } | { fail: string };

export interface CoreClientDeps {
  fetch: typeof fetch;
  /** Prefijo de todas las rutas: `/api/fms/v1` en la web; `https://host/api/fms/v1` en la app. */
  baseUrl: string;
  credentials: RequestCredentials;
  /** Cabeceras propias de la plataforma (CSRF, token de sesión). Se llama en cada petición. */
  prepare?: (method: Method, signal?: AbortSignal) => Promise<Prepared> | Prepared;
  /** Se llama en un 401 con su `code` (si `redirectOn401` no es `false`). */
  onUnauthorized: (code: string, status: number) => void;
  /** Reescribe la ruta según el ámbito activo (Personal u Hogar): las rutas de datos del hogar cuelgan de `households/{id}/…`. */
  rewritePath?: (path: string) => string;
}

const SAFE_METHODS = new Set<Method>(["GET"]);

export function createCoreClient(deps: CoreClientDeps) {
  async function request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
    const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
    const headers: Record<string, string> = { Accept: options.asBlob ? "*/*" : "application/json" };
    if (options.locale) headers["Accept-Language"] = options.locale;
    const prepared = deps.prepare ? await deps.prepare(method, options.signal) : { headers: {} };
    if ("fail" in prepared) return { ok: false, status: 0, code: prepared.fail, data: undefined };
    Object.assign(headers, prepared.headers, options.headers);
    if (!SAFE_METHODS.has(method)) {
      // Un `FormData` (la carga de un extracto) lo rotula el motor con su `boundary`: no se le pone `Content-Type`.
      if (options.body !== undefined && !isForm) headers["Content-Type"] = "application/json";
      if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
    }

    let response: Response;
    try {
      response = await deps.fetch(`${deps.baseUrl}${options.unscoped || !deps.rewritePath ? path : deps.rewritePath(path)}`, {
        method,
        headers,
        credentials: deps.credentials,
        cache: "no-store",
        signal: options.signal,
        body: options.body === undefined || method === "GET" ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
      });
    } catch {
      // Sin red, o cancelada. No se reintenta: un POST puede haber llegado.
      return { ok: false, status: 0, code: "network", data: undefined };
    }

    let data: unknown;
    try {
      data = response.status === 204 ? undefined : options.asBlob && response.ok ? await response.blob() : await response.json();
    } catch {
      data = undefined;
    }

    const code = (data as ApiErrorBody | undefined)?.code;
    if (response.status === 401 && options.redirectOn401 !== false) {
      deps.onUnauthorized(typeof code === "string" ? code : "", response.status);
    }
    if (response.ok) {
      if (data === undefined && response.status !== 204) return { ok: false, status: response.status, code: "invalid_response", data };
      return { ok: true, status: response.status, data: data as T };
    }
    return { ok: false, status: response.status, code: typeof code === "string" && code ? code : `http_${response.status}`, data };
  }

  return {
    get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, options),
    post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("POST", path, { ...options, body }),
    put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PUT", path, { ...options, body }),
    patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PATCH", path, { ...options, body }),
    delete: <T>(path: string, options?: RequestOptions) => request<T>("DELETE", path, options),
  };
}

export type CoreClient = ReturnType<typeof createCoreClient>;

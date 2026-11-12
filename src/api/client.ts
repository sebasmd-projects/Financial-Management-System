/**
 * El cliente de la API del FMS: `fetch` del MISMO origen con la cookie de sesión (`credentials: "same-origin"`).
 *
 *  - CSRF: Django lo exige en los métodos no seguros. Se lee de la cookie `csrftoken` si el navegador la deja leer;
 *    en producción la cookie del CV es `__Host-csrftoken` y `HttpOnly` (F8-01), así que JavaScript NO la lee y el
 *    token se pide a `/_allauth/cv/v1/csrf`, igual que el CV. Siempre en memoria de la petición: no se guarda.
 *  - 401 → redirección al inicio de sesión del CV (`onUnauthorized`).
 *  - Sin reintentos automáticos de un POST/PUT/PATCH/DELETE. Lo que repite una acción lo decide la persona; para que
 *    repetirla no duplique nada, las altas llevan `Idempotency-Key` (un UUID por acción de la persona, `newIdempotencyKey`).
 *  - `cache: "no-store"`; nada se escribe en consola ni en almacenamiento.
 */
import { CSRF_URL, FMS_API } from "@/config/paths";
import type { ApiErrorBody } from "./types";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | {
      ok: false;
      /** `0` si no hubo respuesta (sin red, o CSRF no disponible). */
      status: number;
      /** `code` del cuerpo de error, o `network` / `csrf` / `invalid_response`. */
      code: string;
      data: unknown;
    };

export interface RequestOptions {
  body?: unknown;
  /** Un UUID por acción de la persona (`newIdempotencyKey()`): obligatorio para crear movimientos (regla 9). */
  idempotencyKey?: string;
  /** Para cancelar al desmontar. */
  signal?: AbortSignal;
  /** `false` para no redirigir en un 401 (la compuerta lo maneja ella misma). */
  redirectOn401?: boolean;
  /** Va en `Accept-Language`: Django escribe en ese idioma sus mensajes. */
  locale?: string;
  /** `true`: la ruta se usa tal cual, sin pasar por `rewritePath` (p. ej. pedir lo PERSONAL estando en el ámbito del Hogar). */
  unscoped?: boolean;
  /** La respuesta buena es un archivo (exportaciones): se entrega como `Blob`, sin leerla como JSON. Los errores siguen siendo JSON. */
  asBlob?: boolean;
}

export interface ClientDeps {
  fetch: typeof fetch;
  /** Lee una cookie legible por JavaScript (la de CSRF, si no es HttpOnly). */
  readCookie: (name: string) => string | null;
  onUnauthorized: () => void;
  /** Reescribe la ruta según el ámbito activo (Personal u Hogar): las rutas de datos del hogar cuelgan de `households/{id}/…`. */
  rewritePath?: (path: string) => string;
}

const SAFE_METHODS = new Set<Method>(["GET"]);
/** `csrftoken` (desarrollo y staging) o `__Host-csrftoken` (producción, HttpOnly: no se podrá leer). */
const CSRF_COOKIES = ["csrftoken", "__Host-csrftoken"];

/** Un UUID v4 nuevo. Se crea al empezar la acción de la persona y se REUSA si ella la repite. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function readBrowserCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function createApiClient(deps: ClientDeps) {
  async function csrfToken(signal?: AbortSignal): Promise<string | null> {
    for (const name of CSRF_COOKIES) {
      const fromCookie = deps.readCookie(name);
      if (fromCookie) return fromCookie;
    }
    try {
      const response = await deps.fetch(CSRF_URL, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal });
      if (!response.ok) return null;
      const body = (await response.json()) as { csrfToken?: unknown };
      return typeof body.csrfToken === "string" && body.csrfToken ? body.csrfToken : null;
    } catch {
      return null;
    }
  }

  async function request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { Accept: options.asBlob ? "*/*" : "application/json" };
    if (options.locale) headers["Accept-Language"] = options.locale;
    if (!SAFE_METHODS.has(method)) {
      const token = await csrfToken(options.signal);
      if (!token) return { ok: false, status: 0, code: "csrf", data: undefined };
      headers["X-CSRFToken"] = token;
      // Un `FormData` (la carga de un extracto) lo rotula el navegador con su `boundary`: no se le pone `Content-Type`.
      if (options.body !== undefined && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
      if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
    }

    let response: Response;
    try {
      response = await deps.fetch(`${FMS_API}${options.unscoped || !deps.rewritePath ? path : deps.rewritePath(path)}`, {
        method,
        headers,
        credentials: "same-origin",
        cache: "no-store",
        signal: options.signal,
        body: options.body === undefined || method === "GET" ? undefined : options.body instanceof FormData ? options.body : JSON.stringify(options.body),
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

    if (response.status === 401 && options.redirectOn401 !== false) {
      deps.onUnauthorized();
    }
    if (response.ok) {
      if (data === undefined && response.status !== 204) return { ok: false, status: response.status, code: "invalid_response", data };
      return { ok: true, status: response.status, data: data as T };
    }
    const code = (data as ApiErrorBody | undefined)?.code;
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

export type ApiClient = ReturnType<typeof createApiClient>;

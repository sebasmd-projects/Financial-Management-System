/**
 * El cliente de la API del FMS en el navegador: `fetch` del MISMO origen con la cookie de sesión (`credentials: "same-origin"`).
 * La mecánica común (errores, idempotencia, sin caché) es de `core/api/client.ts`; aquí va lo propio del navegador:
 *
 *  - CSRF: Django lo exige en los métodos no seguros. Se lee de la cookie `csrftoken` si el navegador la deja leer;
 *    en producción la cookie del CV es `__Host-csrftoken` y `HttpOnly` (F8-01), así que JavaScript NO la lee y el
 *    token se pide a `/_allauth/cv/v1/csrf`, igual que el CV. Siempre en memoria de la petición: no se guarda.
 *  - 401 → redirección al inicio de sesión del CV (`onUnauthorized`).
 */
import { CSRF_URL, FMS_API } from "@/config/paths";
import { createCoreClient, type ApiResult, type Method, type Prepared, type RequestOptions } from "../../core/api/client";

export type { ApiResult, Method, RequestOptions };

export interface ClientDeps {
  fetch: typeof fetch;
  /** Lee una cookie legible por JavaScript (la de CSRF, si no es HttpOnly). */
  readCookie: (name: string) => string | null;
  onUnauthorized: () => void;
  /** Reescribe la ruta según el ámbito activo (Personal u Hogar): las rutas de datos del hogar cuelgan de `households/{id}/…`. */
  rewritePath?: (path: string) => string;
}

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

  return createCoreClient({
    fetch: deps.fetch,
    baseUrl: FMS_API,
    credentials: "same-origin",
    rewritePath: deps.rewritePath,
    onUnauthorized: () => deps.onUnauthorized(),
    async prepare(method, signal): Promise<Prepared> {
      if (method === "GET") return { headers: {} };
      const token = await csrfToken(signal);
      return token ? { headers: { "X-CSRFToken": token } } : { fail: "csrf" };
    },
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;

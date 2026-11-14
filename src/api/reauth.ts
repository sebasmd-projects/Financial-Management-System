/**
 * Reautenticación en el navegador (la misma que pide la app: `mobile/src/auth/reauth-prompt.tsx`). Una acción sensible —crear, rotar o borrar una
 * conexión de correo, crear una regla que confirma sola, ver la cédula guardada— responde `403 reauthentication_required` si la sesión no confirmó
 * la contraseña o el código hace poco. `withReauth` abre el aviso (`ReauthDialog`) y, si la persona confirma, REPITE la misma petición una vez
 * (con la misma `Idempotency-Key`, si la lleva: no duplica nada). Lo escrito vive solo en el aviso y se borra al cerrar.
 */
import { ACCOUNT_API } from "@/config/paths";
import { createReauth } from "../../core/reauth";
import type { ApiResult, RequestOptions } from "../../core/api/client";
import { csrfToken, readBrowserCookie, type ClientDeps } from "./client";

/** El aviso único de la sesión del navegador: varias peticiones a la vez comparten uno solo. */
export const reauth = createReauth();

export type ReauthOutcome = "ok" | "wrong" | "too_many" | "network" | "error";
export type ReauthMode = "password" | "code";

export function needsReauthentication(result: ApiResult<unknown>): boolean {
  return !result.ok && result.status === 403 && result.code === "reauthentication_required";
}

interface Verbs {
  get<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>>;
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>>;
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>>;
  delete<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>>;
}

/** El mismo cliente, pero una petición que pide reautenticación abre el aviso y se repite UNA vez si la persona confirma. */
export function withReauth<C extends Verbs>(client: C, ask: () => Promise<boolean>): C {
  async function guard<T>(call: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
    const first = await call();
    if (needsReauthentication(first) && (await ask())) return call();
    return first;
  }
  return {
    ...client,
    get: <T>(path: string, options?: RequestOptions) => guard(() => client.get<T>(path, options)),
    post: <T>(path: string, body?: unknown, options?: RequestOptions) => guard(() => client.post<T>(path, body, options)),
    put: <T>(path: string, body?: unknown, options?: RequestOptions) => guard(() => client.put<T>(path, body, options)),
    patch: <T>(path: string, body?: unknown, options?: RequestOptions) => guard(() => client.patch<T>(path, body, options)),
    delete: <T>(path: string, options?: RequestOptions) => guard(() => client.delete<T>(path, options)),
  };
}

const browserDeps = (): Pick<ClientDeps, "fetch" | "readCookie"> => ({ fetch: (input, init) => globalThis.fetch(input, init), readCookie: readBrowserCookie });

/** Confirma la contraseña o el código del autenticador con allauth (mismo origen, con CSRF). Nada se guarda ni se registra. */
export async function confirmReauthentication(mode: ReauthMode, value: string, deps: Pick<ClientDeps, "fetch" | "readCookie"> = browserDeps()): Promise<ReauthOutcome> {
  const token = await csrfToken(deps);
  if (!token) return "error";
  const path = mode === "password" ? "/auth/reauthenticate" : "/auth/2fa/reauthenticate";
  try {
    const response = await deps.fetch(`${ACCOUNT_API}${path}`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRFToken": token },
      body: JSON.stringify(mode === "password" ? { password: value } : { code: value }),
    });
    if (response.ok) return "ok";
    if (response.status === 429) return "too_many";
    if (response.status === 400) return "wrong";
    return "error";
  } catch {
    return "network";
  }
}

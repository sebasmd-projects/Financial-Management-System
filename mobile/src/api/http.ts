/**
 * Los dos clientes HTTP de la app, sobre el núcleo compartido (`core/api/client.ts`):
 *
 *  - `fms`: `/api/fms/v1`, con `X-Session-Token`, sin cookies (`credentials: "omit"`).
 *  - `allauth`: `/_allauth/app/v1` (cliente `app` de allauth headless). `allauthRaw` es el mismo sin la vigilancia de sesión
 *    (el inicio de sesión recibe 401 como parte normal del flujo: «falta el segundo factor»).
 *
 * Vigilancia de la sesión (en `fms` y `allauth`):
 *  - 401 en el FMS (`device_expired`, `device_revoked`, `invalid_token`…) o 410 en allauth → la sesión terminó: `onSessionEnded`.
 *  - Acción sensible: el FMS dice 403 `reauthentication_required`; allauth, 401 con el flujo `reauthenticate` o `mfa_reauthenticate`.
 *    Se pide la contraseña o el código (`reauthenticate`), y si la persona confirma se REPITE la misma petición una vez
 *    (con la misma `Idempotency-Key`, si la lleva).
 */
import { createCoreClient, type ApiResult, type RequestOptions } from "@core/api/client";
import { ALLAUTH_PATH, FMS_PATH } from "@/config";

export type SessionEndReason = "device_expired" | "revoked" | "expired" | "gone";

export interface HttpDeps {
  origin: string;
  fetch?: typeof fetch;
  getToken: () => string | null;
  onSessionEnded: (reason: SessionEndReason) => void;
  /** Pide contraseña o código a la persona; `true` si quedó confirmada. */
  reauthenticate: () => Promise<boolean>;
}

type Kind = "fms" | "allauth";
const REAUTH_FLOWS = new Set(["reauthenticate", "mfa_reauthenticate"]);

/** Los flujos que allauth anota en un 401 (`data.flows[].id`). */
export function flowsOf(data: unknown): { id: string; is_pending?: boolean; types?: string[] }[] {
  const flows = (data as { data?: { flows?: unknown } } | undefined)?.data?.flows;
  return Array.isArray(flows) ? (flows as { id: string }[]).filter((flow) => typeof flow?.id === "string") : [];
}

export function needsReauthentication(kind: Kind, result: ApiResult<unknown>): boolean {
  if (result.ok) return false;
  if (kind === "fms") return result.status === 403 && result.code === "reauthentication_required";
  return result.status === 401 && flowsOf(result.data).some((flow) => REAUTH_FLOWS.has(flow.id));
}

export function sessionEndReason(kind: Kind, result: ApiResult<unknown>): SessionEndReason | null {
  if (result.ok) return null;
  if (kind === "allauth") return result.status === 410 ? "gone" : result.status === 401 ? "expired" : null;
  if (result.status !== 401) return null;
  if (result.code === "device_expired") return "device_expired";
  if (result.code === "device_revoked") return "revoked";
  return "expired";
}

export function createHttp(deps: HttpDeps) {
  const doFetch: typeof fetch = deps.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const prepare = (): { headers: Record<string, string> } => {
    const token = deps.getToken();
    return { headers: token ? { "X-Session-Token": token } : {} };
  };
  const make = (path: string) =>
    createCoreClient({ fetch: doFetch, baseUrl: `${deps.origin}${path}`, credentials: "omit", prepare, onUnauthorized: () => undefined });
  const fmsCore = make(FMS_PATH);
  const allauthCore = make(ALLAUTH_PATH);

  async function guarded<T>(kind: Kind, call: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
    let result = await call();
    if (needsReauthentication(kind, result) && (await deps.reauthenticate())) result = await call();
    const reason = sessionEndReason(kind, result);
    if (reason && !needsReauthentication(kind, result)) deps.onSessionEnded(reason);
    return result;
  }

  type Core = typeof fmsCore;
  const wrap = (kind: Kind, core: Core, watch: boolean) => {
    const run = <T>(call: () => Promise<ApiResult<T>>) => (watch ? guarded(kind, call) : call());
    return {
      get: <T>(path: string, options?: RequestOptions) => run(() => core.get<T>(path, options)),
      post: <T>(path: string, body?: unknown, options?: RequestOptions) => run(() => core.post<T>(path, body, options)),
      put: <T>(path: string, body?: unknown, options?: RequestOptions) => run(() => core.put<T>(path, body, options)),
      patch: <T>(path: string, body?: unknown, options?: RequestOptions) => run(() => core.patch<T>(path, body, options)),
      delete: <T>(path: string, options?: RequestOptions) => run(() => core.delete<T>(path, options)),
    };
  };

  return { fms: wrap("fms", fmsCore, true), allauth: wrap("allauth", allauthCore, true), allauthRaw: wrap("allauth", allauthCore, false) };
}

export type Http = ReturnType<typeof createHttp>;

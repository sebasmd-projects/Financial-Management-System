/**
 * Las llamadas a la API `app` de allauth headless que usa la app, con lo que el servidor contesta ya interpretado.
 * Contraseña, código del segundo factor y reautenticación viajan en el cuerpo de la petición y no se guardan.
 *
 * Forma de las respuestas de allauth: `{ status, data, meta: { is_authenticated, session_token } }`; los 400 traen
 * `errors: [{ code, param }]`. El token puede CAMBIAR al terminar de entrar (allauth rota la clave): siempre se toma el último.
 */
import type { ApiResult } from "@core/api/client";
import { flowsOf, type Http } from "@/api/http";
import { deviceHeaders } from "./device";

export type LoginStep =
  | { kind: "authenticated"; token: string | null }
  | { kind: "second_factor"; via: "mfa" | "staff"; token: string | null }
  | { kind: "unsupported_flow"; flow: string }
  | { kind: "failed"; reason: FailReason };

export type FailReason = "invalid_credentials" | "invalid_code" | "too_many" | "network" | "expired" | "generic";

interface AllauthBody {
  status?: number;
  data?: { flows?: unknown };
  meta?: { session_token?: unknown; is_authenticated?: unknown };
  errors?: { code?: string; param?: string }[];
}

const tokenOf = (data: unknown): string | null => {
  const token = (data as AllauthBody | undefined)?.meta?.session_token;
  return typeof token === "string" && token ? token : null;
};

function failure(result: Extract<ApiResult<unknown>, { ok: false }>, wrong: FailReason): LoginStep {
  if (result.status === 0) return { kind: "failed", reason: "network" };
  if (result.status === 429) return { kind: "failed", reason: "too_many" };
  if (result.status === 400) return { kind: "failed", reason: wrong };
  if (result.status === 410) return { kind: "failed", reason: "expired" };
  return { kind: "failed", reason: "generic" };
}

/** Interpreta la respuesta de un paso de entrada (contraseña, TOTP, código del personal). */
export function readStep(result: ApiResult<unknown>, wrong: FailReason): LoginStep {
  if (result.ok) return { kind: "authenticated", token: tokenOf(result.data) };
  if (result.status === 401) {
    const flows = flowsOf(result.data);
    const pending = flows.find((flow) => flow.is_pending);
    if (pending?.id === "mfa_authenticate") return { kind: "second_factor", via: "mfa", token: tokenOf(result.data) };
    if (pending?.id === "staff_otp") return { kind: "second_factor", via: "staff", token: tokenOf(result.data) };
    if (pending) return { kind: "unsupported_flow", flow: pending.id };
    return { kind: "failed", reason: wrong };
  }
  return failure(result, wrong);
}

export function createAllauthApi(http: Http) {
  return {
    async login(email: string, password: string, remember: boolean): Promise<LoginStep> {
      const result = await http.allauthRaw.post("/auth/login", { email, password }, { headers: deviceHeaders(remember) });
      return readStep(result, "invalid_credentials");
    },
    /** El código del segundo factor (TOTP o de recuperación) de una cuenta de visitante o del personal. */
    async submitCode(via: "mfa" | "staff", code: string, remember: boolean): Promise<LoginStep> {
      const path = via === "staff" ? "/auth/staff/otp" : "/auth/2fa/authenticate";
      const result = await http.allauthRaw.post(path, { code }, { headers: deviceHeaders(remember) });
      return readStep(result, "invalid_code");
    },
    /** Cierra la sesión en el servidor (revoca el dispositivo). Mejor esfuerzo: si no hay red, el token igual se borra aquí. */
    async logout(): Promise<void> {
      await http.allauthRaw.delete("/auth/session");
    },
    /** Confirma de nuevo con la contraseña. `true` si el servidor la aceptó. */
    async reauthenticateWithPassword(password: string): Promise<ReauthOutcome> {
      return reauthOutcome(await http.allauthRaw.post("/auth/reauthenticate", { password }));
    },
    /** Confirma con un código TOTP o de recuperación. */
    async reauthenticateWithCode(code: string): Promise<ReauthOutcome> {
      return reauthOutcome(await http.allauthRaw.post("/auth/2fa/reauthenticate", { code }));
    },
    /** Los códigos de recuperación sin usar (allauth los genera al activar el TOTP). Pide reautenticación reciente. */
    async recoveryCodes(): Promise<string[] | null> {
      const result = await http.allauth.get("/account/authenticators/recovery_codes");
      if (!result.ok) return null;
      const codes = (result.data as { data?: { unused_codes?: unknown } }).data?.unused_codes;
      return Array.isArray(codes) ? codes.filter((code): code is string => typeof code === "string") : null;
    },
    totp: {
      /** `secret` si aún no hay TOTP (allauth lo contesta con 404 + `meta.secret`); `active` si ya existe. */
      async status(): Promise<TotpStatus> {
        const result = await http.allauth.get("/account/authenticators/totp");
        if (result.ok) return { kind: "active" };
        if (result.status === 404) {
          const secret = (result.data as { meta?: { secret?: unknown } } | undefined)?.meta?.secret;
          if (typeof secret === "string" && secret) return { kind: "inactive", secret };
        }
        if (result.status === 403) return { kind: "forbidden" };
        return { kind: "error", network: result.status === 0 };
      },
      async activate(code: string): Promise<"ok" | "invalid_code" | "forbidden" | "error"> {
        const result = await http.allauth.post("/account/authenticators/totp", { code });
        if (result.ok) return "ok";
        if (result.status === 400) return "invalid_code";
        if (result.status === 403) return "forbidden";
        return "error";
      },
    },
  };
}

export type ReauthOutcome = "ok" | "wrong" | "too_many" | "network" | "error";
export type TotpStatus = { kind: "active" } | { kind: "inactive"; secret: string } | { kind: "forbidden" } | { kind: "error"; network: boolean };

function reauthOutcome(result: ApiResult<unknown>): ReauthOutcome {
  if (result.ok) return "ok";
  if (result.status === 0) return "network";
  if (result.status === 429) return "too_many";
  if (result.status === 400) return "wrong";
  return "error";
}

export type AllauthApi = ReturnType<typeof createAllauthApi>;

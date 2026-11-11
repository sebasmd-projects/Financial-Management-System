/**
 * La sesión del FMS: qué dice `/api/fms/v1/me`. Vive SOLO en memoria (un almacén externo para `useSyncExternalStore`):
 * nada de `localStorage` ni de caché del navegador.
 *
 * ¿Por qué la compuerta se resuelve en el NAVEGADOR y no en el servidor de Next?
 *  1. La cookie de sesión (`__Host-cv_session`) es de nginx/Django y del navegador. Si Next la reenviara a Django desde el
 *     servidor, el contenedor `fms-web` tendría que conocer la URL interna del backend (dentro de Compose Next no es
 *     `127.0.0.1` para Django) y recibiría la sesión de cada persona: una superficie más donde puede filtrarse.
 *  2. Desde el navegador la petición es del mismo origen: nginx la enruta a Django con la sesión y el CSRF de siempre.
 *  3. El HTML de Next no lleva datos de nadie (la cáscara y pantallas de relleno); lo que protege la información es la API,
 *     que exige sesión, MFA y dueño en CADA petición. La compuerta es experiencia de usuario, no el control de acceso.
 *  4. Cada página es dinámica y `no-store` de todos modos (nonce de CSP), así que no se pierde caché.
 * Coste: un parpadeo de «Comprobando tu sesión…» al entrar; la cáscara no se pinta hasta saber quién eres.
 */
import type { ApiClient } from "@/api/client";
import type { MeResponse } from "@/api/types";
import { DEFAULT_LOGIN_URL, safeInternalPath } from "@/api/login";

export type SessionState =
  | { status: "loading" }
  | { status: "anonymous"; loginUrl: string }
  | { status: "error"; reason: "network" | "server" }
  | { status: "ready"; me: MeResponse };

/** Valida la forma de `/me`: es un contrato entre repos, y la compuerta decide con ella. */
export function parseMe(value: unknown): MeResponse | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const user = v.user as Record<string, unknown> | undefined;
  const consent = v.consent as Record<string, unknown> | undefined;
  if (!user || typeof user !== "object" || !consent || typeof consent !== "object") return null;
  const ok =
    (typeof user.id === "number" || typeof user.id === "string") &&
    typeof user.display_name === "string" &&
    typeof user.email === "string" &&
    typeof user.email_verified === "boolean" &&
    typeof v.mfa_verified === "boolean" &&
    typeof v.finance_active === "boolean" &&
    typeof consent.required_version === "string" &&
    (typeof consent.accepted_version === "string" || consent.accepted_version === null) &&
    typeof v.mfa_setup_url === "string" &&
    typeof v.login_url === "string";
  if (!ok) return null;
  return {
    user: { id: user.id as number | string, display_name: user.display_name as string, email: user.email as string, email_verified: user.email_verified as boolean },
    mfa_verified: v.mfa_verified as boolean,
    finance_active: v.finance_active as boolean,
    consent: { required_version: consent.required_version as string, accepted_version: consent.accepted_version as string | null },
    // Solo rutas internas: un `mfa_setup_url` absoluto no se sigue.
    mfa_setup_url: safeInternalPath(v.mfa_setup_url, "/es/account/2fa"),
    login_url: safeInternalPath(v.login_url, DEFAULT_LOGIN_URL),
  };
}

export type GateView =
  | { kind: "loading" }
  | { kind: "redirect"; loginUrl: string }
  | { kind: "error"; reason: "network" | "server" }
  /** Hay que activar (o aceptar una versión nueva de los términos). */
  | { kind: "activation"; me: MeResponse; reason: "inactive" | "reconsent" }
  /** Activo, pero esta sesión no pasó el segundo factor. */
  | { kind: "mfa"; me: MeResponse }
  | { kind: "app"; me: MeResponse };

export function gateView(state: SessionState): GateView {
  switch (state.status) {
    case "loading":
      return { kind: "loading" };
    case "anonymous":
      return { kind: "redirect", loginUrl: state.loginUrl };
    case "error":
      return { kind: "error", reason: state.reason };
  }
  const { me } = state;
  if (!me.finance_active) return { kind: "activation", me, reason: "inactive" };
  if (!me.mfa_verified) return { kind: "mfa", me };
  if (me.consent.accepted_version !== me.consent.required_version) return { kind: "activation", me, reason: "reconsent" };
  return { kind: "app", me };
}

export function createSessionStore(client: Pick<ApiClient, "get">) {
  let state: SessionState = { status: "loading" };
  let controller: AbortController | null = null;
  const listeners = new Set<() => void>();

  const set = (next: SessionState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Pide `/me`. `quiet` no vuelve a «cargando» (al re-comprobar tras activar). */
    async load(options: { quiet?: boolean } = {}): Promise<void> {
      controller?.abort();
      const mine = new AbortController();
      controller = mine;
      if (!options.quiet) set({ status: "loading" });
      const result = await client.get<unknown>("/me", { signal: mine.signal, redirectOn401: false });
      if (mine.signal.aborted) return;
      if (result.ok) {
        const me = parseMe(result.data);
        set(me ? { status: "ready", me } : { status: "error", reason: "server" });
      } else if (result.status === 401) {
        const loginUrl = (result.data as { login_url?: unknown } | undefined)?.login_url;
        set({ status: "anonymous", loginUrl: safeInternalPath(loginUrl, DEFAULT_LOGIN_URL) });
      } else {
        set({ status: "error", reason: result.status === 0 ? "network" : "server" });
      }
    },
    abort() {
      controller?.abort();
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;

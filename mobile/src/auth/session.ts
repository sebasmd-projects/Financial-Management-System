/**
 * La sesión de la app como máquina de estados en memoria, sin React ni Expo (se prueba con dobles). Nada financiero toca el disco:
 * lo único que se guarda es el token, y solo con «Recordarme» (`token-store.ts`).
 *
 *   booting ─► locked ─(huella)─► loading ─► ready | setup | load_failed
 *      └─────► signed_out ─(contraseña)─► second_factor ─(código)─► loading
 *   cualquier estado ─► signed_out  (cerrar sesión, 401 `device_expired`/`device_revoked`, 410 de allauth)
 *   ready | setup ─► locked          (60 s en segundo plano, o al arrancar con un token guardado)
 *
 * Al bloquear y al cerrar sesión se borra TODO lo que haya en memoria (`onWipe`); con «Recordarme» el token también sale de la
 * memoria al bloquear y se vuelve a leer del llavero al desbloquear.
 */
import type { components } from "@core/api/schema.gen";
import type { Biometric } from "@/lock/biometric";
import type { Http, SessionEndReason } from "@/api/http";
import type { AllauthApi, FailReason, LoginStep } from "./allauth";
import type { memoryToken as MemoryToken } from "./memory-token";
import type { TokenStore } from "./token-store";

export type Me = components["schemas"]["FmsMe"];
export type Notice = SessionEndReason | "logged_out" | "device_unsecured";

export type Phase =
  | { name: "booting" }
  | { name: "signed_out"; notice: Notice | null }
  | { name: "locked" }
  | { name: "second_factor"; via: "mfa" | "staff"; remember: boolean }
  | { name: "loading" }
  | { name: "load_failed"; network: boolean }
  | { name: "setup"; me: Me }
  | { name: "ready"; me: Me };

export type SignInFailure = FailReason | "device_unsecured" | "unsupported_flow";
export type SignInResult = { ok: true } | { ok: false; reason: SignInFailure };

export interface SessionDeps {
  store: TokenStore;
  token: typeof MemoryToken;
  biometric: Biometric;
  /** Se pide perezosamente: el cliente HTTP necesita al controlador (`onSessionEnded`) y el controlador al cliente. */
  api: () => { fms: Pick<Http["fms"], "get">; allauth: Pick<AllauthApi, "login" | "submitCode" | "logout"> };
  /** Antes de invalidar la sesión (p. ej. revocar el destino de push). Un fallo o una demora no retienen el cierre de sesión. */
  beforeLogout?: () => Promise<void>;
}

/** ¿Está la cuenta lista para usar el FMS? Segundo factor de ESTA sesión, activación y la versión vigente de los textos. */
export function isReady(me: Me): boolean {
  return me.mfa_verified && me.finance_active && me.consent.accepted_version === me.consent.required_version;
}

export function createSession(deps: SessionDeps) {
  let phase: Phase = { name: "booting" };
  let remembered = false;
  let authBusy = false;
  const listeners = new Set<() => void>();
  const wipers = new Set<() => void>();

  function set(next: Phase) {
    phase = next;
    listeners.forEach((listener) => listener());
  }
  function wipe() {
    wipers.forEach((wiper) => wiper());
  }

  async function loadMe(): Promise<void> {
    set({ name: "loading" });
    const result = await deps.api().fms.get<Me>("/me");
    // Si mientras tanto la sesión terminó (401), ya está en `signed_out`: no se pisa.
    if (phase.name !== "loading") return;
    if (result.ok) set(isReady(result.data) ? { name: "ready", me: result.data } : { name: "setup", me: result.data });
    else set({ name: "load_failed", network: result.status === 0 });
  }

  async function finishLogin(token: string | null, remember: boolean): Promise<SignInResult> {
    if (!token) return { ok: false, reason: "generic" };
    deps.token.set(token);
    remembered = remember ? await deps.store.save(token) : false;
    if (!remember) await deps.store.clear();
    await loadMe();
    return { ok: true };
  }

  async function afterStep(step: LoginStep, remember: boolean): Promise<SignInResult> {
    switch (step.kind) {
      case "authenticated":
        return finishLogin(step.token, remember);
      case "second_factor":
        if (step.token) deps.token.set(step.token);
        set({ name: "second_factor", via: step.via, remember });
        return { ok: true };
      case "unsupported_flow":
        deps.token.clear();
        return { ok: false, reason: "unsupported_flow" };
      case "failed":
        if (step.reason === "expired") expire("expired");
        return { ok: false, reason: step.reason };
    }
  }

  function expire(reason: SessionEndReason | "logged_out") {
    wipe();
    deps.token.clear();
    remembered = false;
    void deps.store.clear();
    set({ name: "signed_out", notice: reason });
  }

  return {
    getPhase: () => phase,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Lo que otros módulos guardan en memoria se registra aquí para borrarse al bloquear o cerrar sesión. */
    onWipe(wiper: () => void) {
      wipers.add(wiper);
      return () => wipers.delete(wiper);
    },

    /** Arranque en frío: con un token guardado, bloqueado (se lee de verdad solo tras la huella). */
    async boot(): Promise<void> {
      if ((await deps.biometric.capability()) === "none") return set({ name: "signed_out", notice: "device_unsecured" });
      const stored = await deps.store.read();
      if (stored) {
        remembered = true;
        set({ name: "locked" });
      } else {
        set({ name: "signed_out", notice: null });
      }
    },

    async signIn(email: string, password: string, remember: boolean): Promise<SignInResult> {
      if (authBusy) return { ok: false, reason: "generic" };
      authBusy = true;
      try {
        if ((await deps.biometric.capability()) === "none") return { ok: false, reason: "device_unsecured" };
        return await afterStep(await deps.api().allauth.login(email, password, remember), remember);
      } finally {
        authBusy = false;
      }
    },

    async submitCode(code: string): Promise<SignInResult> {
      if (phase.name !== "second_factor" || authBusy) return { ok: false, reason: "generic" };
      const { via, remember } = phase;
      authBusy = true;
      try {
        return await afterStep(await deps.api().allauth.submitCode(via, code, remember), remember);
      } finally {
        authBusy = false;
      }
    },

    /** Vuelve a pedir contraseña (p. ej. desde la pantalla del segundo factor). */
    cancelSecondFactor() {
      deps.token.clear();
      set({ name: "signed_out", notice: null });
    },

    lock() {
      if (phase.name === "booting" || phase.name === "signed_out" || phase.name === "second_factor" || phase.name === "locked") return;
      wipe();
      if (remembered) deps.token.clear();
      set({ name: "locked" });
    },

    /** Pide la huella (o el PIN del teléfono). `success` abre; cualquier otro resultado deja la app bloqueada. */
    async unlock(reason: string): Promise<"success" | "cancelled" | "failed" | "unavailable"> {
      if (phase.name !== "locked") return "failed";
      const result = await deps.biometric.authenticate(reason);
      if (result !== "success") return result;
      if (!deps.token.get()) {
        const stored = await deps.store.read();
        if (!stored) {
          expire("expired");
          return "success";
        }
        deps.token.set(stored);
      }
      await loadMe();
      return "success";
    },

    refresh: loadMe,

    async logout(): Promise<void> {
      if (deps.token.get()) {
        try {
          await deps.beforeLogout?.();
        } catch {
          // La sesión se cierra igual: el servidor también borra los destinos de push al revocar el dispositivo.
        }
        await deps.api().allauth.logout();
      }
      expire("logged_out");
    },

    /** El servidor dijo que esta sesión ya no vale (401 o 410). */
    expire(reason: SessionEndReason) {
      if (phase.name === "signed_out" || phase.name === "booting") return;
      expire(reason);
    },
  };
}

export type Session = ReturnType<typeof createSession>;

import { describe, expect, it } from "vitest";
import type { MeResponse } from "@/api/types";
import { createApiClient } from "@/api/client";
import { ME } from "@/test/fixtures";
import { mockFetch, type MockReply } from "@/test/mock-fetch";
import { createSessionStore, gateView, parseMe, type SessionState } from "./store";

function storeWith(me: MockReply) {
  const mock = mockFetch({ "GET /api/fms/v1/me": me });
  const onUnauthorized = () => {
    throw new Error("la compuerta no debe redirigir por su cuenta desde el cliente");
  };
  const client = createApiClient({ fetch: mock.fetch, readCookie: () => null, onUnauthorized });
  return { store: createSessionStore(client), ...mock };
}

describe("parseMe (contrato de /me)", () => {
  it("acepta el contrato", () => {
    expect(parseMe(ME)).toEqual(ME);
    expect(parseMe({ ...ME, consent: { required_version: "v1", accepted_version: null } })?.consent.accepted_version).toBeNull();
    expect(parseMe({ ...ME, user: { ...ME.user, id: "uuid-1" } })?.user.id).toBe("uuid-1");
  });
  it("rechaza formas rotas", () => {
    for (const bad of [null, "x", {}, { ...ME, mfa_verified: "yes" }, { ...ME, consent: null }, { ...ME, user: { id: 1 } }, { ...ME, login_url: 5 }, { ...ME, finance_active: undefined }]) {
      expect(parseMe(bad)).toBeNull();
    }
  });
  it("solo rutas internas en login_url y mfa_setup_url", () => {
    const parsed = parseMe({ ...ME, login_url: "https://evil.example/x", mfa_setup_url: "//evil.example" })!;
    expect(parsed.login_url).toBe("/es/account/login");
    expect(parsed.mfa_setup_url).toBe("/es/account/2fa");
  });
});

describe("almacén de sesión", () => {
  it("200 → ready; pide /me del mismo origen con la cookie y sin caché", async () => {
    const { store, calls } = storeWith({ status: 200, json: ME });
    expect(store.getState()).toEqual({ status: "loading" });
    await store.load();
    expect(store.getState()).toEqual({ status: "ready", me: ME });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "GET", url: "/api/fms/v1/me", credentials: "same-origin", cache: "no-store" });
  });
  it("401 → anónimo (el destino lo decide la compuerta con el idioma y la página actuales)", async () => {
    const bare = storeWith({ status: 401 });
    await bare.store.load();
    expect(bare.store.getState()).toEqual({ status: "anonymous" });
    const withBody = storeWith({ status: 401, json: { login_url: "https://evil.example" } });
    await withBody.store.load();
    expect(withBody.store.getState()).toEqual({ status: "anonymous" });
  });
  it("500 y cuerpo inválido → error de servidor; sin red → error de red", async () => {
    const server = storeWith({ status: 500 });
    await server.store.load();
    expect(server.store.getState()).toEqual({ status: "error", reason: "server" });
    const bad = storeWith({ status: 200, json: { hola: 1 } });
    await bad.store.load();
    expect(bad.store.getState()).toEqual({ status: "error", reason: "server" });
    const offline = createSessionStore(createApiClient({ fetch: () => Promise.reject(new TypeError("net")), readCookie: () => null, onUnauthorized: () => {} }));
    await offline.load();
    expect(offline.getState()).toEqual({ status: "error", reason: "network" });
  });
  it("notifica a los suscriptores y `quiet` no vuelve a «cargando»", async () => {
    const { store } = storeWith({ status: 200, json: ME });
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.getState().status));
    await store.load();
    await store.load({ quiet: true });
    expect(seen).toEqual(["loading", "ready", "ready"]);
  });
  it("una carga vieja no pisa a la nueva", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let n = 0;
    const slowThenFast: typeof fetch = async (_input, init) => {
      const mine = ++n;
      if (mine === 1) await gate;
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return new Response(JSON.stringify(mine === 1 ? { ...ME, user: { ...ME.user, display_name: "vieja" } } : ME), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const store = createSessionStore(createApiClient({ fetch: slowThenFast, readCookie: () => null, onUnauthorized: () => {} }));
    const first = store.load();
    const second = store.load();
    release();
    await Promise.all([first, second]);
    expect(store.getState()).toMatchObject({ status: "ready", me: { user: { display_name: "Ana Prueba" } } });
  });
});

describe("gateView: qué pantalla toca", () => {
  const ready = (patch: Partial<MeResponse>): SessionState => ({ status: "ready", me: { ...ME, ...patch } });
  it("cargando, sin sesión y error", () => {
    expect(gateView({ status: "loading" })).toEqual({ kind: "loading" });
    expect(gateView({ status: "anonymous" })).toEqual({ kind: "anonymous" });
    expect(gateView({ status: "error", reason: "network" })).toEqual({ kind: "error", reason: "network" });
  });
  it("sin finanzas activas → Activación (aunque ya tenga 2FA)", () => {
    expect(gateView(ready({ finance_active: false }))).toMatchObject({ kind: "activation", reason: "inactive" });
    expect(gateView(ready({ finance_active: false, mfa_verified: false, consent: { required_version: "v1", accepted_version: null } }))).toMatchObject({ kind: "activation", reason: "inactive" });
  });
  it("activo pero sin 2FA en esta sesión → pantalla del segundo factor, no la app", () => {
    expect(gateView(ready({ mfa_verified: false }))).toMatchObject({ kind: "mfa" });
  });
  it("activo con 2FA pero versión de términos distinta → volver a aceptar", () => {
    expect(gateView(ready({ consent: { required_version: "2026-12-01", accepted_version: "2026-11-10" } }))).toMatchObject({ kind: "activation", reason: "reconsent" });
    expect(gateView(ready({ consent: { required_version: "2026-12-01", accepted_version: null } }))).toMatchObject({ kind: "activation", reason: "reconsent" });
  });
  it("todo en regla → la app", () => {
    expect(gateView(ready({}))).toMatchObject({ kind: "app" });
  });
});

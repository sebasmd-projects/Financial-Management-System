import { createHttp, flowsOf, needsReauthentication, sessionEndReason, type HttpDeps } from "./http";

type Reply = { status: number; json?: unknown };

function setup(replies: Record<string, Reply | Reply[]>, extra: Partial<HttpDeps> = {}) {
  const calls: { method: string; url: string; headers: Headers; body: unknown; credentials?: RequestCredentials }[] = [];
  const queue = Object.fromEntries(Object.entries(replies).map(([key, value]) => [key, Array.isArray(value) ? [...value] : [value]]));
  const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const method = (init.method ?? "GET").toUpperCase();
    const key = `${method} ${String(input)}`;
    calls.push({ method, url: String(input), headers: new Headers(init.headers), body: typeof init.body === "string" ? JSON.parse(init.body) : init.body, credentials: init.credentials });
    const list = queue[key];
    const reply = list ? (list.length > 1 ? list.shift()! : list[0]) : { status: 404, json: { code: "not_mocked" } };
    return new Response(reply.status === 204 ? null : JSON.stringify(reply.json ?? {}), { status: reply.status, headers: { "Content-Type": "application/json" } });
  };
  const onSessionEnded = jest.fn();
  const reauthenticate = jest.fn(async () => true);
  const http = createHttp({ origin: "https://example.test", fetch: fetchImpl as typeof fetch, getToken: () => "tok-1", onSessionEnded, reauthenticate, ...extra });
  return { http, calls, onSessionEnded, reauthenticate };
}

const FMS = "https://example.test/api/fms/v1";
const ALLAUTH = "https://example.test/_allauth/app/v1";

describe("cliente HTTP de la app", () => {
  it("manda X-Session-Token, sin cookies ni CSRF", async () => {
    const { http, calls } = setup({ [`POST ${FMS}/activation`]: { status: 200, json: {} } });
    await http.fms.post("/activation", { accept_version: "v1" });
    expect(calls[0].headers.get("X-Session-Token")).toBe("tok-1");
    expect(calls[0].headers.has("X-CSRFToken")).toBe(false);
    expect(calls[0].credentials).toBe("omit");
  });

  it("sin token no manda la cabecera", async () => {
    const { http, calls } = setup({ [`GET ${FMS}/me`]: { status: 200, json: {} } }, { getToken: () => null });
    await http.fms.get("/me");
    expect(calls[0].headers.has("X-Session-Token")).toBe(false);
  });

  describe("sesión terminada", () => {
    it.each([
      ["device_expired", "device_expired"],
      ["device_revoked", "revoked"],
      ["invalid_token", "expired"],
      ["not_authenticated", "expired"],
    ])("401 %s del FMS → %s", async (code, reason) => {
      const { http, onSessionEnded } = setup({ [`GET ${FMS}/me`]: { status: 401, json: { code } } });
      await http.fms.get("/me");
      expect(onSessionEnded).toHaveBeenCalledWith(reason);
    });
    it("410 de allauth → gone", async () => {
      const { http, onSessionEnded } = setup({ [`GET ${ALLAUTH}/auth/session`]: { status: 410, json: { status: 410 } } });
      await http.allauth.get("/auth/session");
      expect(onSessionEnded).toHaveBeenCalledWith("gone");
    });
    it("el cliente sin vigilancia (inicio de sesión) no cierra la sesión por un 401", async () => {
      const { http, onSessionEnded } = setup({ [`POST ${ALLAUTH}/auth/login`]: { status: 401, json: { status: 401, data: { flows: [{ id: "mfa_authenticate", is_pending: true }] } } } });
      await http.allauthRaw.post("/auth/login", {});
      expect(onSessionEnded).not.toHaveBeenCalled();
    });
    it("un 403 de negocio no cierra nada", async () => {
      const { http, onSessionEnded } = setup({ [`GET ${FMS}/me`]: { status: 403, json: { code: "mfa_required" } } });
      await http.fms.get("/me");
      expect(onSessionEnded).not.toHaveBeenCalled();
    });
  });

  describe("reautenticación", () => {
    it("403 reauthentication_required → pide confirmación y repite con la MISMA Idempotency-Key", async () => {
      const { http, calls, reauthenticate } = setup({ [`POST ${FMS}/devices/revoke-others`]: [{ status: 403, json: { code: "reauthentication_required" } }, { status: 200, json: { revoked: 2 } }] });
      const result = await http.fms.post("/devices/revoke-others", {}, { idempotencyKey: "k-1" });
      expect(result).toMatchObject({ ok: true, data: { revoked: 2 } });
      expect(reauthenticate).toHaveBeenCalledTimes(1);
      expect(calls).toHaveLength(2);
      expect(calls.map((c) => c.headers.get("Idempotency-Key"))).toEqual(["k-1", "k-1"]);
    });
    it("si la persona cancela, la petición falla con el 403 y no se repite", async () => {
      const { http, calls } = setup({ [`DELETE ${FMS}/devices/x`]: { status: 403, json: { code: "reauthentication_required" } } }, { reauthenticate: async () => false });
      expect(await http.fms.delete("/devices/x")).toMatchObject({ ok: false, status: 403, code: "reauthentication_required" });
      expect(calls).toHaveLength(1);
    });
    it("solo repite una vez aunque el servidor vuelva a pedirla", async () => {
      const { http, calls, reauthenticate } = setup({ [`POST ${FMS}/x`]: { status: 403, json: { code: "reauthentication_required" } } });
      await http.fms.post("/x", {});
      expect(calls).toHaveLength(2);
      expect(reauthenticate).toHaveBeenCalledTimes(1);
    });
    it("allauth: 401 con flujo `reauthenticate` o `mfa_reauthenticate` también pide y repite", async () => {
      const body = { status: 401, data: { flows: [{ id: "reauthenticate" }, { id: "mfa_reauthenticate", types: ["totp"] }] } };
      const { http, calls, reauthenticate } = setup({ [`GET ${ALLAUTH}/account/authenticators/recovery_codes`]: [{ status: 401, json: body }, { status: 200, json: { data: { unused_codes: ["a"] } } }] });
      expect(await http.allauth.get("/account/authenticators/recovery_codes")).toMatchObject({ ok: true });
      expect(reauthenticate).toHaveBeenCalledTimes(1);
      expect(calls).toHaveLength(2);
    });
    it("un 401 que pide reautenticar no cierra la sesión", async () => {
      const body = { status: 401, data: { flows: [{ id: "reauthenticate" }] } };
      const { http, onSessionEnded } = setup({ [`GET ${ALLAUTH}/x`]: { status: 401, json: body } }, { reauthenticate: async () => false });
      await http.allauth.get("/x");
      expect(onSessionEnded).not.toHaveBeenCalled();
    });
  });

  describe("funciones puras", () => {
    const fail = (status: number, code: string, data: unknown = {}) => ({ ok: false as const, status, code, data });
    it("flowsOf ignora lo que no sea una lista de flujos", () => {
      expect(flowsOf(undefined)).toEqual([]);
      expect(flowsOf({ data: { flows: "x" } })).toEqual([]);
      expect(flowsOf({ data: { flows: [{ id: "a" }, { nope: 1 }] } })).toEqual([{ id: "a" }]);
    });
    it("needsReauthentication y sessionEndReason distinguen FMS y allauth", () => {
      expect(needsReauthentication("fms", fail(403, "reauthentication_required"))).toBe(true);
      expect(needsReauthentication("fms", fail(401, "reauthentication_required"))).toBe(false);
      expect(needsReauthentication("allauth", fail(403, "x"))).toBe(false);
      expect(sessionEndReason("fms", fail(500, "x"))).toBeNull();
      expect(sessionEndReason("allauth", fail(410, "x"))).toBe("gone");
    });
  });
});

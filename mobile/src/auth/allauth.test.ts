import { createAllauthApi, readStep } from "./allauth";
import type { Http } from "@/api/http";

jest.mock("expo-device", () => ({ modelName: "Pixel 8" }));
jest.mock("expo-application", () => ({ nativeApplicationVersion: "0.1.0" }));

const fail = (status: number, data: unknown = {}) => ({ ok: false as const, status, code: `http_${status}`, data });
const pending = (id: string) => fail(401, { status: 401, data: { flows: [{ id: "login" }, { id, is_pending: true }] }, meta: { session_token: "pending-token" } });

describe("pasos de entrada de allauth", () => {
  it("200 → autenticado con el token nuevo", () => {
    expect(readStep({ ok: true, status: 200, data: { meta: { session_token: "t" } } }, "invalid_credentials")).toEqual({ kind: "authenticated", token: "t" });
  });
  it("401 con mfa_authenticate pendiente → segundo factor de visitante", () => {
    expect(readStep(pending("mfa_authenticate"), "invalid_credentials")).toEqual({ kind: "second_factor", via: "mfa", token: "pending-token" });
  });
  it("401 con staff_otp pendiente → segundo factor del personal", () => {
    expect(readStep(pending("staff_otp"), "invalid_credentials")).toEqual({ kind: "second_factor", via: "staff", token: "pending-token" });
  });
  it("otro paso pendiente (verificar correo…) no está soportado", () => {
    expect(readStep(pending("verify_email"), "invalid_credentials")).toEqual({ kind: "unsupported_flow", flow: "verify_email" });
  });
  it("400 → el motivo que se le dio; 429, red y 410 tienen el suyo", () => {
    expect(readStep(fail(400), "invalid_code")).toEqual({ kind: "failed", reason: "invalid_code" });
    expect(readStep(fail(429), "invalid_code")).toEqual({ kind: "failed", reason: "too_many" });
    expect(readStep(fail(0), "invalid_code")).toEqual({ kind: "failed", reason: "network" });
    expect(readStep(fail(410), "invalid_code")).toEqual({ kind: "failed", reason: "expired" });
    expect(readStep(fail(500), "invalid_code")).toEqual({ kind: "failed", reason: "generic" });
  });
});

describe("llamadas de allauth", () => {
  function api(reply: unknown) {
    const post = jest.fn(async () => reply);
    const http = { allauthRaw: { post, delete: jest.fn(async () => ({ ok: true, status: 200, data: {} })) }, allauth: { get: jest.fn(), post: jest.fn() } } as unknown as Http;
    return { api: createAllauthApi(http), post };
  }
  it("el inicio de sesión declara el dispositivo y «Recordarme» solo si se pidió", async () => {
    const { api: a, post } = api({ ok: true, status: 200, data: { meta: { session_token: "t" } } });
    await a.login("a@b.co", "pw", true);
    expect(post).toHaveBeenLastCalledWith("/auth/login", { email: "a@b.co", password: "pw" }, { headers: { "X-Device-Platform": "android", "X-Device-Model": "Pixel 8", "X-App-Version": "0.1.0", "X-Remember-Me": "1" } });
    await a.login("a@b.co", "pw", false);
    const headers = (post.mock.calls.at(-1) as unknown as [string, unknown, { headers: Record<string, string> }])[2].headers;
    expect(headers["X-Remember-Me"]).toBeUndefined();
  });
  it("el código va a /auth/2fa/authenticate (visitante) o /auth/staff/otp (personal), con las cabeceras del dispositivo", async () => {
    const { api: a, post } = api({ ok: true, status: 200, data: {} });
    await a.submitCode("mfa", "123456", false);
    await a.submitCode("staff", "123456", true);
    expect(post.mock.calls.map((call) => (call as unknown as [string])[0])).toEqual(["/auth/2fa/authenticate", "/auth/staff/otp"]);
    expect((post.mock.calls[1] as unknown as [string, unknown, { headers: Record<string, string> }])[2].headers["X-Remember-Me"]).toBe("1");
  });
  it("la reautenticación distingue código mal escrito, demasiados intentos y red", async () => {
    expect(await api(fail(400)).api.reauthenticateWithPassword("x")).toBe("wrong");
    expect(await api(fail(429)).api.reauthenticateWithCode("x")).toBe("too_many");
    expect(await api(fail(0)).api.reauthenticateWithCode("x")).toBe("network");
    expect(await api({ ok: true, status: 200, data: {} }).api.reauthenticateWithPassword("x")).toBe("ok");
  });
});

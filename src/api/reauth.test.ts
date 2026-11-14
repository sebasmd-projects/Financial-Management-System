import { describe, expect, it, vi } from "vitest";
import type { ApiResult } from "../../core/api/client";
import { confirmReauthentication, needsReauthentication, withReauth } from "./reauth";

const fail403: ApiResult<unknown> = { ok: false, status: 403, code: "reauthentication_required", data: undefined };
const done: ApiResult<unknown> = { ok: true, status: 200, data: { ok: true } };

function fake(results: ApiResult<unknown>[]) {
  const post = vi.fn(async () => results.shift() ?? done);
  const nope = vi.fn();
  return { client: { get: nope, post, put: nope, patch: nope, delete: nope } as unknown as Parameters<typeof withReauth>[0], post };
}

describe("reautenticación en el navegador", () => {
  it("solo el 403 `reauthentication_required` la pide", () => {
    expect(needsReauthentication(fail403)).toBe(true);
    expect(needsReauthentication({ ok: false, status: 403, code: "mfa_required", data: undefined })).toBe(false);
    expect(needsReauthentication({ ok: false, status: 401, code: "reauthentication_required", data: undefined })).toBe(false);
    expect(needsReauthentication(done)).toBe(false);
  });
  it("si la persona confirma, repite la misma petición una vez, con la misma Idempotency-Key", async () => {
    const { client, post } = fake([fail403, done]);
    const ask = vi.fn(async () => true);
    const result = await withReauth(client, ask).post("/sync/connections", { a: 1 }, { idempotencyKey: "k-1" });
    expect(result.ok).toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1]).toEqual(post.mock.calls[0]);
  });
  it("si cancela, devuelve el 403 sin repetir nada", async () => {
    const { client, post } = fake([fail403]);
    const result = await withReauth(client, async () => false).post("/x");
    expect(result).toEqual(fail403);
    expect(post).toHaveBeenCalledTimes(1);
  });
  it("si lo repetido vuelve a pedirla, no entra en un bucle", async () => {
    const { client, post } = fake([fail403, fail403]);
    const ask = vi.fn(async () => true);
    const result = await withReauth(client, ask).post("/x");
    expect(result).toEqual(fail403);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(2);
  });
  it("un resultado bueno ni la pregunta", async () => {
    const { client } = fake([done]);
    const ask = vi.fn(async () => true);
    await withReauth(client, ask).post("/x");
    expect(ask).not.toHaveBeenCalled();
  });
});

describe("confirmar la contraseña o el código", () => {
  const reply = (status: number) => vi.fn(async () => new Response("{}", { status })) as unknown as typeof fetch;
  const deps = (fetch: typeof globalThis.fetch) => ({ fetch, readCookie: (name: string) => (name === "csrftoken" ? "tok" : null) });
  it("contraseña: POST al mismo origen con CSRF y sin guardar nada", async () => {
    const fetch = reply(200);
    expect(await confirmReauthentication("password", "secreto", deps(fetch))).toBe("ok");
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/_allauth/browser/v1/auth/reauthenticate");
    expect(init.credentials).toBe("same-origin");
    expect((init.headers as Record<string, string>)["X-CSRFToken"]).toBe("tok");
    expect(JSON.parse(String(init.body))).toEqual({ password: "secreto" });
  });
  it("código: va por la ruta del segundo factor", async () => {
    const fetch = reply(200);
    await confirmReauthentication("code", "123456", deps(fetch));
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/_allauth/browser/v1/auth/2fa/reauthenticate");
    expect(JSON.parse(String(init.body))).toEqual({ code: "123456" });
  });
  it.each([
    [400, "wrong"],
    [429, "too_many"],
    [500, "error"],
  ] as const)("%i → %s", async (status, outcome) => {
    expect(await confirmReauthentication("password", "x", deps(reply(status)))).toBe(outcome);
  });
  it("sin red → network; sin token CSRF → error", async () => {
    expect(await confirmReauthentication("password", "x", deps((async () => Promise.reject(new Error("off"))) as unknown as typeof fetch))).toBe("network");
    expect(await confirmReauthentication("password", "x", { fetch: reply(500), readCookie: () => null })).toBe("error");
  });
});

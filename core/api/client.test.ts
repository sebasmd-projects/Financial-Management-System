import { describe, expect, it, vi } from "vitest";
import { createCoreClient, type CoreClientDeps } from "./client";

type Reply = { status: number; json?: unknown };

function setup(replies: Record<string, Reply>, extra: Partial<CoreClientDeps> = {}) {
  const calls: { method: string; url: string; headers: Headers; body: unknown; credentials?: RequestCredentials; cache?: RequestCache }[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ method, url: String(input), headers: new Headers(init.headers), body: typeof init.body === "string" ? JSON.parse(init.body) : init.body, credentials: init.credentials, cache: init.cache });
    const reply = replies[`${method} ${String(input)}`] ?? { status: 404, json: { code: "not_mocked" } };
    return new Response(reply.status === 204 ? null : JSON.stringify(reply.json ?? {}), { status: reply.status, headers: { "Content-Type": "application/json" } });
  };
  const onUnauthorized = vi.fn();
  const client = createCoreClient({ fetch: fetchImpl as typeof fetch, baseUrl: "https://example.test/api/fms/v1", credentials: "omit", onUnauthorized, ...extra });
  return { client, calls, onUnauthorized };
}

describe("cliente del núcleo", () => {
  it("usa la base y las credenciales que la plataforma inyecta, sin caché", async () => {
    const { client, calls } = setup({ "GET https://example.test/api/fms/v1/health": { status: 200, json: { ok: true } } });
    expect(await client.get("/health")).toEqual({ ok: true, status: 200, data: { ok: true } });
    expect(calls[0].credentials).toBe("omit");
    expect(calls[0].cache).toBe("no-store");
  });

  it("las cabeceras de `prepare` y las de la petición viajan; Idempotency-Key solo en métodos no seguros", async () => {
    const { client, calls } = setup(
      { "POST https://example.test/api/fms/v1/x": { status: 201, json: { id: 1 } }, "GET https://example.test/api/fms/v1/x": { status: 200, json: {} } },
      { prepare: () => ({ headers: { "X-Session-Token": "tok" } }) },
    );
    await client.post("/x", { a: 1 }, { idempotencyKey: "k-1", headers: { "X-Device-Platform": "android" } });
    await client.get("/x", { idempotencyKey: "k-2" });
    expect(calls[0].headers.get("X-Session-Token")).toBe("tok");
    expect(calls[0].headers.get("X-Device-Platform")).toBe("android");
    expect(calls[0].headers.get("Idempotency-Key")).toBe("k-1");
    expect(calls[0].headers.get("Content-Type")).toBe("application/json");
    expect(calls[1].headers.has("Idempotency-Key")).toBe(false);
  });

  it("si `prepare` falla no se envía nada", async () => {
    const { client, calls } = setup({}, { prepare: () => ({ fail: "no_token" }) });
    expect(await client.get("/x")).toMatchObject({ ok: false, status: 0, code: "no_token" });
    expect(calls).toHaveLength(0);
  });

  it("401: avisa con el código del cuerpo, salvo `redirectOn401: false`", async () => {
    const { client, onUnauthorized } = setup({ "GET https://example.test/api/fms/v1/me": { status: 401, json: { code: "device_expired" } } });
    expect(await client.get("/me")).toMatchObject({ ok: false, status: 401, code: "device_expired" });
    expect(onUnauthorized).toHaveBeenCalledWith("device_expired", 401);
    onUnauthorized.mockClear();
    await client.get("/me", { redirectOn401: false });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("sin red no se reintenta y se dice `network`", async () => {
    const client = createCoreClient({ fetch: (async () => Promise.reject(new TypeError("x"))) as unknown as typeof fetch, baseUrl: "", credentials: "omit", onUnauthorized: () => undefined });
    expect(await client.post("/x", {})).toMatchObject({ ok: false, status: 0, code: "network" });
  });

  it("el ámbito reescribe la ruta salvo `unscoped`", async () => {
    const { client, calls } = setup({}, { rewritePath: (p) => `/households/h1${p}` });
    await client.get("/accounts");
    await client.get("/accounts", { unscoped: true });
    expect(calls.map((c) => c.url)).toEqual(["https://example.test/api/fms/v1/households/h1/accounts", "https://example.test/api/fms/v1/accounts"]);
  });
});

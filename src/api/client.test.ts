import { describe, expect, it, vi } from "vitest";
import { mockFetch } from "@/test/mock-fetch";
import { createApiClient, newIdempotencyKey } from "./client";
import { localeFromPath, loginRedirectUrl, safeInternalPath, safeNext, signupUrl } from "./login";

function setup(routes: Parameters<typeof mockFetch>[0], cookies: Record<string, string> = {}) {
  const mock = mockFetch(routes);
  const onUnauthorized = vi.fn();
  const client = createApiClient({ fetch: mock.fetch, readCookie: (name) => cookies[name] ?? null, onUnauthorized });
  return { ...mock, client, onUnauthorized };
}

describe("cliente de la API", () => {
  it("GET: mismo origen, cookie de sesión, sin caché y sin CSRF", async () => {
    const { client, calls } = setup({ "GET /api/fms/v1/health": { status: 200, json: { ok: true } } });
    const result = await client.get("/health");
    expect(result).toEqual({ ok: true, status: 200, data: { ok: true } });
    expect(calls).toHaveLength(1);
    expect(calls[0].credentials).toBe("same-origin");
    expect(calls[0].cache).toBe("no-store");
    expect(calls[0].headers.has("X-CSRFToken")).toBe(false);
  });

  it("POST: X-CSRFToken de la cookie legible (desarrollo) y cuerpo JSON", async () => {
    const { client, calls } = setup({ "POST /api/fms/v1/activation": { status: 200, json: {} } }, { csrftoken: "tok-cookie" });
    await client.post("/activation", { accept_version: "2026-11-10" });
    expect(calls).toHaveLength(1); // no hubo que pedir el token
    expect(calls[0].headers.get("X-CSRFToken")).toBe("tok-cookie");
    expect(calls[0].headers.get("Content-Type")).toBe("application/json");
    expect(calls[0].body).toEqual({ accept_version: "2026-11-10" });
  });

  it("POST: con la cookie HttpOnly de producción pide el token a /_allauth/cv/v1/csrf, sin guardarlo", async () => {
    const { client, calls } = setup({
      "GET /_allauth/cv/v1/csrf": { status: 200, json: { csrfToken: "tok-red" } },
      "POST /api/fms/v1/activation": { status: 200, json: {} },
    });
    await client.post("/activation", { accept_version: "v1" });
    await client.post("/activation", { accept_version: "v1" });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET /_allauth/cv/v1/csrf",
      "POST /api/fms/v1/activation",
      "GET /_allauth/cv/v1/csrf",
      "POST /api/fms/v1/activation",
    ]);
    expect(calls[1].headers.get("X-CSRFToken")).toBe("tok-red");
  });

  it("sin token CSRF no se envía el POST", async () => {
    const { client, calls } = setup({ "GET /_allauth/cv/v1/csrf": { status: 500 } });
    const result = await client.post("/activation", { accept_version: "v1" });
    expect(result).toMatchObject({ ok: false, code: "csrf", status: 0 });
    expect(calls.map((c) => c.method)).toEqual(["GET"]);
  });

  it("Idempotency-Key viaja solo en los métodos no seguros", async () => {
    const key = newIdempotencyKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newIdempotencyKey()).not.toBe(key);
    const { client, calls } = setup({ "POST /api/fms/v1/movements": { status: 201, json: { id: 1 } } }, { csrftoken: "t" });
    await client.post("/movements", { x: 1 }, { idempotencyKey: key });
    expect(calls[0].headers.get("Idempotency-Key")).toBe(key);
  });

  it("un FormData (el extracto) viaja tal cual: sin Content-Type propio, con CSRF e Idempotency-Key", async () => {
    const { client, calls } = setup({ "POST /api/fms/v1/imports": { status: 201, json: {} } }, { csrftoken: "tok" });
    const form = new FormData();
    form.set("account_id", "a-1");
    await client.post("/imports", form, { idempotencyKey: "k-1" });
    expect(calls[0].body).toBe(form);
    expect(calls[0].headers.has("Content-Type")).toBe(false);
    expect(calls[0].headers.get("X-CSRFToken")).toBe("tok");
    expect(calls[0].headers.get("Idempotency-Key")).toBe("k-1");
  });

  it("NO reintenta un POST fallido: ni por red, ni por 5xx, ni por 403", async () => {
    for (const reply of [{ status: 500 }, { status: 403, json: { code: "csrf" } }, { status: 502 }]) {
      const { client, calls } = setup({ "POST /api/fms/v1/movements": reply }, { csrftoken: "t" });
      const result = await client.post("/movements", { x: 1 });
      expect(result.ok).toBe(false);
      expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    }
    const failing = vi.fn().mockRejectedValue(new TypeError("network"));
    const client = createApiClient({ fetch: failing, readCookie: () => "t", onUnauthorized: vi.fn() });
    expect(await client.post("/movements", {})).toMatchObject({ ok: false, status: 0, code: "network" });
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it("errores: el `code` del cuerpo, o http_<estado>", async () => {
    const { client } = setup(
      {
        "POST /api/fms/v1/activation": { status: 403, json: { code: "mfa_required", detail: "no mostrar" } },
        "GET /api/fms/v1/boom": { status: 500, body: "<html>" },
      },
      { csrftoken: "t" },
    );
    expect(await client.post("/activation", {})).toMatchObject({ ok: false, status: 403, code: "mfa_required" });
    expect(await client.get("/boom")).toMatchObject({ ok: false, status: 500, code: "http_500" });
  });

  it("401 → onUnauthorized; redirectOn401: false lo calla", async () => {
    const loud = setup({ "GET /api/fms/v1/me": { status: 401, json: { login_url: "/es/account/login" } } });
    expect(await loud.client.get("/me")).toMatchObject({ ok: false, status: 401, code: "http_401" });
    expect(loud.onUnauthorized).toHaveBeenCalledTimes(1);

    const quiet = setup({ "GET /api/fms/v1/me": { status: 401 } });
    await quiet.client.get("/me", { redirectOn401: false });
    expect(quiet.onUnauthorized).not.toHaveBeenCalled();
  });

  it("una respuesta 200 que no es JSON es un error, no datos", async () => {
    const { client } = setup({ "GET /api/fms/v1/me": { status: 200, body: "<html>" } });
    expect(await client.get("/me")).toMatchObject({ ok: false, code: "invalid_response" });
  });

  it("204 sin cuerpo es éxito", async () => {
    const { client } = setup({ "DELETE /api/fms/v1/x": { status: 204 } }, { csrftoken: "t" });
    expect(await client.delete("/x")).toEqual({ ok: true, status: 204, data: undefined });
  });
});

describe("redirección al inicio de sesión del CV", () => {
  it("/<idioma>/account/login?next=<página actual de la app>", () => {
    expect(loginRedirectUrl("es", "/es/finanzas/pagos/fijos")).toBe("/es/account/login?next=%2Fes%2Ffinanzas%2Fpagos%2Ffijos");
    expect(loginRedirectUrl("en", "/en/finance/payments/fixed")).toBe("/en/account/login?next=%2Fen%2Ffinance%2Fpayments%2Ffixed");
    expect(loginRedirectUrl("en", "/en/finance")).toBe("/en/account/login?next=%2Fen%2Ffinance");
    expect(signupUrl("es", "/es/finanzas")).toBe("/es/account/signup?next=%2Fes%2Ffinanzas");
  });
  it("solo la ruta: sin consulta ni fragmento", () => {
    expect(safeNext("es", "/es/finanzas/movimientos/egresos?x=1#y")).toBe("/es/finanzas/movimientos/egresos");
  });
  it("el destino siempre es de la app en ese idioma; si no, su raíz", () => {
    for (const evil of ["https://evil.example/x", "//evil.example", "/es/otro-sitio", "/en/finance/x", "/es/finanzasx", "/es/finanzas/../../x\y", "javascript:alert(1)", ""]) {
      expect(safeNext("es", evil), evil).toBe("/es/finanzas");
    }
    expect(safeNext("en", "/es/finanzas/pagos")).toBe("/en/finance");
  });
  it("el idioma sale de la URL; sin idioma, español", () => {
    expect(localeFromPath("/en/finance/payments")).toBe("en");
    expect(localeFromPath("/es/finanzas")).toBe("es");
    expect(localeFromPath("/zz/x")).toBe("es");
    expect(localeFromPath("/")).toBe("es");
  });
  it("safeInternalPath rechaza lo que no es una ruta interna", () => {
    expect(safeInternalPath("/es/account/2fa", "/x")).toBe("/es/account/2fa");
    for (const evil of ["https://evil.example/login", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/ok\nSet-Cookie: x=1", "", 7, null]) {
      expect(safeInternalPath(evil, "/fallback"), String(evil)).toBe("/fallback");
    }
  });
});

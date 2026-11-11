import { describe, expect, it } from "vitest";
import { mockFetch } from "@/test/mock-fetch";
import { createApiClient } from "./client";
import { createIntentKeys } from "./idempotency";

function counter() {
  let n = 0;
  return () => `key-${++n}-padding`;
}

describe("clave de idempotencia por intención", () => {
  it("la misma intención reintentada reutiliza la clave; al tener éxito, la siguiente es nueva", () => {
    const keys = createIntentKeys(counter());
    const first = keys.keyFor("A");
    expect(keys.keyFor("A")).toBe(first);
    expect(keys.keyFor("A")).toBe(first);
    keys.done();
    expect(keys.keyFor("A")).not.toBe(first);
  });
  it("si cambia lo que se envía es otra intención y la clave cambia", () => {
    const keys = createIntentKeys(counter());
    const first = keys.keyFor('{"amount":"1"}');
    expect(keys.keyFor('{"amount":"2"}')).not.toBe(first);
  });
  it("de punta a punta: un POST que falla por red se reintenta con LA MISMA Idempotency-Key, y el siguiente alta lleva otra", async () => {
    let attempt = 0;
    const mock = mockFetch({
      "POST /api/fms/v1/movements": () => (++attempt === 1 ? { status: 503, json: { code: "unavailable" } } : { status: 201, json: { id: "m1" } }),
    });
    const client = createApiClient({ fetch: mock.fetch, readCookie: (name) => (name === "csrftoken" ? "tok" : null), onUnauthorized: () => undefined });
    const keys = createIntentKeys(counter());
    const body = { type: "expense", amount: "180000", date: "2026-11-10", account_id: "a" };
    const fingerprint = JSON.stringify(body);

    const failed = await client.post("/movements", body, { idempotencyKey: keys.keyFor(fingerprint) });
    expect(failed.ok).toBe(false);
    const retried = await client.post("/movements", body, { idempotencyKey: keys.keyFor(fingerprint) });
    expect(retried.ok).toBe(true);
    keys.done();
    await client.post("/movements", body, { idempotencyKey: keys.keyFor(fingerprint) });

    const sent = mock.calls.filter((c) => c.method === "POST").map((c) => c.headers.get("Idempotency-Key"));
    expect(sent).toHaveLength(3);
    expect(sent[0]).toBe(sent[1]);
    expect(sent[2]).not.toBe(sent[0]);
    expect(sent.every((key) => key && key.length >= 8)).toBe(true);
  });
});

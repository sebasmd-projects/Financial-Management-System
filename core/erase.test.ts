import { describe, expect, it } from "vitest";
import type { ApiResult, RequestOptions } from "./api/client";
import { canErase, countRows, eraseApi, erasePaths, eraseBody, hasAnything, householdGroups, isCoolingDown, normalizePhrase, phraseFor, phraseMatches, sharedAccountsLeft, type EraseClient, type ErasePreview } from "./erase";

const PREVIEW: ErasePreview = {
  counts: { accounts: 3, movements: 120, cards: 0, loans: 1, debts: 0, rules: 2, connections: 1 },
  in_trash: 4,
  households: [
    { id: "h1", name: "Casa", role: "editor", action: "leave", accounts: 2 },
    { id: "h2", name: "Sola", role: "owner", action: "delete", accounts: 1 },
  ],
  households_affected: 2,
  blocked: false,
  export_recommended: true,
  phrases: { es: "BORRAR MIS FINANZAS", en: "DELETE MY FINANCES" },
};

describe("la frase", () => {
  it("ignora mayúsculas y espacios de más, pero no acepta otra cosa", () => {
    expect(normalizePhrase("  borrar   mis finanzas ")).toBe("BORRAR MIS FINANZAS");
    expect(phraseMatches("borrar mis finanzas", "BORRAR MIS FINANZAS")).toBe(true);
    expect(phraseMatches("borrar mis finanza", "BORRAR MIS FINANZAS")).toBe(false);
    expect(phraseMatches("", "BORRAR MIS FINANZAS")).toBe(false);
  });
  it("la del servidor manda y hay respaldo mientras carga", () => {
    expect(phraseFor("en", PREVIEW)).toBe("DELETE MY FINANCES");
    expect(phraseFor("es", null)).toBe("BORRAR MIS FINANZAS");
  });
});

describe("lo que se borra", () => {
  it("lista solo los tipos con algo, en orden estable", () => {
    expect(countRows(PREVIEW)).toEqual([
      { key: "accounts", count: 3 },
      { key: "movements", count: 120 },
      { key: "loans", count: 1 },
      { key: "rules", count: 2 },
      { key: "connections", count: 1 },
    ]);
  });
  it("una cuenta vacía no tiene nada que borrar", () => {
    const empty = { ...PREVIEW, counts: { accounts: 0, movements: 0, cards: 0, loans: 0, debts: 0, rules: 0, connections: 0 }, in_trash: 0, households: [], households_affected: 0 };
    expect(hasAnything(empty)).toBe(false);
    expect(hasAnything({ ...empty, in_trash: 1 })).toBe(true);
  });
  it("agrupa los hogares y cuenta las cuentas compartidas que se quedan", () => {
    const groups = householdGroups(PREVIEW);
    expect(groups.leave.map((h) => h.id)).toEqual(["h1"]);
    expect(groups.delete.map((h) => h.id)).toEqual(["h2"]);
    expect(groups.blocked).toEqual([]);
    expect(sharedAccountsLeft(PREVIEW)).toBe(2);
  });
});

describe("cuándo se puede borrar", () => {
  it("necesita la vista previa, la frase y que ningún hogar lo impida", () => {
    expect(canErase(null, "BORRAR MIS FINANZAS", "es")).toBe(false);
    expect(canErase(PREVIEW, "borrar", "es")).toBe(false);
    expect(canErase(PREVIEW, "borrar mis finanzas", "es")).toBe(true);
    expect(canErase(PREVIEW, "DELETE MY FINANCES", "es")).toBe(false);
    expect(canErase({ ...PREVIEW, blocked: true }, "BORRAR MIS FINANZAS", "es")).toBe(false);
  });
  it("reconoce la espera de la activación", () => {
    expect(isCoolingDown("erase_cooling_down")).toBe(true);
    expect(isCoolingDown("mfa_required")).toBe(false);
  });
});

describe("el cliente", () => {
  it("pide fuera del ámbito del hogar y manda la frase con la Idempotency-Key", async () => {
    const calls: { method: string; path: string; body?: unknown; options?: RequestOptions }[] = [];
    const client: EraseClient = {
      get: <T,>(path: string, options?: RequestOptions) => {
        calls.push({ method: "GET", path, options });
        return Promise.resolve({ ok: true, status: 200, data: PREVIEW } as unknown as ApiResult<T>);
      },
      post: <T,>(path: string, body?: unknown, options?: RequestOptions) => {
        calls.push({ method: "POST", path, body, options });
        return Promise.resolve({ ok: true, status: 200, data: { erased: true } } as unknown as ApiResult<T>);
      },
    };
    const api = eraseApi(client);
    await api.preview();
    await api.erase("  borrar mis finanzas ", "key-0001");
    expect(calls[0]).toMatchObject({ method: "GET", path: erasePaths.preview, options: { unscoped: true } });
    expect(calls[1]).toMatchObject({ method: "POST", path: erasePaths.erase, body: { confirm: "borrar mis finanzas" }, options: { idempotencyKey: "key-0001", unscoped: true } });
    expect(eraseBody(" x ")).toEqual({ confirm: "x" });
  });
});

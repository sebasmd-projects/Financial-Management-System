import { describe, expect, it } from "vitest";
import { drillHref, drillRoute, readDrill, sanitizeDrill } from "./drill";

const href = (id: string) => `/es/finanzas/${id}`;

describe("filtro «Ver movimientos»", () => {
  it("conserva ids, fechas y clasificaciones y descarta lo demás", () => {
    expect(sanitizeDrill({ type: "expense", from: "2026-11-01", to: "2026-11-30", category: "3f2a-uuid", amount: "5000", min_amount: "1", classification: "none", tag: "a b" })).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
      category: "3f2a-uuid",
      classification: "none",
    });
  });
  it("la contraparte de un gasto hormiga viaja, pero su monto máximo no", () => {
    expect(sanitizeDrill({ counterparty: "p-1", max_amount: "20000", classification: "discretionary" })).toEqual({ counterparty: "p-1", classification: "discretionary" });
  });
  it("una fecha que no existe no pasa", () => {
    expect(sanitizeDrill({ from: "2026-02-30" })).toEqual({});
  });
  it("el tipo elige la pantalla; la URL no lleva montos", () => {
    expect(drillRoute({ type: "expense" })).toBe("movimientos-egresos");
    expect(drillRoute({ type: "income" })).toBe("movimientos-ingresos");
    expect(drillRoute({})).toBe("movimientos");
    const url = drillHref(href, { type: "expense", from: "2026-11-01", to: "2026-11-30", category: "c1", amount: "99" });
    expect(url).toBe("/es/finanzas/movimientos-egresos?from=2026-11-01&to=2026-11-30&category=c1");
    expect(url).not.toMatch(/amount/);
  });
  it("sin filtro válido es la pantalla sola, y se lee de los parámetros de búsqueda", () => {
    expect(drillHref(href, null)).toBe("/es/finanzas/movimientos");
    const params = new URLSearchParams("account=a1&ledger_account=<x>&status=confirmado");
    expect(readDrill((k) => params.get(k))).toEqual({ account: "a1", status: "confirmado" });
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { clearDrill, drillRoute, peekDrill, sanitizeDrill, stageDrill } from "./drill";

afterEach(clearDrill);

describe("filtro «Ver movimientos» (en memoria, nunca en la URL)", () => {
  it("conserva ids, fechas, clasificaciones y montos del filtro, y descarta lo demás", () => {
    expect(sanitizeDrill({ type: "expense", from: "2026-11-01", to: "2026-11-30", category: "3f2a-uuid", min_amount: "x", max_amount: "20000", classification: "none", tag: "a b", price: "1" })).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
      category: "3f2a-uuid",
      classification: "none",
      max_amount: "20000",
    });
  });
  it("la contraparte y el monto máximo de un gasto hormiga viajan en el filtro (ya no hay URL)", () => {
    expect(sanitizeDrill({ counterparty: "p-1", max_amount: "20000.50" })).toEqual({ counterparty: "p-1", max_amount: "20000.50" });
  });
  it("una fecha que no existe no pasa", () => {
    expect(sanitizeDrill({ from: "2026-02-30" })).toEqual({});
  });
  it("el tipo elige la pantalla", () => {
    expect(drillRoute({ type: "expense" })).toBe("movimientos-egresos");
    expect(drillRoute({ type: "income" })).toBe("movimientos-ingresos");
    expect(drillRoute({})).toBe("movimientos");
  });
  it("se deja en memoria y se limpia", () => {
    stageDrill({ category: "c1", type: "expense" });
    expect(peekDrill()).toEqual({ category: "c1" });
    clearDrill();
    expect(peekDrill()).toEqual({});
  });
});

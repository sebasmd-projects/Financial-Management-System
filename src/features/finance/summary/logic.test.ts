import { describe, expect, it } from "vitest";
import { alertTarget, barSegments, clampIndex, isFirstUse, railTarget } from "./logic";

describe("a dónde lleva cada elemento del Resumen", () => {
  it("una tarjeta va a su pantalla y una cuota de préstamo a la lista de créditos", () => {
    expect(railTarget({ ref_kind: "card", ref_id: "c1" })).toEqual({ route: "tarjeta", params: ["c1"] });
    expect(railTarget({ ref_kind: "loan_installment", ref_id: "i1" })).toEqual({ route: "creditos", params: [] });
  });
  it("las alertas: ocurrencia → pagar, tarjeta → tarjeta, sin objeto → calendario", () => {
    expect(alertTarget({ kind: "overdue", ref_kind: "occurrence", ref_id: "o1" })).toEqual({ route: "pagos-fijo-pagar", params: ["o1"] });
    expect(alertTarget({ kind: "due_today", ref_kind: "card", ref_id: "c1" })).toEqual({ route: "tarjeta", params: ["c1"] });
    expect(alertTarget({ kind: "insufficient_funds", ref_kind: "", ref_id: null })).toEqual({ route: "pagos-calendario", params: [] });
  });
});

describe("la barra de tres tramos", () => {
  it("porcentajes enteros de lo que suman (ejemplo del diseño: 2.310.000 gastado, 1.050.000 comprometido)", () => {
    expect(barSegments({ spent: "2310000", committed: "1050000", free: "1840000" })).toEqual({ spent: 44, committed: 20, free: 35 });
  });
  it("sin nada o con partes negativas, no se inventa ancho", () => {
    expect(barSegments({ spent: "0", committed: "0", free: "0" })).toEqual({ spent: 0, committed: 0, free: 0 });
    expect(barSegments({ spent: "100", committed: "0", free: "-50" })).toEqual({ spent: 100, committed: 0, free: 0 });
  });
});

it("clampIndex y primer uso", () => {
  expect(clampIndex(5, 3)).toBe(2);
  expect(clampIndex(-1, 3)).toBe(0);
  expect(clampIndex(1, 0)).toBe(0);
  const empty = { fixed_expenses: { total_count: 0 }, rail: [], kpi: { income: "0", spent: "0" } } as never;
  expect(isFirstUse(empty)).toBe(true);
});

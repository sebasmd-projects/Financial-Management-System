import { describe, expect, it } from "vitest";
import { datesProblem, entryChanges, filterParams, filtersActive, EMPTY_FILTERS, valueText } from "./logic";

describe("filtros de la auditoría", () => {
  it("solo viajan los que tienen valor, y nunca un monto", () => {
    expect(filterParams({ ...EMPTY_FILTERS, action: "change", by: "admin", field: " amount ", from: "2026-11-01" }, {}, 2)).toEqual({ object: undefined, object_id: undefined, action: "change", by: "admin", field: "amount", from: "2026-11-01", to: undefined, page: 2 });
    expect(Object.keys(filterParams(EMPTY_FILTERS)).filter((k) => /amount|value|total|balance/i.test(k))).toEqual([]);
  });
  it("el objeto fijo (historial de un movimiento) manda sobre el filtro", () => {
    const p = filterParams({ ...EMPTY_FILTERS, object: "finance_credit.loan" }, { object: "finance_moves.movement", object_id: "m-1" });
    expect(p.object).toBe("finance_moves.movement");
    expect(p.object_id).toBe("m-1");
  });
  it("filtros activos y fechas al revés", () => {
    expect(filtersActive(EMPTY_FILTERS)).toBe(false);
    expect(filtersActive({ ...EMPTY_FILTERS, by: "me" })).toBe(true);
    expect(datesProblem({ from: "2026-11-10", to: "2026-11-01" })).toBe(true);
    expect(datesProblem({ from: "2026-11-01", to: "" })).toBe(false);
  });
});

describe("antes y después", () => {
  it("usa los cambios campo por campo del servidor, con null si no existía", () => {
    const changes = entryChanges({ changes: [{ field: "amount", before: "180000.00", after: "190000.00" }, { field: "notes", before: null, after: "Ajuste" }], changed_fields: ["amount", "notes"], before: {}, after: {} });
    expect(changes).toEqual([{ field: "amount", before: "180000.00", after: "190000.00" }, { field: "notes", before: null, after: "Ajuste" }]);
  });
  it("si faltan, los reconstruye de before/after y changed_fields", () => {
    expect(entryChanges({ changes: [], changed_fields: ["name"], before: { name: "A", x: "1" }, after: { name: "B" } })).toEqual([{ field: "name", before: "A", after: "B" }]);
    expect(entryChanges({ changes: [], changed_fields: [], before: null, after: { name: "B" } })).toEqual([{ field: "name", before: null, after: "B" }]);
    expect(entryChanges({ changes: [], changed_fields: [], before: null, after: null })).toEqual([]);
  });
  it("texto de un valor", () => {
    expect(valueText(null, "—")).toBe("—");
    expect(valueText("", "—")).toBe("—");
    expect(valueText("x", "—")).toBe("x");
    expect(valueText(3, "—")).toBe("3");
    expect(valueText(false, "—")).toBe("false");
    expect(valueText(["a", "b"], "—")).toBe("a, b");
    expect(valueText({ a: 1 }, "—")).toBe('{"a":1}');
  });
});

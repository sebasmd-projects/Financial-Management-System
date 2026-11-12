import { groupByDay, hasFilters, NO_FILTERS, searchBody, signedAmount, type Movement } from "./logic";

const m = (over: Partial<Movement>): Movement => ({ id: "1", type: "expense", status: "confirmado", voided: false, date: "2026-11-10", amount: "180000.00", ...over }) as Movement;

describe("filtros del historial", () => {
  it("sin filtros, solo la paginación", () => {
    expect(searchBody(NO_FILTERS, 1)).toEqual({ page: 1, page_size: 30 });
    expect(hasFilters(NO_FILTERS)).toBe(false);
  });
  it("los montos van en el CUERPO (cadenas decimales), no en una URL", () => {
    const body = searchBody({ ...NO_FILTERS, type: "expense", status: "pendiente", period: "2026-02", accountId: "a1", minAmount: "50000", maxAmount: "180000.5" }, 2, 10);
    expect(body).toEqual({ type: "expense", status: "pendiente", account: "a1", from: "2026-02-01", to: "2026-02-28", min_amount: "50000", max_amount: "180000.5", page: 2, page_size: 10 });
    expect(hasFilters({ ...NO_FILTERS, minAmount: "1" })).toBe(true);
  });
  it("«Anulado» pide mostrar los anulados", () => {
    expect(searchBody({ ...NO_FILTERS, status: "anulado" }, 1)).toMatchObject({ status: "anulado", show_annulled: true });
  });
  it("signo: egreso negativo, ingreso positivo", () => {
    expect(signedAmount(m({ type: "expense" }))).toEqual({ value: "-180000.00", sign: "auto" });
    expect(signedAmount(m({ type: "income", amount: "5200000" }))).toEqual({ value: "5200000", sign: "always" });
  });
  it("agrupa por día con el neto exacto (sin pendientes ni anulados)", () => {
    const groups = groupByDay([m({ id: "a", amount: "0.10" }), m({ id: "b", type: "income", amount: "0.30" }), m({ id: "c", status: "pendiente", amount: "999" }), m({ id: "d", date: "2026-11-09", amount: "5" })]);
    expect(groups.map((g) => [g.date, g.net, g.items.length])).toEqual([["2026-11-10", "0.20", 3], ["2026-11-09", "-5.00", 1]]);
  });
});

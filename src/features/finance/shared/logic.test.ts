import { describe, expect, it } from "vitest";
import { balanceSides, previewSplit, purchaseBody, settleAmount } from "./logic";

const P = (counterpartyId: string, value = "") => ({ counterpartyId, value });

describe("reparto de una compra compartida (mismas reglas que el servidor)", () => {
  it("partes iguales: 100.000 entre tres = 33.333,33 a cada persona y el resto es de quien pagó", () => {
    // Quien pagó + 2 personas = 3 partes: lo de los demás va hacia abajo al centavo y lo que sobra es de quien pagó.
    const result = previewSplit("100.000", "equal", [P("a"), P("b")]);
    expect(result).toEqual({ ok: true, split: { mine: "33333.34", shares: ["33333.33", "33333.33"] } });
  });
  it("con una persona se parte por la mitad", () => {
    expect(previewSplit("170.000", "equal", [P("laura")])).toEqual({ ok: true, split: { mine: "85000.00", shares: ["85000.00"] } });
  });
  it("por porcentaje: cada persona su parte, hacia abajo, y el resto es mío", () => {
    expect(previewSplit("100.000", "percent", [P("a", "25"), P("b", "33,5")])).toEqual({ ok: true, split: { mine: "41500.00", shares: ["25000.00", "33500.00"] } });
    expect(previewSplit("100", "percent", [P("a", "33,3333")])).toEqual({ ok: true, split: { mine: "66.67", shares: ["33.33"] } });
  });
  it("por porcentaje: suman como mucho 100 y ninguno es 0 ni pasa de 100", () => {
    expect(previewSplit("100.000", "percent", [P("a", "60"), P("b", "50")])).toEqual({ ok: false, problem: "percentages" });
    expect(previewSplit("100.000", "percent", [P("a", "0")])).toEqual({ ok: false, problem: "value" });
    expect(previewSplit("100.000", "percent", [P("a", "101")])).toEqual({ ok: false, problem: "value" });
    expect(previewSplit("100.000", "percent", [P("a", "100")])).toEqual({ ok: true, split: { mine: "0.00", shares: ["100000.00"] } });
  });
  it("por monto: la suma no pasa del total y el resto es mío; un monto no se redondea", () => {
    expect(previewSplit("200.000", "amount", [P("a", "85.000"), P("b", "40.000,50")])).toEqual({ ok: true, split: { mine: "74999.50", shares: ["85000.00", "40000.50"] } });
    expect(previewSplit("200.000", "amount", [P("a", "150.000"), P("b", "60.000")])).toEqual({ ok: false, problem: "exceeds" });
    expect(previewSplit("200.000", "amount", [P("a", "1,2345")])).toEqual({ ok: false, problem: "value" });
  });
  it("mía + Σ partes == total siempre, aunque el total tenga centavos", () => {
    const r = previewSplit("0,10", "equal", [P("a"), P("b"), P("c")]);
    expect(r).toEqual({ ok: true, split: { mine: "0.04", shares: ["0.02", "0.02", "0.02"] } });
    const tiny = previewSplit("0,01", "equal", [P("a"), P("b")]);
    expect(tiny).toEqual({ ok: false, problem: "tooSmall" });
  });
  it("problemas de la lista de personas", () => {
    expect(previewSplit("100", "equal", [])).toEqual({ ok: false, problem: "people" });
    expect(previewSplit("100", "equal", Array.from({ length: 21 }, (_, i) => P(String(i))))).toEqual({ ok: false, problem: "people" });
    expect(previewSplit("100", "equal", [P("a"), P("a")])).toEqual({ ok: false, problem: "duplicate" });
    expect(previewSplit("100", "equal", [P("")])).toEqual({ ok: false, problem: "duplicate" });
    expect(previewSplit("0", "equal", [P("a")])).toEqual({ ok: false, problem: "total" });
    expect(previewSplit("", "equal", [P("a")])).toEqual({ ok: false, problem: "total" });
  });
});

describe("cuerpo de la compra compartida", () => {
  const base = { accountId: "acc-1", categoryId: "", total: "170.000", date: "2026-11-11", description: "", people: [P("laura", "")] };
  it("partes iguales no manda valores; la cuenta puede ser una tarjeta", () => {
    expect(purchaseBody({ ...base, mode: "equal" })).toEqual({ ok: true, body: { account_id: "acc-1", amount: "170000", date: "2026-11-11", mode: "equal", people: [{ counterparty_id: "laura" }] } });
  });
  it("porcentaje en puntos y monto con 2 decimales; categoría y descripción si hay", () => {
    expect(purchaseBody({ ...base, mode: "percent", categoryId: "cat-1", description: " Cena ", people: [P("laura", "33,50")] })).toEqual({
      ok: true,
      body: { account_id: "acc-1", amount: "170000", date: "2026-11-11", mode: "percent", people: [{ counterparty_id: "laura", value: "33.5" }], category_id: "cat-1", description: "Cena" },
    });
    expect(purchaseBody({ ...base, mode: "amount", people: [P("laura", "85.000")] })).toMatchObject({ ok: true, body: { people: [{ counterparty_id: "laura", value: "85000" }] } });
  });
  it("sin cuenta o con un reparto inválido no hay cuerpo", () => {
    expect(purchaseBody({ ...base, mode: "equal", accountId: "" })).toEqual({ ok: false, problem: "account" });
    expect(purchaseBody({ ...base, mode: "percent", people: [P("laura", "120")] })).toEqual({ ok: false, problem: "value" });
    expect(purchaseBody({ ...base, mode: "equal", date: "" })).toEqual({ ok: false, problem: "date" });
  });
});

describe("saldos y abonos", () => {
  it("una persona puede deberme y yo deberle a la vez", () => {
    expect(balanceSides({ owed_to_me: "85000.00", i_owe: "0.00" })).toEqual({ owed: true, owe: false });
    expect(balanceSides({ owed_to_me: "0", i_owe: "40000" })).toEqual({ owed: false, owe: true });
    expect(balanceSides({ owed_to_me: "10", i_owe: "5" })).toEqual({ owed: true, owe: true });
    expect(balanceSides({ owed_to_me: "0.00", i_owe: "0.00" })).toEqual({ owed: false, owe: false });
  });
  it("sin monto se salda todo; con monto es un abono parcial; basura no vale", () => {
    expect(settleAmount("")).toBeNull();
    expect(settleAmount("  ")).toBeNull();
    expect(settleAmount("30.000")).toBe("30000");
    expect(settleAmount("0")).toBeUndefined();
    expect(settleAmount("abc")).toBeUndefined();
  });
});

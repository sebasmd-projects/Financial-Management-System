import { describe, expect, it } from "vitest";
import { buildCompare, buildExtra, buildInstallment, buildOffer, EMPTY_EXTRA, EMPTY_LOAN, EMPTY_OFFER, parseTerm } from "./logic";

describe("plazo", () => {
  it("de 1 a 600; más de 600 es un error propio", () => {
    expect(parseTerm("36")).toEqual({ value: 36, problem: null });
    expect(parseTerm("600").value).toBe(600);
    expect(parseTerm("601")).toEqual({ value: null, problem: "too_long" });
    expect(parseTerm("0")).toEqual({ value: null, problem: "invalid" });
    expect(parseTerm("abc")).toEqual({ value: null, problem: "invalid" });
    expect(parseTerm("")).toEqual({ value: null, problem: null });
  });
});

describe("cuota fija y tabla", () => {
  const ok = { ...EMPTY_LOAN, principal: "20.000.000", rate: "1,5", term: "36" };
  it("el ejemplo del diseño ($20.000.000, 36 meses, 1,5 % EM) arma la petición con la tasa como fracción", () => {
    expect(buildInstallment(ok).body).toEqual({ principal: "20000000", rate: "0.015", rate_convention: "EM", term: 36, system: "french", insurance: "0", upfront_fees: "0", holiday_rule: "none" });
  });
  it("incompleto: sin petición (resultado en blanco con «Completa capital, tasa y plazo»)", () => {
    expect(buildInstallment(EMPTY_LOAN).body).toBeNull();
    expect(buildInstallment({ ...ok, rate: "" }).body).toBeNull();
    expect(buildInstallment({ ...ok, insurance: "x" }).body).toBeNull();
  });
  it("plazo mayor a 600 meses: error, sin petición", () => {
    const built = buildInstallment({ ...ok, term: "601" });
    expect(built.body).toBeNull();
    expect(built.termProblem).toBe("too_long");
  });
  it("personalizado: los capitales tienen que sumar el capital y ser tantos como cuotas", () => {
    const base = { ...EMPTY_LOAN, principal: "300", rate: "1", term: "2", system: "custom" as const };
    expect(buildInstallment({ ...base, custom: "100\n200" }).body?.custom_capitals).toEqual(["100", "200"]);
    const bad = buildInstallment({ ...base, custom: "100\n100" });
    expect(bad.body).toBeNull();
    expect(bad.customProblem).toBe("sum");
  });
  it("seguro, cargos de apertura y fecha de inicio van si se escriben", () => {
    const body = buildInstallment({ ...ok, insurance: "12.000", upfrontFees: "150.000", firstDue: "2026-12-20" }).body!;
    expect(body).toMatchObject({ insurance: "12000", upfront_fees: "150000", first_due_date: "2026-12-20", holiday_rule: "next" });
    expect(buildInstallment({ ...ok, firstDue: "2026-02-30" }).body).toBeNull();
  });
});

describe("abono extra", () => {
  const ok = { ...EMPTY_EXTRA, principal: "20.000.000", rate: "1,5", term: "36", afterInstallment: "6", extra: "2.000.000" };
  it("arma la petición del ejemplo (abono de $2.000.000 tras la cuota 6)", () => {
    expect(buildExtra(ok).body).toEqual({ principal: "20000000", rate: "0.015", rate_convention: "EM", term: 36, after_installment: 6, extra: "2000000" });
  });
  it("el abono no puede ser después de la última cuota", () => {
    expect(buildExtra({ ...ok, afterInstallment: "36" })).toMatchObject({ body: null, afterProblem: true });
  });
  it("sin monto no hay petición", () => {
    expect(buildExtra({ ...ok, extra: "" }).body).toBeNull();
  });
});

describe("comparar alternativas", () => {
  const offer = { ...EMPTY_OFFER, principal: "10.000.000", rate: "20", convention: "EA" as const, term: "24" };
  it("una oferta completa lleva su etiqueta o la de respaldo", () => {
    expect(buildOffer(offer, "Alternativa 1")).toMatchObject({ label: "Alternativa 1", rate: "0.2", rate_convention: "EA", term: 24, system: "french" });
    expect(buildOffer({ ...offer, label: " Banco A " }, "x")?.label).toBe("Banco A");
    expect(buildOffer(EMPTY_OFFER, "x")).toBeNull();
  });
  it("pide al menos dos completas, en el orden en que están, y ninguna más de tres", () => {
    expect(buildCompare([offer, EMPTY_OFFER], (i) => `A${i + 1}`)).toBeNull();
    const two = buildCompare([offer, EMPTY_OFFER, { ...offer, term: "36" }], (i) => `A${i + 1}`)!;
    expect(two.indexes).toEqual([0, 2]);
    expect(two.offers.map((o) => o.label)).toEqual(["A1", "A3"]);
    expect(buildCompare([offer, offer, offer, offer], (i) => `A${i}`)!.offers).toHaveLength(3);
  });
});

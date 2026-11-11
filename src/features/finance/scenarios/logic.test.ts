import { describe, expect, it } from "vitest";
import type { CompareColumn } from "@/api/models";
import { adjustmentToDraft, buildAdjustment, buildIndependence, emptyDraft, monthlyRows, parseSignedAmount, sign, toggleCompared, yearsMonths } from "./logic";

const TODAY = "2026-11-11";
const draft = (kind: Parameters<typeof emptyDraft>[0], patch: object = {}) => ({ ...emptyDraft(kind, TODAY), ...patch });

describe("ajustes de un escenario", () => {
  it("«Cancelar Netflix»: la recurrencia y desde cuándo, nada más", () => {
    const built = buildAdjustment(draft("cancel_recurrence", { recurrence_id: "rec-1", start: "2026-12-01", amount: "999" }));
    expect(built.adjustment).toEqual({ kind: "cancel_recurrence", recurrence_id: "rec-1", start: "2026-12-01" });
  });
  it("sin recurrencia o con fecha mala no hay ajuste", () => {
    expect(buildAdjustment(draft("cancel_recurrence")).invalid).toEqual(["recurrence_id"]);
    expect(buildAdjustment(draft("cancel_recurrence", { recurrence_id: "r", start: "2026-02-30" })).invalid).toEqual(["start"]);
  });
  it("cambiar el ingreso: con signo, hasta cuándo opcional y nunca antes del inicio", () => {
    expect(buildAdjustment(draft("change_income", { monthly_delta: "-200.000", until: "2027-06-30" })).adjustment).toEqual({ kind: "change_income", monthly_delta: "-200000", start: TODAY, until: "2027-06-30" });
    expect(buildAdjustment(draft("change_income", { monthly_delta: "500.000" })).adjustment).toEqual({ kind: "change_income", monthly_delta: "500000", start: TODAY });
    expect(buildAdjustment(draft("change_income", { monthly_delta: "500.000", until: "2026-01-01" })).invalid).toEqual(["until"]);
    expect(buildAdjustment(draft("change_income", { monthly_delta: "0" })).invalid).toEqual(["monthly_delta"]);
    expect(parseSignedAmount("-1.250,50")).toBe("-1250.50");
    expect(parseSignedAmount("10,125")).toBe("10125");
    expect(parseSignedAmount("1,2345")).toBeNull();
  });
  it("gasto: único o varios meses seguidos (1 a 120); 1 mes no manda `months`", () => {
    expect(buildAdjustment(draft("add_expense", { amount: "300.000", months: "6" })).adjustment).toEqual({ kind: "add_expense", amount: "300000", start: TODAY, months: 6 });
    expect(buildAdjustment(draft("add_expense", { amount: "300.000", months: "1" })).adjustment).toEqual({ kind: "add_expense", amount: "300000", start: TODAY });
    expect(buildAdjustment(draft("add_expense", { amount: "300.000", months: "121" })).invalid).toEqual(["months"]);
    expect(buildAdjustment(draft("add_expense", { amount: "0" })).invalid).toEqual(["amount"]);
  });
  it("préstamo nuevo: tasa en fracción, plazo, primera cuota y, si entra a la caja, el desembolso", () => {
    const built = buildAdjustment(draft("add_loan", { principal: "10.000.000", rate: "18", term: "24", first_payment: "2026-12-15", insurance: "15.000", disbursed_on: TODAY }));
    expect(built.adjustment).toEqual({ kind: "add_loan", principal: "10000000", rate: "0.18", convention: "EA", term: 24, first_payment: "2026-12-15", system: "french", insurance: "15000", disbursed_on: TODAY });
    const bare = buildAdjustment(draft("add_loan", { principal: "1.000.000", rate: "1,5", convention: "EM", term: "12", first_payment: "2026-12-15", insurance: "0" }));
    expect(bare.adjustment).toEqual({ kind: "add_loan", principal: "1000000", rate: "0.015", convention: "EM", term: 12, first_payment: "2026-12-15", system: "french" });
    expect(buildAdjustment(draft("add_loan", {})).invalid).toEqual(["principal", "rate", "term", "first_payment"]);
  });
  it("un ajuste guardado vuelve al formulario y de ahí al mismo ajuste", () => {
    const adjustment = { kind: "add_expense" as const, amount: "300000.00", start: "2026-12-01", months: 3 };
    const back = buildAdjustment(adjustmentToDraft(adjustment, TODAY));
    expect(back.adjustment).toEqual({ kind: "add_expense", amount: "300000.00", start: "2026-12-01", months: 3 });
  });
});

describe("comparador", () => {
  it("como mucho 3 escenarios marcados", () => {
    expect(toggleCompared(["a", "b", "c"], "d", true)).toEqual(["a", "b", "c"]);
    expect(toggleCompared(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleCompared(["a", "b"], "a", false)).toEqual(["b"]);
    expect(toggleCompared(["a"], "a", true)).toEqual(["a"]);
  });
  it("el signo de una diferencia se lee del texto", () => {
    expect([sign("-240000.00"), sign("0.00"), sign("-0"), sign("1500")]).toEqual([-1, 0, 0, 1]);
  });
  it("los meses de todas las columnas, alineados con «Hoy»", () => {
    const col = (key: string, closings: string[]): CompareColumn => ({ key, name: key, closing_balance: "0", interest_paid: "0", debt_end_date: null, net_worth: "0", diff: null, monthly: closings.map((closing, i) => ({ month: `2026-${String(11 + i).padStart(2, "0")}-01`, state: i === 0 ? "current" : "projected", closing })) });
    expect(monthlyRows([col("today", ["100", "200"]), col("s1", ["100", "260"])])).toEqual([
      { month: "2026-11-01", state: "current", closings: ["100", "100"] },
      { month: "2026-12-01", state: "projected", closings: ["200", "260"] },
    ]);
    expect(monthlyRows([])).toEqual([]);
  });
});

describe("independencia financiera", () => {
  const base = { spending: "4.000.000", saving: "1.500.000", returnPct: "4", withdrawalPct: "", startingCapital: "", includeObligations: false };
  it("retiro 4 % por defecto y capital inicial opcional", () => {
    expect(buildIndependence(base).body).toEqual({ monthly_spending: "4000000", monthly_saving: "1500000", real_return: "0.04", withdrawal_rate: "0.04", include_obligations: false });
    expect(buildIndependence({ ...base, withdrawalPct: "3,5", startingCapital: "20.000.000", includeObligations: true }).body).toEqual({ monthly_spending: "4000000", monthly_saving: "1500000", real_return: "0.04", withdrawal_rate: "0.035", include_obligations: true, starting_capital: "20000000" });
  });
  it("el ahorro puede ser cero; el gasto y el retiro no", () => {
    expect(buildIndependence({ ...base, saving: "" }).body?.monthly_saving).toBe("0");
    expect(buildIndependence({ ...base, spending: "0", withdrawalPct: "0", returnPct: "x", startingCapital: "1,2345" }).invalid).toEqual(["spending", "return", "withdrawal", "capital"]);
  });
  it("años y meses", () => {
    expect(yearsMonths(100)).toEqual({ years: 8, months: 4 });
    expect(yearsMonths(5)).toEqual({ years: 0, months: 5 });
  });
});

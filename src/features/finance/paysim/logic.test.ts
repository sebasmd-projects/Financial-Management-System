import { describe, expect, it } from "vitest";
import type { StrategyOutcome } from "@/api/models";
import { anyTruncated, buildCardRequest, buildLoanRequest, buildOpening, buildTargetRequest, chartMonths, chartPicks, EMPTY_CARD_SIM, EMPTY_LOAN_SIM, EMPTY_OPENING, EMPTY_TARGET, openingFileProblem, strategyLabel } from "./logic";

const row = (number: number, payment: string, due = `2026-1${number + 1}-20`) => ({ number, cutoff: due, due_date: due, total_due: payment, minimum_due: "0", payment, revolving_interest: "0", installments: "0", deferred_installment: "0", fees: "0", balance_after: "0" });
const outcome = (key: StrategyOutcome["key"], payments: string[], extra: Partial<StrategyOutcome> = {}): StrategyOutcome => ({
  key, params: { pay_now: payments[0] ?? "0", continue_with: "total", defer_terms: null, defer_rate: null, defer_rate_convention: null, defer_scope: "statement" },
  notes: [], pay_now: payments[0] ?? "0", months: payments.length, payoff_date: "2027-05-20", total_paid: "0", total_interest: "0", interest_revolving: "0", interest_installments: "0", interest_deferred: "0", fees: "0",
  total_cost: "0", extra_cost: "0", peak_payment: "0", deferred_principal: "0", truncated: false, remaining: "0", cheapest: false, rows: payments.map((p, i) => row(i, p)), ...extra,
});

describe("petición del simulador de la tarjeta", () => {
  it("sin escribir nada compara total y mínimo (y los plazos por defecto)", () => {
    expect(buildCardRequest(EMPTY_CARD_SIM)).toEqual({ problem: null, body: { continue_with: "same", defer_terms: [6, 12, 24], defer_scope: "statement", horizon_months: 120 } });
  });
  it("X, Y y la tasa viajan como cadenas decimales (la tasa, como fracción)", () => {
    const { body } = buildCardRequest({ ...EMPTY_CARD_SIM, payAmount: "1.500.000,50", payNow: "800.000", deferRate: "29,6", convention: "EA", terms: [24, 6], scope: "all", continueWith: "minimum" });
    expect(body).toEqual({ pay_amount: "1500000.50", pay_now: "800000", continue_with: "minimum", defer_terms: [6, 24], defer_rate: "0.296", defer_rate_convention: "EA", defer_scope: "all", horizon_months: 120 });
    expect(JSON.stringify(body)).not.toMatch(/\d\.\d+e/);
  });
  it("un campo escrito pero inválido se señala y no se pide nada", () => {
    expect(buildCardRequest({ ...EMPTY_CARD_SIM, payAmount: "abc" })).toEqual({ body: null, problem: "pay_amount" });
    expect(buildCardRequest({ ...EMPTY_CARD_SIM, payNow: "0" })).toEqual({ body: null, problem: "pay_now" });
    expect(buildCardRequest({ ...EMPTY_CARD_SIM, deferRate: "mil" })).toEqual({ body: null, problem: "defer_rate" });
  });
});

describe("las preguntas al revés", () => {
  it("cada meta pide su dato", () => {
    expect(buildTargetRequest(EMPTY_CARD_SIM, EMPTY_TARGET)?.goal).toBe("no_interest");
    expect(buildTargetRequest(EMPTY_CARD_SIM, { ...EMPTY_TARGET, goal: "finish_in" })).toBeNull();
    expect(buildTargetRequest(EMPTY_CARD_SIM, { ...EMPTY_TARGET, goal: "finish_in", months: "12" })).toMatchObject({ goal: "finish_in", months: 12 });
    expect(buildTargetRequest(EMPTY_CARD_SIM, { ...EMPTY_TARGET, goal: "max_payment", maxPayment: "" })).toBeNull();
    expect(buildTargetRequest(EMPTY_CARD_SIM, { ...EMPTY_TARGET, goal: "max_payment", maxPayment: "700.000" })).toMatchObject({ goal: "max_payment", max_payment: "700000" });
    expect(buildTargetRequest({ ...EMPTY_CARD_SIM, payAmount: "x" }, EMPTY_TARGET)).toBeNull();
  });
});

describe("petición del simulador del préstamo", () => {
  it("el abono y los meses son opcionales; escritos tienen que ser válidos", () => {
    expect(buildLoanRequest(EMPTY_LOAN_SIM)).toEqual({ body: {}, problem: null });
    expect(buildLoanRequest({ extra: "2.000.000", months: "12" })).toEqual({ body: { extra: "2000000", months: 12 }, problem: null });
    expect(buildLoanRequest({ extra: "0", months: "" }).problem).toBe("extra");
    expect(buildLoanRequest({ extra: "", months: "0" }).problem).toBe("months");
    expect(buildLoanRequest({ extra: "", months: "121" }).problem).toBe("months");
  });
});

describe("rótulos y gráfica", () => {
  it("el rótulo de una estrategia lleva su monto y sus cuotas", () => {
    const defer = outcome("defer", ["800000"], { params: { ...outcome("defer", []).params, defer_terms: 12, defer_scope: "all" } });
    expect(strategyLabel(defer)).toEqual({ key: "deferAll", amount: "800000", n: "12" });
    expect(strategyLabel(outcome("total", ["2000000"]))).toMatchObject({ key: "total" });
  });
  it("la más barata se dibuja primero y son 4 como mucho", () => {
    const all = [outcome("minimum", ["1"]), outcome("total", ["2"], { cheapest: true }), outcome("amount", ["3"]), outcome("defer", ["4"]), outcome("defer", ["5"])];
    expect(chartPicks(all).map((o) => o.key)).toEqual(["total", "minimum", "amount", "defer"]);
  });
  it("los anchos salen del mayor pago de todo el conjunto, con cadenas decimales", () => {
    const months = chartMonths([outcome("total", ["2000000", "100000"]), outcome("minimum", ["500000", "500000", "500000"])], 12);
    expect(months).toHaveLength(3);
    expect(months[0]).toMatchObject({ amounts: ["2000000", "500000"], widths: [100, 25] });
    expect(months[2]).toMatchObject({ amounts: [null, "500000"], widths: [0, 25] });
    expect(chartMonths([outcome("total", ["1", "2", "3"])], 2)).toHaveLength(2);
  });
  it("detecta una estrategia sin saldar", () => {
    expect(anyTruncated([outcome("total", ["1"]), outcome("minimum", ["1"], { truncated: true })])).toBe(true);
    expect(anyTruncated([outcome("total", ["1"])])).toBe(false);
  });
});

describe("compras a cuotas vigentes", () => {
  const ok = { ...EMPTY_OPENING, purchaseDate: "2026-06-15", description: " Nevera ", original: "2.400.000", count: "12", billed: "5" };
  it("la petición completa lleva solo lo escrito", () => {
    expect(buildOpening(ok)).toEqual({ problem: null, body: { purchase_date: "2026-06-15", description: "Nevera", original: "2400000", count: 12, billed: 5, add_to_opening: false } });
    expect(buildOpening({ ...ok, remaining: "1.400.000", rate: "0", convention: "EA", nextDate: "2026-12-05", addToOpening: true }).body).toMatchObject({ remaining: "1400000", rate: "0", rate_convention: "EA", next_date: "2026-12-05", add_to_opening: true });
  });
  it("incompleto no se señala; inválido sí", () => {
    expect(buildOpening(EMPTY_OPENING)).toEqual({ body: null, problem: null });
    expect(buildOpening({ ...ok, purchaseDate: "15/06/2026" }).problem).toBe("date");
    expect(buildOpening({ ...ok, original: "0" }).problem).toBe("original");
    expect(buildOpening({ ...ok, count: "1" }).problem).toBe("count");
    expect(buildOpening({ ...ok, billed: "" }).problem).toBe("billed");
    expect(buildOpening({ ...ok, remaining: "abc" }).problem).toBe("remaining");
    expect(buildOpening({ ...ok, rate: "x" }).problem).toBe("rate");
    expect(buildOpening({ ...ok, nextDate: "mañana" }).problem).toBe("next");
  });
  it("las cuotas facturadas tienen que ser menos que las totales", () => {
    expect(buildOpening({ ...ok, billed: "12" })).toEqual({ body: null, problem: "billed" });
    expect(buildOpening({ ...ok, billed: "11" }).problem).toBeNull();
  });
  it("el archivo: solo CSV o Excel y hasta 10 MB", () => {
    expect(openingFileProblem(new File(["x"], "planes.csv"))).toBeNull();
    expect(openingFileProblem(new File(["x"], "planes.XLSX"))).toBeNull();
    expect(openingFileProblem(new File(["x"], "planes.pdf"))).toBe("extension");
    expect(openingFileProblem(new File(["x"], "planes.csv"), 0)).toBe("too_large");
  });
});

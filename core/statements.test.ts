import { describe, expect, it } from "vitest";
import { bars, defaultMonth, lastClosedByCard, monthTitle, monthView, monthViews, parseMonthParam, payPlan, payTargets, timelineCards, type Timeline } from "./statements";

const card = (id: string, label: string, cutoff: string, min: string, total: string, extra: Record<string, unknown> = {}) => ({
  card_id: id, card_label: label, cutoff, due_date: cutoff.slice(0, 8) + "20", estimated: cutoff > "2026-11-13", carried: "0.00", total_due: total, minimum_due: min, paid_so_far: "0.00", rate_assumed: false, rate_valid_from: null, rate_outdated: false, ...extra,
});
const month = (m: string, cards: ReturnType<typeof card>[]) => ({
  month: m, cutoff: cards[0].cutoff, due_date: cards[0].due_date, estimated: cards.some((c) => c.estimated), rate_assumed: false, rate_outdated: false,
  total_due: cards.reduce((s, c) => s + Number(c.total_due), 0).toFixed(2), minimum_due: cards.reduce((s, c) => s + Number(c.minimum_due), 0).toFixed(2), paid_so_far: "0.00",
  cards, lines: cards.map((c) => ({ date: c.cutoff, description: "x", card_id: c.card_id, card_label: c.card_label, kind: "purchase" as const, installment_number: null, installment_total: null, amount: "1.00", capital: null, interest: null, purchase_date: null, estimated: false, rate_assumed: false })),
});
const T = {
  months: [
    month("2026-11", [card("a", "Visa", "2026-11-05", "100000.00", "400000.00"), card("b", "Master", "2026-11-05", "50000.00", "200000.00")]),
    month("2026-12", [card("a", "Visa", "2026-12-05", "171908.34", "500000.00", { rate_assumed: true }), card("b", "Master", "2026-12-05", "0.00", "0.00")]),
  ],
} as unknown as Timeline;

describe("extractos", () => {
  it("parsea el mes de la URL y rotula en es/en", () => {
    expect(parseMonthParam("2026-12")).toBe("2026-12");
    expect(parseMonthParam("2026-13")).toBeNull();
    expect(parseMonthParam("150000")).toBeNull();
    expect(monthTitle("2026-12", "es")).toBe("Diciembre de 2026");
    expect(monthTitle("2026-12", "en")).toBe("December 2026");
  });
  it("filtra por tarjeta y calcula alturas sin Number", () => {
    const all = monthViews(T, null, "2026-11-13");
    const one = monthViews(T, "b", "2026-11-13");
    expect(all[1].minimum_due).toBe("171908.34");
    expect(one[0].lines).toHaveLength(1);
    expect(monthView(T.months[0], "zzz", "2026-11-13")).toBeNull();
    const b = bars(all, "minimum");
    expect(b[1].percent).toBe(100);
    expect(b[0].percent).toBe(87);
    expect(b[1].estimated).toBe(true);
    expect(timelineCards(T).map((c) => c.card_id)).toEqual(["a", "b"]);
  });
  it("mes por omisión y qué se abona", () => {
    const views = monthViews(T, null, "2026-11-13");
    expect(defaultMonth(views, "2026-11-13")).toBe("2026-11");
    const last = lastClosedByCard(T, "2026-11-13");
    expect(last.get("a")).toBe("2026-11");
    const [m1, m2] = T.months;
    expect(payPlan(m1.cards[0], "2026-11", last, "2026-11-13", "minimum")).toEqual({ kind: "minimum", amount: null });
    expect(payPlan(m2.cards[0], "2026-12", last, "2026-11-13", "minimum")).toEqual({ kind: "amount", amount: "171908.34" });
    expect(payPlan(m2.cards[0], "2026-12", last, "2026-11-13", "total")).toEqual({ kind: "amount", amount: "500000.00" });
    expect(payPlan(m2.cards[1], "2026-12", last, "2026-11-13", "minimum")).toBeNull();
    expect(payTargets(monthViews(T, null, "2026-11-13")[1], last, "2026-11-13", "minimum").map((t) => t.card_id)).toEqual(["a"]);
  });
});

import { describe, expect, it } from "vitest";
import type { CalendarDay } from "@/api/models";
import { calendarQuery, dayDots, itemTarget, modeFromParams, monthGrid, shiftAnchor } from "./logic";

describe("calendario: consultas y navegación", () => {
  it("los rangos y las vistas arman la consulta sin montos", () => {
    expect(calendarQuery("30", "2026-11-11")).toEqual({ range: 30 });
    expect(calendarQuery("week", "2026-11-11")).toEqual({ view: "week", date: "2026-11-11" });
    expect(calendarQuery("overdue", "2026-11-11")).toEqual({ view: "month", date: "2026-11-11" });
  });
  it("los enlaces profundos ?rango= y ?vista=", () => {
    expect(modeFromParams("30", null)).toBe("30");
    expect(modeFromParams("vencidos", null)).toBe("overdue");
    expect(modeFromParams(null, "semana")).toBe("week");
    expect(modeFromParams("99", "xx")).toBe("month");
  });
  it("anterior y siguiente: mes, semana y día; los rangos no se mueven", () => {
    expect(shiftAnchor("month", "2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftAnchor("week", "2026-11-11", -1)).toBe("2026-11-04");
    expect(shiftAnchor("day", "2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftAnchor("30", "2026-11-11", 1)).toBe("2026-11-11");
  });
});

describe("rejilla del mes", () => {
  it("noviembre de 2026 empieza en domingo: seis huecos antes y semanas completas", () => {
    const weeks = monthGrid("2026-11-01", "2026-11-30", []);
    expect(weeks).toHaveLength(6);
    expect(weeks[0].slice(0, 6).every((c) => c === null)).toBe(true);
    expect(weeks[0][6]?.date).toBe("2026-11-01");
    expect(weeks[5][0]?.date).toBe("2026-11-30");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
  it("cada celda lleva su día si la API lo trajo", () => {
    const day = { date: "2026-11-15", holiday: null, items: [], needed: "0", expected_income: "0", balance_before: null, balance_after: null, negative: false } as CalendarDay;
    const cell = monthGrid("2026-11-01", "2026-11-30", [day]).flat().find((c) => c?.date === "2026-11-15");
    expect(cell?.day).toBe(day);
  });
});

describe("puntos y destinos", () => {
  it("hasta 3 puntos y «+N»", () => {
    const items = ["out", "out", "in", "out", "info"].map((direction) => ({ direction })) as never;
    expect(dayDots(items)).toEqual({ shown: ["out", "out", "in"], more: 2 });
  });
  it("cada compromiso lleva a su pantalla", () => {
    expect(itemTarget({ ref_kind: "occurrence", ref_id: "o1", kind: "fixed_expense" })).toEqual({ route: "pagos-fijo-pagar", params: ["o1"] });
    expect(itemTarget({ ref_kind: "card", ref_id: "c1", kind: "card_payment" })).toEqual({ route: "tarjeta-pagar", params: ["c1"] });
    expect(itemTarget({ ref_kind: "card", ref_id: "c1", kind: "card_cut" })).toEqual({ route: "tarjeta", params: ["c1"] });
    expect(itemTarget({ ref_kind: "loan_installment", ref_id: "i1", kind: "loan_installment" })).toEqual({ route: "creditos", params: [] });
  });
});

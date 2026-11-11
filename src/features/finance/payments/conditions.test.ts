import { describe, expect, it } from "vitest";
import { EMPTY_PAUSES, EMPTY_TERMS, LATE_RATE_KEY, pauseFields, rangeProblem, termsFields, toggleMonth } from "./conditions";
import { scheduleFields } from "./schedule";
import { splitBody, splitPlan } from "./split";

describe("ventanas de pago", () => {
  it("sin nada: no se manda nada al crear y se borra todo al editar", () => {
    expect(termsFields(EMPTY_TERMS)).toEqual({ fields: {}, problems: {} });
    expect(termsFields(EMPTY_TERMS, true).fields).toEqual({ early_days_before: null, early_kind: "", early_value: null, late_kind: "none", late_value: null });
  });
  it("pronto pago en porcentaje (puntos) y recargo de mora diaria con la clave de la tasa", () => {
    const { fields, problems } = termsFields({ earlyDays: "15", earlyKind: "percent", earlyValue: "10", lateKind: "daily", lateValue: "" });
    expect(problems).toEqual({});
    expect(fields).toEqual({ early_days_before: 15, early_kind: "percent", early_value: "10", late_kind: "daily", late_rate_key: LATE_RATE_KEY });
  });
  it("descuento fijo y recargo porcentual: montos y puntos como cadenas", () => {
    const { fields } = termsFields({ earlyDays: "5", earlyKind: "fixed", earlyValue: "50.000", lateKind: "percent", lateValue: "2,5" });
    expect(fields).toMatchObject({ early_kind: "fixed", early_value: "50000", late_kind: "percent", late_value: "2.5" });
  });
  it("un pronto pago a medias o un recargo sin valor son problemas, no campos", () => {
    expect(termsFields({ ...EMPTY_TERMS, earlyDays: "10" }).problems).toEqual({ earlyValue: "invalid" });
    expect(termsFields({ ...EMPTY_TERMS, earlyValue: "10" }).problems).toEqual({ earlyDays: "invalid" });
    expect(termsFields({ ...EMPTY_TERMS, earlyDays: "10", earlyValue: "101" }).problems).toEqual({ earlyValue: "invalid" });
    expect(termsFields({ ...EMPTY_TERMS, lateKind: "fixed" }).problems).toEqual({ lateValue: "invalid" });
  });
});

describe("pausas", () => {
  it("meses ordenados sin repetir; los rangos al revés o incompletos se rechazan", () => {
    expect(toggleMonth([12], 1)).toEqual([1, 12]);
    expect(toggleMonth([1, 12], 1)).toEqual([12]);
    expect(pauseFields({ months: [12, 1, 12], ranges: [] })).toEqual({ fields: { skip_months: [1, 12], skip_ranges: [] }, valid: true });
    expect(rangeProblem({ start: "2026-12-20", end: "2027-01-10" })).toBeNull();
    expect(rangeProblem({ start: "2026-12-20", end: "2026-12-01" })).toBe("reversed");
    expect(rangeProblem({ start: "", end: "2026-12-01" })).toBe("incomplete");
    expect(pauseFields({ ...EMPTY_PAUSES, ranges: [{ start: "2026-12-20", end: "2026-12-01" }] }).valid).toBe(false);
  });
});

describe("meses explícitos", () => {
  const base = { frequency: "annual", startDate: "2026-01-01", endDate: "", day: "10", lastDay: false, weekday: "0", month: "3", interval: "30", holidayRule: "next" } as const;
  it("sustituyen el mes de anclaje y salen ordenados", () => {
    expect(scheduleFields({ ...base, months: [8, 2] })).toMatchObject({ months: [2, 8], day: 10 });
    expect(scheduleFields({ ...base, months: [8, 2] })).not.toHaveProperty("month");
    expect(scheduleFields(base)).toMatchObject({ month: 3 });
  });
  it("no aplican a una frecuencia diaria o semanal", () => {
    expect(scheduleFields({ ...base, frequency: "weekly", months: [2] })).not.toHaveProperty("months");
  });
});

describe("dividir en cuotas", () => {
  it("fechas cada N meses y partes iguales con la diferencia al final", () => {
    const plan = splitPlan({ count: "4", first: "2026-12-15", every: "3" }, "1200000.00");
    expect(plan?.dates).toEqual(["2026-12-15", "2027-03-15", "2027-06-15", "2027-09-15"]);
    expect(plan?.amounts).toEqual(["300000.00", "300000.00", "300000.00", "300000.00"]);
    expect(splitBody(plan!)).toEqual({ installments: [{ due_date: "2026-12-15" }, { due_date: "2027-03-15" }, { due_date: "2027-06-15" }, { due_date: "2027-09-15" }] });
  });
  it("rechaza menos de 2, más de 24 o una fecha inválida", () => {
    expect(splitPlan({ count: "1", first: "2026-12-15", every: "1" }, "100")).toBeNull();
    expect(splitPlan({ count: "25", first: "2026-12-15", every: "1" }, "100")).toBeNull();
    expect(splitPlan({ count: "3", first: "", every: "1" }, "100")).toBeNull();
  });
});

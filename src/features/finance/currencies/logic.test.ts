import { describe, expect, it } from "vitest";
import type { Currency, ExchangeRate } from "@/api/models";
import { EMPTY_FOREIGN, pickRate, resolveForeign, sortRates } from "./logic";

const USD: Currency = { code: "USD", decimals: 2, latest_rate: null };
const JPY: Currency = { code: "JPY", decimals: 0, latest_rate: null };
const rate = (id: string, on: string, value: string, currency = "USD"): ExchangeRate => ({ id, currency, on, rate: value, source: "Banco de la República" });
const RATES = [rate("a", "2026-11-01", "3900"), rate("b", "2026-11-10", "3912.4"), rate("c", "2026-11-20", "4000"), rate("d", "2026-11-10", "27", "JPY")];

describe("tasa vigente para una fecha", () => {
  it("la más reciente que no sea posterior, de la moneda pedida", () => {
    expect(pickRate(RATES, "USD", "2026-11-15")?.id).toBe("b");
    expect(pickRate(RATES, "USD", "2026-11-10")?.id).toBe("b");
    expect(pickRate(RATES, "USD", "2026-12-31")?.id).toBe("c");
  });
  it("sin tasa anterior no hay tasa: nunca se inventa", () => {
    expect(pickRate(RATES, "USD", "2026-10-31")).toBeNull();
    expect(pickRate(RATES, "EUR", "2026-11-15")).toBeNull();
  });
  it("ordena de la más reciente a la más antigua", () => {
    expect(sortRates(RATES.filter((r) => r.currency === "USD")).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});

describe("cobro en otra moneda", () => {
  const on = { ...EMPTY_FOREIGN, enabled: true, currency: "USD", amount: "2,99" };
  it("US$2,99 con la tasa registrada: pesos de la vista previa y cuerpo sin amount ni tasa", () => {
    const r = resolveForeign(on, [USD], RATES, "2026-11-15");
    expect(r.problems).toEqual([]);
    expect(r.pesos).toBe("11698.08");
    expect(r.rate).toMatchObject({ value: "3912.4", on: "2026-11-10", own: false });
    expect(r.body).toEqual({ original_amount: "2.99", original_currency: "USD" });
  });
  it("sin tasa registrada avisa y no deja enviar", () => {
    const r = resolveForeign(on, [USD], RATES, "2026-10-01");
    expect(r.problems).toEqual(["rate_missing"]);
    expect(r.body).toBeNull();
    expect(r.pesos).toBeNull();
  });
  it("una tasa propia exige fuente y viaja con su fecha y fuente", () => {
    const own = { ...on, ownRate: true, rate: "4.100,5" };
    expect(resolveForeign(own, [USD], RATES, "2026-10-01").problems).toEqual(["source_required"]);
    const r = resolveForeign({ ...own, rateSource: " Casa de cambio " }, [USD], RATES, "2026-10-01");
    expect(r.problems).toEqual([]);
    expect(r.body).toEqual({ original_amount: "2.99", original_currency: "USD", fx_rate: "4100.5", fx_rate_date: "2026-10-01", fx_source: "Casa de cambio" });
  });
  it("los decimales los pone la moneda (yen sin decimales)", () => {
    expect(resolveForeign({ ...on, currency: "JPY", amount: "1.500" }, [JPY], RATES, "2026-11-15").originalAmount).toBe("1500");
    expect(resolveForeign({ ...on, currency: "JPY", amount: "15,5" }, [JPY], RATES, "2026-11-15").problems).toContain("amount");
  });
  it("moneda ausente o monto ilegible", () => {
    expect(resolveForeign({ ...on, currency: "" }, [USD], RATES, "2026-11-15").problems).toEqual(["currency"]);
    expect(resolveForeign({ ...on, amount: "abc" }, [USD], RATES, "2026-11-15").problems).toContain("amount");
  });
});

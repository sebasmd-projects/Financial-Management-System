import { describe, expect, it } from "vitest";
import { parseCustomCapitals } from "./loan-logic";

describe("tabla personalizada", () => {
  it("acepta un capital por línea que suma el capital inicial", () => {
    expect(parseCustomCapitals("300.000\n300.000,50\n399.999,50", 3, "1000000")).toEqual({ capitals: ["300000", "300000.50", "399999.50"], problem: null });
  });
  it("también separa con punto y coma", () => {
    expect(parseCustomCapitals("100;200", 2, "300").capitals).toEqual(["100", "200"]);
  });
  it("nombra el problema: vacío, no es un monto, cantidad distinta del plazo o suma distinta", () => {
    expect(parseCustomCapitals("  \n", 3, "10").problem).toBe("empty");
    expect(parseCustomCapitals("10\nabc", 2, "10").problem).toBe("invalid");
    expect(parseCustomCapitals("10\n20", 3, "30").problem).toBe("count");
    expect(parseCustomCapitals("10\n20", 2, "31").problem).toBe("sum");
  });
  it("la suma es exacta al centavo (nada de coma flotante)", () => {
    expect(parseCustomCapitals("0,10\n0,20", 2, "0.30").problem).toBeNull();
  });
});

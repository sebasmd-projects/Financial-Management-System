import { describe, expect, it } from "vitest";
import {
  addAmounts,
  compareAmounts,
  formatCop,
  formatCopCompact,
  isDecimalString,
  isNegativeAmount,
  isValidAmountInput,
  spokenCop,
} from "./money";

describe("formatCop (diseño §4.4)", () => {
  it.each([
    ["1200000.00", "$1.200.000"],
    ["1200000", "$1.200.000"],
    ["5200000.00", "$5.200.000"],
    ["8500", "$8.500"],
    ["999", "$999"],
    ["0", "$0"],
    ["0.00", "$0"],
    ["1840000.00", "$1.840.000"],
    ["3420000.00", "$3.420.000"],
    ["723048.00", "$723.048"],
    ["1000000000.00", "$1.000.000.000"],
    ["9999999999999.99", "$9.999.999.999.999,99"],
  ])("%s → %s", (input, expected) => {
    expect(formatCop(input)).toBe(expected);
  });

  it("negativo con U+2212 antes del símbolo, nunca paréntesis", () => {
    expect(formatCop("-180000.00")).toBe("−$180.000");
    expect(formatCop("-180000").charCodeAt(0)).toBe(0x2212);
    expect(formatCop("-120000")).toBe("−$120.000");
  });

  it("centavos solo si no son cero, con coma y 2 cifras", () => {
    expect(formatCop("21704.98")).toBe("$21.704,98");
    expect(formatCop("75969.1")).toBe("$75.969,10");
    expect(formatCop("0.05")).toBe("$0,05");
    expect(formatCop("100.00")).toBe("$100");
    expect(formatCop("-21704.98")).toBe("−$21.704,98");
  });

  it("más de 2 decimales: al centavo, mitad-al-par, sobre el texto", () => {
    expect(formatCop("0.125")).toBe("$0,12");
    expect(formatCop("0.135")).toBe("$0,14");
    expect(formatCop("10.999")).toBe("$11");
    expect(formatCop("1.004")).toBe("$1");
  });

  it("cero negativo no lleva signo", () => {
    expect(formatCop("-0")).toBe("$0");
    expect(formatCop("-0.00")).toBe("$0");
    expect(formatCop("-0.004")).toBe("$0");
  });

  it("signo en listas: ingreso +, egreso −, transferencia sin signo (la pone quien llama)", () => {
    expect(formatCop("5200000.00", { sign: "always" })).toBe("+$5.200.000");
    expect(formatCop("-180000.00", { sign: "always" })).toBe("−$180.000");
    expect(formatCop("0", { sign: "always" })).toBe("$0");
    expect(formatCop("5200000.00")).toBe("$5.200.000");
  });

  it("estimado con ~", () => {
    expect(formatCop("130000", { estimated: true })).toBe("~$130.000");
    expect(formatCopCompact("130000", { estimated: true })).toBe("~$130 mil");
  });

  it("es exacto con 18 dígitos: un Number perdería precisión", () => {
    expect(formatCop("9007199254740993.00")).toBe("$9.007.199.254.740.993");
    expect(formatCop("123456789012345678")).toBe("$123.456.789.012.345.678");
  });

  it("rechaza lo que no es una cadena decimal", () => {
    for (const bad of ["", "abc", "1,5", "1.200.000", "1e5", " 1", "1 ", "--1", "1.", ".5", "NaN", "Infinity"]) {
      expect(() => formatCop(bad), bad).toThrow(RangeError);
    }
  });
});

describe("formatCopCompact (solo fichas, riel y KPI estrechos)", () => {
  it.each([
    ["450000", "$450 mil"],
    ["250000", "$250 mil"],
    ["40000", "$40 mil"],
    ["10000", "$10 mil"],
    ["9999", "$9.999"],
    ["8500", "$8.500"],
    ["0", "$0"],
    ["1200000", "$1,2 M"],
    ["3420000", "$3,4 M"],
    ["1000000", "$1,0 M"],
    ["5200000", "$5,2 M"],
    ["1250400000", "$1.250,4 M"],
    ["999999", "$1,0 M"],
    ["999499", "$999 mil"],
    ["10000.40", "$10 mil"],
  ])("%s → %s", (input, expected) => {
    expect(formatCopCompact(input)).toBe(expected);
  });

  it("mitad-al-par también al abreviar", () => {
    expect(formatCopCompact("1250000")).toBe("$1,2 M");
    expect(formatCopCompact("1350000")).toBe("$1,4 M");
    expect(formatCopCompact("12500")).toBe("$12 mil");
    expect(formatCopCompact("13500")).toBe("$14 mil");
  });

  it("negativos y signo", () => {
    expect(formatCopCompact("-450000")).toBe("−$450 mil");
    expect(formatCopCompact("-1200000")).toBe("−$1,2 M");
    expect(formatCopCompact("5200000", { sign: "always" })).toBe("+$5,2 M");
    expect(formatCopCompact("-0.30")).toBe("$0");
  });
});

describe("spokenCop (lector de pantalla, diseño §6)", () => {
  it("valor completo, nunca la abreviatura", () => {
    expect(spokenCop("-180000.00", "egreso")).toBe("egreso de 180000 pesos");
    expect(spokenCop("5200000", "ingreso")).toBe("ingreso de 5200000 pesos");
    expect(spokenCop("1200000")).toBe("1200000 pesos");
    expect(spokenCop("-1200000")).toBe("menos 1200000 pesos");
    expect(spokenCop("1")).toBe("1 peso");
    expect(spokenCop("21704.98")).toBe("21704,98 pesos");
  });
});

describe("aritmética exacta", () => {
  it("0,1 + 0,2 es 0,30", () => {
    expect(addAmounts("0.10", "0.20")).toBe("0.30");
    expect(addAmounts("1200000.00", "-180000.00", "0.05")).toBe("1020000.05");
    expect(addAmounts("-5", "2")).toBe("-3.00");
    expect(addAmounts()).toBe("0.00");
    expect(addAmounts("9007199254740993", "1")).toBe("9007199254740994.00");
  });
  it("compara sin Number", () => {
    expect(compareAmounts("10.00", "9.99")).toBe(1);
    expect(compareAmounts("-1", "1")).toBe(-1);
    expect(compareAmounts("2", "2.00")).toBe(0);
    expect(isNegativeAmount("-0.00")).toBe(false);
    expect(isNegativeAmount("-0.01")).toBe(true);
  });
});

describe("captura", () => {
  it("hasta 13 cifras enteras y 2 decimales", () => {
    expect(isValidAmountInput("1234567890123")).toBe(true);
    expect(isValidAmountInput("12345678901234")).toBe(false);
    expect(isValidAmountInput("10.5")).toBe(true);
    expect(isValidAmountInput("10.555")).toBe(false);
    expect(isValidAmountInput("-1")).toBe(false);
    expect(isValidAmountInput("")).toBe(false);
    expect(isValidAmountInput("0001")).toBe(true);
  });
  it("isDecimalString", () => {
    expect(isDecimalString("1.5")).toBe(true);
    expect(isDecimalString(1.5)).toBe(false);
    expect(isDecimalString(null)).toBe(false);
  });
});

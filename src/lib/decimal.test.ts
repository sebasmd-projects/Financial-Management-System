import { describe, expect, it } from "vitest";
import { convertToPesos, formatDecimal, formatForeign, formatKm, formatRate, formatUnits, parseForeignAmount, parseIndexValue, parseRateInput, parseUnitsInput, sumDecimals } from "./decimal";

describe("tasa escrita por la persona", () => {
  it.each([
    ["3912", "3912"],
    ["3912,4", "3912.4"],
    ["3912.40", "3912.4"],
    ["3.912,45", "3912.45"],
    ["3,912.45", "3912.45"],
    ["3.912", "3912"],
    ["26,512345678901", "26.512345678901"],
    ["0,25", "0.25"],
  ])("%j → %j", (raw, expected) => expect(parseRateInput(raw)).toBe(expected));
  it.each(["", "0", "0,00", "abc", "-5", "3.9.1,2", "1,2345678901234", "12345678901234"])("rechaza %j", (raw) => expect(parseRateInput(raw)).toBeNull());
});

describe("monto en otra moneda", () => {
  it.each([
    ["2,99", 2, "2.99"],
    ["2.99", 2, "2.99"],
    ["1.250,50", 2, "1250.50"],
    ["15", 2, "15"],
    ["1.250", 0, "1250"],
  ])("%j (%i decimales) → %j", (raw, decimals, expected) => expect(parseForeignAmount(raw, decimals)).toBe(expected));
  it("rechaza más decimales que la moneda y lo que no es un monto", () => {
    expect(parseForeignAmount("2,9999", 2)).toBeNull();
    expect(parseForeignAmount("0", 2)).toBeNull();
    expect(parseForeignAmount("x", 2)).toBeNull();
  });
});

describe("conversión a pesos (vista previa, mitad hacia arriba, una sola vez)", () => {
  it("US$2,99 a 3.912,4 → 11.698,08 (el ejemplo del diseño)", () => {
    expect(convertToPesos("2.99", "3912.4")).toBe("11698.08");
  });
  it("redondea al centavo sin errores de coma flotante", () => {
    expect(convertToPesos("0.10", "0.3")).toBe("0.03");
    expect(convertToPesos("1", "0.005")).toBe("0.01");
    expect(convertToPesos("1", "0.004")).toBe("0.00");
    expect(convertToPesos("100", "3912.4")).toBe("391240.00");
  });
  it("entradas inválidas", () => {
    expect(convertToPesos("-1", "2")).toBeNull();
  });
});

describe("formatos", () => {
  it("decimales, tasa, otra moneda y kilómetros", () => {
    expect(formatDecimal("1234567.5", 2)).toBe("1.234.567,50");
    expect(formatRate("3912.4")).toBe("$3.912,4");
    expect(formatForeign("2.99", "USD")).toBe("USD 2,99");
    expect(formatForeign("1250", "JPY", 0)).toBe("JPY 1.250");
    expect(formatKm("185400.00")).toBe("185.400");
    expect(formatKm("0")).toBe("0");
  });
});

describe("índices (UVR)", () => {
  it("un solo separador es el decimal, nunca el de miles", () => {
    expect(parseIndexValue("389,4521")).toBe("389.4521");
    expect(parseIndexValue("390.123")).toBe("390.123");
    expect(parseIndexValue("390,123")).toBe("390.123");
    expect(parseIndexValue("389")).toBe("389");
    expect(parseIndexValue(" $ 389,450000 ")).toBe("389.45");
  });
  it("rechaza lo ambiguo, cero, negativos y más de 6 decimales", () => {
    for (const bad of ["", "abc", "1.234,5", "1,2,3", "0", "0,000", "-3", "389,1234567", "12345678901234"]) expect(parseIndexValue(bad), bad).toBeNull();
  });
  it("las unidades se muestran con punto de miles y hasta 4 decimales", () => {
    expect(formatUnits("1234567.8900", "UVR")).toBe("1.234.567,89 UVR");
    expect(formatUnits("52000.0000", "UVR")).toBe("52.000 UVR");
    expect(formatUnits("0.5", "UVR")).toBe("0,5 UVR");
  });
});

describe("unidades UVR escritas por la persona", () => {
  it.each([
    ["52000", "52000"],
    ["52.000", "52000"],
    ["52.000,5", "52000.5"],
    ["1.250.000,1234", "1250000.1234"],
    ["52000,25", "52000.25"],
    ["52000.25", "52000.25"],
    ["0,5", "0.5"],
    ["1.234.567", "1234567"],
  ])("%j → %j", (raw, expected) => expect(parseUnitsInput(raw)).toBe(expected));
  it.each(["", "0", "abc", "1,23456", "12.34.5", "1,234,5", "-5", "0,000"])("rechaza %j", (raw) => expect(parseUnitsInput(raw)).toBeNull());
});

describe("suma exacta de decimales", () => {
  it("no redondea a centavos", () => {
    expect(sumDecimals(["0.0001", "0.0002"])).toBe("0.0003");
    expect(sumDecimals(["1234.5678", "0.4322", "5"])).toBe("1240");
    expect(sumDecimals([])).toBe("0");
    expect(sumDecimals(["0.10", "0.20"])).toBe("0.3");
  });
});

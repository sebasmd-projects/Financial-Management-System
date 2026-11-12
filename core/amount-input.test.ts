import { describe, expect, it } from "vitest";
import { amountInputProblem, fractionToPercent, normalizeAmountInput, parsePercentPoints, parsePositiveAmount, percentToFraction } from "./amount-input";

describe("monto escrito por la persona → cadena decimal", () => {
  it.each([
    ["180000", "180000"],
    ["180.000", "180000"],
    ["1.200.000", "1200000"],
    ["1.200.000,50", "1200000.50"],
    ["1,200,000.5", "1200000.5"],
    ["$ 21.704,98", "21704.98"],
    ["1,5", "1.5"],
    ["1.500", "1500"],
    ["0,05", "0.05"],
    [",5", "0.5"],
  ])("%j → %j", (raw, expected) => {
    expect(normalizeAmountInput(raw)).toBe(expected);
  });
  it.each(["", "abc", "1.5.0", "12,345,67,8", "-5", "1e5", "1.234.5678.9012.3456.7", "12345678901234"])("rechaza %j", (raw) => {
    expect(normalizeAmountInput(raw)).toBeNull();
  });
  it("cero y vacío no son un monto positivo (Guardar queda inactivo)", () => {
    expect(parsePositiveAmount("0")).toBeNull();
    expect(parsePositiveAmount("0,00")).toBeNull();
    expect(parsePositiveAmount("")).toBeNull();
    expect(parsePositiveAmount("0,01")).toBe("0.01");
  });
});

describe("tasas: porcentaje que escribe la persona ⇄ fracción de la API", () => {
  it.each([
    ["24", "0.24"],
    ["1,5", "0.015"],
    ["0", "0"],
    ["100", "1"],
    ["1,8088", "0.018088"],
    ["24 %", "0.24"],
    ["0,05", "0.0005"],
  ])("%j → %j", (raw, expected) => {
    expect(percentToFraction(raw)).toBe(expected);
  });
  it.each(["", "abc", "1000", "-1", "1,2,3"])("rechaza %j", (raw) => {
    expect(percentToFraction(raw)).toBeNull();
  });
  it.each([
    ["0.24", "24"],
    ["0.018088", "1.8088"],
    ["0.015", "1.5"],
    ["0", "0"],
    ["1", "100"],
    ["0.1808812345", "18.0881"],
    ["0.00005", "0.005"],
  ])("fracción %j → %j %%", (fraction, expected) => {
    expect(fractionToPercent(fraction)).toBe(expected);
  });
});

describe("qué tiene mal un monto (decimales de más)", () => {
  it.each([
    ["1,2345", "too_many_decimals"],
    ["1234.5678", "too_many_decimals"],
    ["0,125", "too_many_decimals"],
    ["abc", "invalid"],
    ["1.5.0", "invalid"],
    ["180.000", null],
    ["12,50", null],
    ["", null],
  ])("%j → %j", (raw, expected) => {
    expect(amountInputProblem(raw)).toBe(expected);
  });
});

describe("porcentaje en puntos (descuentos y recargos)", () => {
  it.each([
    ["10", "10"],
    ["7,5", "7.5"],
    ["7.50 %", "7.5"],
    ["100", "100"],
    ["0,25", "0.25"],
    ["010", "10"],
    ["0", null],
    ["0,0", null],
    ["100,5", null],
    ["101", null],
    ["-5", null],
    ["1,23456", null],
    ["abc", null],
    ["", null],
  ])("%j → %j", (raw, expected) => {
    expect(parsePercentPoints(raw)).toBe(expected);
  });
});

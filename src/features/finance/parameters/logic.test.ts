import { describe, expect, it } from "vitest";
import { displayValue, newValueBody, parseValue } from "./logic";

describe("valores de parámetros por unidad", () => {
  it("se leen: fracción como porcentaje (coma en español), monto en pesos y cantidad entera", () => {
    expect(displayValue("fraction", "0.2345", "es")).toBe("23,45 %");
    expect(displayValue("fraction", "0.2345", "en")).toBe("23.45 %");
    expect(displayValue("fraction", "0.24", "es")).toBe("24 %");
    expect(displayValue("amount", "49799.00", "es")).toBe("$49.799");
    expect(displayValue("count", "4.00", "es")).toBe("4");
    expect(displayValue("count", "4", "es")).toBe("4");
  });
  it("se capturan: el porcentaje pasa a fracción, nunca por Number", () => {
    expect(parseValue("fraction", "24")).toBe("0.24");
    expect(parseValue("fraction", "1,5")).toBe("0.015");
    expect(parseValue("fraction", "abc")).toBeNull();
    expect(parseValue("amount", "49.799")).toBe("49799");
    expect(parseValue("amount", "0")).toBeNull();
    expect(parseValue("count", "4")).toBe("4");
    expect(parseValue("count", "4,5")).toBeNull();
  });
});

describe("valor nuevo con fuente obligatoria", () => {
  const base = { unit: "fraction" as const, value: "23,45", validFrom: "2026-11-01", validTo: "", source: "Resolución 1234 de 2026" };
  it("arma el cuerpo con la fracción, las fechas y la fuente", () => {
    expect(newValueBody(base)).toEqual({ body: { value: "0.2345", valid_from: "2026-11-01", source: "Resolución 1234 de 2026" }, problems: {} });
    expect(newValueBody({ ...base, validTo: "2026-11-30" }).body).toMatchObject({ valid_to: "2026-11-30" });
  });
  it("sin fuente (o solo espacios) no hay cuerpo", () => {
    expect(newValueBody({ ...base, source: "   " })).toEqual({ body: null, problems: { source: true } });
  });
  it("valor inválido, fecha de inicio vacía o rango al revés", () => {
    expect(newValueBody({ ...base, value: "x" }).problems).toEqual({ value: true });
    expect(newValueBody({ ...base, validFrom: "" }).problems).toEqual({ validFrom: true });
    expect(newValueBody({ ...base, validTo: "2026-10-01" }).problems).toEqual({ range: true });
    expect(newValueBody({ ...base, source: "x".repeat(501) }).problems).toEqual({ source: true });
  });
});

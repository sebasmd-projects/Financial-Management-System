import { describe, expect, it } from "vitest";
import { indexOf, isUvr, pesoEstimate, variableRateBody } from "./logic";

describe("créditos en UVR", () => {
  it("se reconocen por la unidad y por el índice", () => {
    expect(isUvr({ unit: "UVR" })).toBe(true);
    expect(isUvr({ unit: "COP" })).toBe(false);
    expect(indexOf({ index_key: "DTF_EA" })).toBe("DTF_EA");
    expect(indexOf({ index_key: null })).toBeNull();
  });
  it("la estimación en pesos es unidades × UVR, redondeada una vez al centavo, y sin UVR no hay cifra", () => {
    expect(pesoEstimate("52000", "389.4521")).toBe("20251509.20");
    expect(pesoEstimate("1.5", "389.4521")).toBe("584.18");
    expect(pesoEstimate("52000", null)).toBeNull();
    expect(pesoEstimate("52000", "")).toBeNull();
  });
  it("tasa variable: el margen en porcentaje pasa a fracción; sin tasa variable no se envía nada", () => {
    expect(variableRateBody(false, "DTF_EA", "abc")).toEqual({ problem: null, body: {} });
    expect(variableRateBody(true, "DTF_EA", "5")).toEqual({ problem: null, body: { index_key: "DTF_EA", margin: "0.05" } });
    expect(variableRateBody(true, "IBR_EA", "0")).toEqual({ problem: null, body: { index_key: "IBR_EA", margin: "0" } });
    expect(variableRateBody(true, "IBR_EA", "x").problem).toBe("margin");
  });
});

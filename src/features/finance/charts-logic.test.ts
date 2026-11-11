import { describe, expect, it } from "vitest";
import { scaleWidths } from "./charts-logic";

describe("anchos de barra", () => {
  it("escala contra el mayor valor absoluto, sin coma flotante", () => {
    expect(scaleWidths(["500.00", "1000.00", "250.00"])).toEqual([50, 100, 25]);
    expect(scaleWidths(["-1000.00", "500.00"])).toEqual([100, 50]);
  });
  it("todo en cero o vacío no divide entre cero", () => {
    expect(scaleWidths(["0.00", null])).toEqual([0, 0]);
    expect(scaleWidths([])).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { formatPercent, percentWidth } from "./percent";

describe("porcentajes de texto", () => {
  it("quita los ceros de relleno y usa la coma en español", () => {
    expect(formatPercent("88.00")).toBe("88 %");
    expect(formatPercent("1.8088", "es", 4)).toBe("1,8088 %");
    expect(formatPercent("1.8088", "en", 4)).toBe("1.8088 %");
  });
  it("redondea mitad hacia arriba al decimal que se muestra, sin pasar por coma flotante", () => {
    expect(formatPercent("1.80875825")).toBe("1,81 %");
    expect(formatPercent("99.995")).toBe("100 %");
    expect(formatPercent("0.004")).toBe("0 %");
  });
  it("marca el negativo con el signo menos tipográfico", () => {
    expect(formatPercent("-12.50")).toBe("−12,5 %");
    expect(formatPercent("-0.001")).toBe("0 %");
  });
  it("un texto que no es decimal se deja tal cual", () => {
    expect(formatPercent("n/a")).toBe("n/a");
  });
  it("el ancho de barra se acota a 0..100", () => {
    expect(percentWidth("88.60")).toBe(88);
    expect(percentWidth("120.00")).toBe(100);
    expect(percentWidth("-5.00")).toBe(0);
    expect(percentWidth("x")).toBe(0);
  });
});

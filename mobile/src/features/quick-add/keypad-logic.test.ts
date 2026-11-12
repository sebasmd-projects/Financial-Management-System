import { displayAmount, fromApiAmount, pressKey, toAmount, type Key } from "./keypad-logic";

const type = (keys: Key[], start = "") => keys.reduce((raw, key) => pressKey(raw, key), start);

describe("teclado numérico propio: construye cadenas decimales sin Number", () => {
  it("teclea cifras y arma el monto de la API", () => {
    expect(type(["1", "8", "0", "0", "0", "0"])).toBe("180000");
    expect(type(["1", "8", "0", "0", "0", "0"])).toBe("180000");
    expect(toAmount("180000")).toBe("180000");
  });
  it("«000» agrega tres ceros solo si ya hay una cifra distinta de cero", () => {
    expect(type(["000"])).toBe("");
    expect(type(["0", "000"])).toBe("0");
    expect(type(["1", "8", "000"])).toBe("18000");
  });
  it("sin ceros a la izquierda", () => {
    expect(type(["0", "0", "5"])).toBe("5");
    expect(type(["0", "7", "0"])).toBe("70");
  });
  it("la coma es el decimal: hasta 2 decimales y solo una vez", () => {
    expect(type(["1", ",", "5"])).toBe("1.5");
    expect(type(["1", ",", "5", "0", "9"])).toBe("1.50");
    expect(type(["1", ",", ",", "5"])).toBe("1.5");
    expect(type([","])).toBe("0.");
    expect(type(["1", ",", "5", "000"])).toBe("1.5");
  });
  it("tope de 13 cifras enteras", () => {
    const thirteen = "1234567890123";
    expect(type(["4"], thirteen)).toBe(thirteen);
    expect(type(["000"], "12345678901")).toBe("12345678901");
    expect(type(["000"], "1234567890")).toBe("1234567890000");
  });
  it("borrar quita una cifra; el cero solitario desaparece", () => {
    expect(type(["back"], "180")).toBe("18");
    expect(type(["back"], "1.5")).toBe("1.");
    expect(type(["back"], "1.")).toBe("1");
    expect(type(["back"], "5")).toBe("");
    expect(type(["back"], "0.")).toBe("");
    expect(type(["back"], "")).toBe("");
  });
  it("monto válido: mayor que cero, sin coma colgante", () => {
    expect(toAmount("")).toBeNull();
    expect(toAmount("0")).toBeNull();
    expect(toAmount("0.")).toBeNull();
    expect(toAmount("0.00")).toBeNull();
    expect(toAmount("1500.")).toBe("1500");
    expect(toAmount("0.5")).toBe("0.5");
  });
  it("lo que llega de la API (plantilla del Resumen) vuelve al teclado sin ceros de más ni signo", () => {
    expect(fromApiAmount("180000.00")).toBe("180000");
    expect(fromApiAmount("180000.50")).toBe("180000.5");
    expect(fromApiAmount("-21704.98")).toBe("21704.98");
    expect(fromApiAmount("0.00")).toBe("");
    expect(fromApiAmount("garbage")).toBe("");
  });
  it("se ve con puntos de miles y coma decimal", () => {
    expect(displayAmount("")).toBe("$0");
    expect(displayAmount("1800")).toBe("$1.800");
    expect(displayAmount("1234567.5")).toBe("$1.234.567,5");
    expect(displayAmount("12.")).toBe("$12,");
  });
  it("un monto largo se conserva exacto (más allá de 2^53)", () => {
    expect(type(["9", "9", "9", "9", "9", "9", "9", "9", "9", "9", "9", "9", "9"])).toBe("9999999999999");
  });
});

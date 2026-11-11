import { describe, expect, it } from "vitest";
import { paths, query } from "./paths";

describe("rutas de la API: nada de montos en la URL", () => {
  it("query omite los vacíos y codifica", () => {
    expect(query({ a: "x y", b: undefined, c: "", d: null, e: 2, f: false })).toBe("?a=x+y&e=2&f=false");
    expect(query({})).toBe("");
  });
  it.each(["amount", "min_amount", "max_amount", "balance", "total_due", "price", "value"])("rechaza la clave «%s»", (key) => {
    expect(() => query({ [key]: "1" })).toThrow(/Montos fuera de la URL/);
  });
  it("ninguna ruta de lectura construida por la interfaz lleva un monto", () => {
    const urls = [paths.accounts(), paths.movements({ type: "expense", from: "2026-11-01", to: "2026-11-30", page: 2 }), paths.summary("2026-11"), paths.fixedExpenses("2026-11"), paths.cardStatements("c", "2026-10"), paths.occurrences({ recurrence: "r" })];
    for (const url of urls) expect(url).not.toMatch(/amount|balance|total|price/i);
  });
  it("los ids se codifican (un id raro no abre otra ruta)", () => {
    expect(paths.movement("../x?y=1")).toBe("/movements/..%2Fx%3Fy%3D1");
  });
});

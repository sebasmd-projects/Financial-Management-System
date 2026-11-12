import { canWrite, PERSONAL, sameScope, scopedPath, scopeKey, type Household } from "./scope";

const home = { kind: "household", id: "h 1" } as const;
const households = [{ id: "h 1", name: "Casa", role: "viewer", members: 2, rotating: false }, { id: "h2", name: "Oficina", role: "editor", members: 1, rotating: false }] as Household[];

describe("ámbito", () => {
  it("en el hogar las rutas de datos cuelgan de households/{id}", () => {
    expect(scopedPath("/movements/search", home)).toBe("/households/h%201/movements/search");
    expect(scopedPath("/dashboard?period=2026-10", home)).toBe("/households/h%201/dashboard?period=2026-10");
  });
  it("lo personal y «Ambos» no se reescriben, y lo que el hogar no sirve tampoco", () => {
    expect(scopedPath("/movements", PERSONAL)).toBe("/movements");
    expect(scopedPath("/movements", { kind: "both", id: "h2" })).toBe("/movements");
    expect(scopedPath("/notifications", home)).toBe("/notifications");
  });
  it("comparar y nombrar", () => {
    expect(sameScope(home, { kind: "household", id: "h 1" })).toBe(true);
    expect(sameScope(home, { kind: "both", id: "h 1" })).toBe(false);
    expect(scopeKey(PERSONAL)).toBe("personal");
    expect(scopeKey({ kind: "both", id: "h2" })).toBe("both:h2");
  });
  it("el visor no escribe en el hogar", () => {
    expect(canWrite(home, households)).toBe(false);
    expect(canWrite({ kind: "household", id: "h2" }, households)).toBe(true);
    expect(canWrite(PERSONAL, households)).toBe(true);
  });
});

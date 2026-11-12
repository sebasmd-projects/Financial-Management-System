import { LOCK_AFTER_MS, shouldCover, shouldLock } from "./policy";

describe("política del bloqueo", () => {
  it("no bloquea si nunca pasó a segundo plano", () => {
    expect(shouldLock(null, 1_000_000)).toBe(false);
  });
  it("bloquea a los 60 s exactos y no antes", () => {
    expect(shouldLock(1000, 1000 + LOCK_AFTER_MS - 1)).toBe(false);
    expect(shouldLock(1000, 1000 + LOCK_AFTER_MS)).toBe(true);
  });
  it("si el reloj se atrasó, bloquea", () => {
    expect(shouldLock(5000, 1000)).toBe(true);
  });
  it("el velo cubre todo lo que no sea primer plano", () => {
    expect(shouldCover("active")).toBe(false);
    expect(shouldCover("inactive")).toBe(true);
    expect(shouldCover("unknown")).toBe(false);
    expect(shouldCover("background")).toBe(true);
  });
});

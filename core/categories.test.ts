import { describe, expect, it } from "vitest";
import { findExisting, fold } from "./categories";

const LIST = [
  { name: "Alimentación", path: ["Alimentación"] },
  { name: "Combustible", path: ["Transporte", "Combustible"] },
];

describe("comparar categorías", () => {
  it("ignora mayúsculas, tildes y espacios de más", () => {
    expect(fold("  SERVICIOS   públicos ")).toBe("servicios publicos");
  });
  it("encuentra por nombre o por ruta y devuelve null si no existe", () => {
    expect(findExisting(LIST, " alimentacion ")).toBe(LIST[0]);
    expect(findExisting(LIST, "transporte › combustible")).toBe(LIST[1]);
    expect(findExisting(LIST, "Gimnasio")).toBeNull();
    expect(findExisting(LIST, "")).toBeNull();
  });
});

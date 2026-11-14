import { describe, expect, it } from "vitest";
import type { Category } from "@/api/models";
import { filterCategories, findExisting, fold, ofKind } from "./category-search";

const cat = (id: string, path: string[], kind: "expense" | "income" = "expense", archived = false): Category =>
  ({ id, name: path[path.length - 1], kind, parent_id: null, path, account_id: "x", default_nature: "", default_classification: "", archived }) as Category;

const ALL = [cat("1", ["Transporte"]), cat("2", ["Transporte", "Combustible"]), cat("3", ["Alimentación"]), cat("4", ["Salario"], "income"), cat("5", ["Viejo"], "expense", true)];

describe("búsqueda de categorías", () => {
  it("fold ignora mayúsculas, tildes y espacios de más", () => {
    expect(fold("  ALIMENTACIÓN  ")).toBe("alimentacion");
    expect(fold("Servicios   públicos")).toBe("servicios publicos");
  });
  it("findExisting encuentra por nombre o por ruta sin importar tildes ni mayúsculas", () => {
    expect(findExisting(ALL, "alimentacion")?.id).toBe("3");
    expect(findExisting(ALL, "combustible")?.id).toBe("2");
    expect(findExisting(ALL, "transporte › combustible")?.id).toBe("2");
    expect(findExisting(ALL, "Gimnasio")).toBeNull();
    expect(findExisting(ALL, "   ")).toBeNull();
  });
  it("ofKind deja el tipo pedido, sin archivadas y ordenado por ruta", () => {
    expect(ofKind(ALL, "expense").map((c) => c.id)).toEqual(["3", "1", "2"]);
    expect(ofKind(ALL, "income").map((c) => c.id)).toEqual(["4"]);
  });
  it("filterCategories pone primero la exacta y las que empiezan igual", () => {
    const list = ofKind(ALL, "expense");
    expect(filterCategories(list, "port").map((c) => c.id)).toEqual(["1", "2"]);
    expect(filterCategories(list, "combus").map((c) => c.id)).toEqual(["2"]);
    expect(filterCategories(list, "")).toHaveLength(3);
    expect(filterCategories(list, "zzz")).toEqual([]);
  });
});

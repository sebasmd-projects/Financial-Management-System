import { describe, expect, it } from "vitest";
import { negotiateLocale } from "./config";
import { en } from "./dictionaries/en";
import { es } from "./dictionaries/es";

function shape(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return [`${path}[${value.length}]`, ...value.flatMap((v, i) => shape(v, `${path}[${i}]`))];
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => shape(v, path ? `${path}.${k}` : k));
  return [path];
}
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("diccionarios", () => {
  it("el inglés tiene las mismas claves que el español (y listas del mismo largo)", () => {
    expect(shape(en)).toEqual(shape(es));
  });
  it("ninguna cadena vacía, y el inglés no copia el español en lo que se ve", () => {
    for (const text of [...strings(es), ...strings(en)]) expect(text.trim().length).toBeGreaterThan(0);
    for (const key of ["activation.title", "landing.heroTitle", "landing.metaTitle", "nav.sections.pagos", "gate.checking", "placeholder.emptyTitle"]) {
      const get = (dict: unknown) => key.split(".").reduce((acc: unknown, k) => (acc as Record<string, unknown>)[k], dict);
      expect(get(en), key).not.toBe(get(es));
    }
  });
});

describe("negociación de idioma (/finanzas, /finance)", () => {
  it.each([
    ["es", "es"],
    ["es-CO,es;q=0.9,en;q=0.5", "es"],
    ["ES-mx", "es"],
    ["en-US,en;q=0.9", "en"],
    ["en;q=0.5, es;q=0.9", "es"],
    ["es;q=0.4, en;q=0.9", "en"],
    ["fr-FR,fr;q=0.9", "en"],
    ["fr, es;q=0.3", "es"],
    ["pt-BR", "en"],
    ["*", "en"],
    ["", "en"],
    ["es;q=0", "en"],
    ["basura;;;", "en"],
  ] as const)("%j → %s", (header, expected) => {
    expect(negotiateLocale(header)).toBe(expected);
  });
  it("sin cabecera → inglés", () => {
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale(undefined)).toBe("en");
  });
});

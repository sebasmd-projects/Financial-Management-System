import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { themes } from "@/test/tokens-css";

// Los valores de `tokens.css` son los de la especificación (docs/design-spec.md §4.1), leídos de su tabla: si alguien
// cambia un color en un lado y no en el otro, falla con el token.
const spec = readFileSync(fileURLToPath(new URL("../../docs/design-spec.md", import.meta.url)), "utf8");
const section = spec.slice(spec.indexOf("### 4.1 Color"), spec.indexOf("### 4.2"));
const hexes = (cell: string) => [...cell.matchAll(/#[0-9A-Fa-f]{6}/g)].map((m) => m[0].toLowerCase());

const expected: Record<"claro" | "oscuro", Record<string, string>> = { claro: {}, oscuro: {} };
for (const line of section.split("\n")) {
  const cells = line.split("|").map((c) => c.trim());
  if (cells.length < 5) continue;
  const names = [...cells[1].matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);
  const light = hexes(cells[2]);
  const dark = hexes(cells[3]);
  if (names.length === 0 || light.length === 0 || light.length !== dark.length) continue;
  // «`primary-container` / `on-…`»: el segundo nombre es `on-<primero>`.
  const tokens = light.length === 2 ? [names[0], `on-${names[0]}`] : [names[0]];
  tokens.forEach((token, i) => {
    expected.claro[token] = light[i];
    expected.oscuro[token] = dark[i];
  });
}
// Paleta categórica: «| 1 añil | `#2F3EB8` | `#A5AEFF` |»
for (const line of spec.slice(spec.indexOf("Paleta categórica"), spec.indexOf("### 4.2")).split("\n")) {
  const cells = line.split("|").map((c) => c.trim());
  const n = /^(\d) /.exec(cells[1] ?? "")?.[1];
  if (n && hexes(cells[2]).length) {
    expected.claro[`chart-${n}`] = hexes(cells[2])[0];
    expected.oscuro[`chart-${n}`] = hexes(cells[3])[0];
  }
}

describe("tokens.css = especificación §4.1", () => {
  it("la tabla de la especificación se leyó entera (27 colores + 8 series)", () => {
    expect(Object.keys(expected.claro).length).toBe(35);
  });
  it.each(Object.keys(expected.claro))("%s (claro y oscuro)", (token) => {
    expect(themes.claro[token], `claro ${token}`).toBe(expected.claro[token]);
    expect(themes["oscuro (fijado)"][token], `oscuro ${token}`).toBe(expected.oscuro[token]);
    expect(themes["oscuro (sistema)"][token], `oscuro (sistema) ${token}`).toBe(expected.oscuro[token]);
  });
});

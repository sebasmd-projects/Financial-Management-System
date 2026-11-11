import { describe, expect, it } from "vitest";
import { contrast, themes } from "@/test/tokens-css";

// Contraste WCAG 2.1 de los pares de docs/design-spec.md §4.1, calculado desde `tokens.css`. Si un token baja de AA
// o se aparta de la cifra publicada en la especificación, la prueba falla con el par, el tema y la relación.
// [primer plano, fondo]: texto ≥ 4,5 : 1.
const text: [string, string][] = [
  ["text-primary", "canvas"], ["text-primary", "surface"], ["text-primary", "surface-2"],
  ["text-secondary", "canvas"], ["text-secondary", "surface"], ["text-secondary", "surface-2"],
  ["text-tertiary", "canvas"], ["text-tertiary", "surface"], ["text-tertiary", "surface-2"],
  ["primary", "canvas"], ["primary", "surface"], ["primary", "surface-2"],
  ["on-primary", "primary"], ["on-primary-container", "primary-container"],
  ["on-accent", "accent"],
  ["positive", "canvas"], ["positive", "surface"], ["on-positive-container", "positive-container"],
  ["negative", "canvas"], ["negative", "surface"], ["on-negative-container", "negative-container"],
  ["warning", "canvas"], ["warning", "surface"], ["on-warning-container", "warning-container"],
  ["info", "canvas"], ["info", "surface"], ["on-info-container", "info-container"],
  ...Array.from({ length: 8 }, (_, i): [string, string] => [`chart-${i + 1}`, "surface"]),
];
// Componentes de interfaz y gráficos ≥ 3 : 1.
const ui: [string, string][] = [["border-strong", "surface"], ["border-strong", "canvas"], ["primary", "surface"], ["accent", "surface"], ["accent", "canvas"]];

// Cifras publicadas en la tabla de §4.1 (claro / oscuro) que se comprueban a ±0,02.
// La especificación da la cifra oscura de los textos secundario y terciario sobre `surface` (8,89 y 6,37).
const darkBackground: Record<string, string> = { "text-secondary/canvas": "surface", "text-tertiary/surface-2": "surface" };
const published: [string, string, number, number][] = [
  ["border-strong", "surface", 3.64, 4.5],
  ["text-primary", "surface", 17.4, 14.9],
  ["text-secondary", "canvas", 7.15, 8.89],
  ["text-tertiary", "surface-2", 4.73, 6.37],
  ["primary", "surface", 8.39, 8.11],
  ["on-primary", "primary", 8.39, 7.4],
  ["on-primary-container", "primary-container", 10.44, 9.13],
  ["on-accent", "accent", 5.82, 7.2],
  ["positive", "surface", 6.1, 9.05],
  ["on-positive-container", "positive-container", 7.93, 8.92],
  ["negative", "surface", 6.54, 7.39],
  ["on-negative-container", "negative-container", 7.5, 10.24],
  ["warning", "surface", 5.93, 10.05],
  ["on-warning-container", "warning-container", 7.34, 9.64],
  ["info", "surface", 6.44, 8.74],
  ["on-info-container", "info-container", 7.64, 9.8],
];

describe("contrastes de los tokens (WCAG 2.1 AA)", () => {
  it("el tema oscuro del sistema y el fijado son idénticos", () => {
    expect(themes["oscuro (sistema)"]).toEqual(themes["oscuro (fijado)"]);
  });
  it("define todos los tokens en ambos temas", () => {
    expect(Object.keys(themes.claro).sort()).toEqual(Object.keys(themes["oscuro (fijado)"]).sort());
  });
  for (const [theme, palette] of Object.entries(themes)) {
    describe(theme, () => {
      it.each(text)("%s sobre %s ≥ 4,5", (fg, bg) => {
        expect(contrast(palette[fg], palette[bg]), `${fg} sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
      });
      it.each(ui)("%s sobre %s ≥ 3", (fg, bg) => {
        expect(contrast(palette[fg], palette[bg]), `${fg} sobre ${bg}`).toBeGreaterThanOrEqual(3);
      });
    });
  }
  it.each(published)("cifra publicada de %s sobre %s: %s / %s", (fg, bg, light, dark) => {
    expect(contrast(themes.claro[fg], themes.claro[bg]), `claro ${fg}/${bg}`).toBeCloseTo(light, 1);
    const darkBg = darkBackground[`${fg}/${bg}`] ?? bg;
    expect(contrast(themes["oscuro (fijado)"][fg], themes["oscuro (fijado)"][darkBg]), `oscuro ${fg}/${darkBg}`).toBeCloseTo(dark, 1);
  });
});

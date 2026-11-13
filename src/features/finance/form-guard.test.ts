import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Vigilante de los formularios financieros: recorre el código fuente y falla si un monto en pesos o una convención de tasa
 * se pintan «a mano» (sin la vista previa, sin los nombres legibles o sin la ayuda), para que no se vuelva a olvidar uno.
 */
const SRC = fileURLToPath(new URL("../..", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}
const files = walk(SRC).map((path) => ({ path, rel: relative(SRC, path), text: readFileSync(path, "utf8") }));
const finance = files.filter((f) => f.rel.startsWith("features/finance/") || f.rel.startsWith("features/household/"));

/** Los campos decimales de `<TextField>` que NO son pesos (porcentajes, tasas, unidades UVR, divisas): su etiqueta, tal como está escrita. */
const NOT_COP = new Set([
  "dict.fin.loans.fields.rate", "dict.fin.uvr.valueUvr", "t.percent", "t.rate", "t.fields.rate", "t.earlyPercent", "t.latePercent",
  "t.monthlyDelta", "t.returnPct", "t.withdrawal", "t.incomePct", "t.variablePct", "u.margin", "u.principalUnits", "u.insurance",
  "t.fields.insurance", "c.form.otherCharges", "c.form.lateRate", "fill(t.rate, { currency: code })", "fill(t.rate, { currency })",
  "fill(t.amount, { currency: code })", "t.rate", "promo ? dict.fin.cardForm.promoRate : t.rate",
]);

/** Los elementos JSX de un tipo, con su texto (hasta el `/>` de cierre a profundidad 0 de llaves). */
function elements(text: string, tag: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf(`<${tag} `, from);
    if (start < 0) return out;
    let depth = 0;
    let p = start + tag.length + 1;
    for (; p < text.length; p++) {
      if (text[p] === "{") depth++;
      else if (text[p] === "}") depth--;
      else if (text[p] === "/" && text[p + 1] === ">" && depth === 0) break;
    }
    out.push(text.slice(start, p + 2));
    from = p + 2;
  }
}
const labelOf = (element: string): string => /label=\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(element)?.[1].trim() ?? "";

describe("formularios financieros", () => {
  it("encuentra los formularios (el vigilante no corre en vacío)", () => {
    expect(finance.length).toBeGreaterThan(40);
    expect(finance.flatMap((f) => elements(f.text, "AmountField")).length).toBeGreaterThan(40);
  });

  it("todo monto en pesos usa AmountField: ningún <input> de monto fuera de kit.tsx", () => {
    const offenders = files.filter((f) => f.rel !== "features/finance/kit.tsx" && /input--amount/.test(f.text)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("AmountField calcula su propia vista previa: nadie la pasa a mano ni se puede apagar", () => {
    const kit = finance.find((f) => f.rel === "features/finance/kit.tsx")!.text;
    expect(kit).toMatch(/data-testid="amount-preview"/);
    expect(kit).not.toMatch(/preview\?:/);
    const manual = finance.flatMap((f) => elements(f.text, "AmountField").filter((el) => /\bpreview=/.test(el)).map(() => f.rel));
    expect(manual).toEqual([]);
  });

  it("un <TextField inputMode=\"decimal\"> es un porcentaje, una tasa, unidades o divisa: si es en pesos, usa AmountField", () => {
    const found: { rel: string; label: string }[] = [];
    for (const f of finance) {
      for (const el of elements(f.text, "TextField")) {
        if (/inputMode="decimal"/.test(el)) found.push({ rel: f.rel, label: labelOf(el) });
      }
    }
    expect(found.length).toBeGreaterThan(10);
    const unknown = found.filter((x) => !NOT_COP.has(x.label)).map((x) => `${x.rel}: ${x.label}`);
    expect(unknown, "Un campo decimal nuevo: si es dinero en pesos usa <AmountField> (con vista previa); si no lo es, añade su etiqueta a NOT_COP.").toEqual([]);
  });

  it("toda convención de tasa se elige con ConventionSelect (nombres completos y ayuda), no con un <select> de siglas", () => {
    const offenders = finance.filter((f) => f.rel !== "features/finance/conventions.tsx" && /RATE_CONVENTIONS\.map/.test(f.text)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("una convención nunca se muestra como sigla suelta: se pasa por useConventionLabel", () => {
    const offenders = finance
      .filter((f) => / \$\{[\w.]*convention\}|(?:^|[\s>])\{[\w.]*convention\}/m.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { es } from "@/i18n/dictionaries/es";
import { I18nProvider } from "@/i18n/provider";
import { Badge, Money, Progress, Segmented, SpentFigure, TextField } from "./kit";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const wrap = (locale: "es" | "en", node: React.ReactNode) => renderToStaticMarkup(<I18nProvider locale={locale} dict={locale === "es" ? es : en}>{node}</I18nProvider>);

describe("Money", () => {
  it("muestra el formato único y da al lector de pantalla el valor completo en palabras", () => {
    const html = wrap("es", <Money value="-1200000.00" />);
    expect(html).toContain('<span aria-hidden="true">−$1.200.000</span>');
    expect(html).toContain("menos 1200000 pesos");
  });
  it("en inglés el lector dice pesos colombianos", () => {
    expect(wrap("en", <Money value="450.50" kind="egreso" />)).toContain("expense of 450.50 Colombian pesos");
  });
  it("el signo siempre va escrito (el color no es la única señal)", () => {
    expect(wrap("es", <Money value="5200000" sign="always" tone="positive" />)).toContain("+$5.200.000");
  });
});

describe("«Gastado» de una compra a cuotas", () => {
  it("costo total real GRANDE (naranja) y valor de la compra pequeño (rojo), con rótulo escrito, en el mismo cuadro", () => {
    const html = wrap("es", <SpentFigure totalRealCost="1275969.00" purchaseValue="1200000.00" />);
    const total = html.indexOf("spent__total");
    const purchase = html.indexOf("spent__purchase");
    expect(total).toBeGreaterThan(-1);
    expect(purchase).toBeGreaterThan(total);
    expect(html).toContain("Costo real");
    expect(html).toContain("$1.275.969");
    expect(html).toContain("Valor de la compra");
    expect(html).toContain("$1.200.000");
    expect(html.match(/class="spent"/g)).toHaveLength(1);
  });
  it("los estilos: el total usa la fuente KPI y el naranja de la paleta; la compra, el rojo negativo", () => {
    const css = readFileSync(fileURLToPath(new URL("./finance.css", import.meta.url)), "utf8");
    expect(css).toMatch(/\.spent__total\s*\{[^}]*var\(--text-kpi\)[^}]*var\(--chart-7\)/);
    expect(css).toMatch(/\.spent__purchase\s*\{[^}]*var\(--color-negative\)/);
  });
});

describe("campos accesibles", () => {
  it("la etiqueta se asocia al campo y los errores se anuncian", () => {
    const html = wrap("es", <TextField label="Nombre" value="" onChange={() => undefined} required error="Falta" />);
    expect(html).toMatch(/<label for="([^"]+)"[^>]*>Nombre/);
    expect(html).toMatch(/aria-invalid="true"/);
    expect(html).toMatch(/aria-describedby="[^"]+-error"/);
  });
  it("Segmented es un grupo de radios con leyenda", () => {
    const html = wrap("es", <Segmented legend="Tipo" options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} value="a" onChange={() => undefined} />);
    expect(html).toContain("<fieldset");
    expect(html).toContain("<legend");
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toMatch(/checked="" value="a"/);
  });
  it("Progress expone su valor", () => {
    expect(wrap("es", <Progress percent={150} label="Uso" />)).toContain('aria-valuenow="100"');
  });
  it("Badge", () => {
    expect(wrap("es", <Badge tone="info">Exenta</Badge>)).toContain("badge--info");
  });
});

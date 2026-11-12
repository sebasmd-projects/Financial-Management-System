import { readFileSync } from "node:fs";
import { join } from "node:path";
import { darkColors, lightColors } from "./tokens";

// Los tokens de la web son la fuente: `src/ui/tokens.css` (en la raíz del repositorio).
const css = readFileSync(join(__dirname, "../../../src/ui/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function block(header: string): string {
  const open = css.indexOf("{", css.indexOf(header));
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(header);
}
const camel = (name: string) => name.replace(/^color-/, "").replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const colors = (source: string) => Object.fromEntries([...source.matchAll(/--((?:color|chart)-[a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)].map(([, name, hex]) => [camel(name), hex.toLowerCase()]));

describe("tokens de diseño", () => {
  it("el tema claro es el de la web", () => {
    expect(lightColors).toEqual(colors(block(":root {")));
  });
  it("el tema oscuro es el de la web", () => {
    expect(darkColors).toEqual(colors(block(':root[data-theme="dark"] {')));
  });
});

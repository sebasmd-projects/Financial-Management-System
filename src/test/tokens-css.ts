import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Lee `tokens.css` y calcula contrastes WCAG 2.1 para las pruebas de tokens.
const css = readFileSync(fileURLToPath(new URL("../ui/tokens.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function blockAfter(source: string, header: string): string {
  const start = source.indexOf(header);
  if (start === -1) throw new Error(`No se encontró el bloque «${header}»`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`El bloque «${header}» no se cierra`);
}

const colors = (block: string): Record<string, string> =>
  Object.fromEntries([...block.matchAll(/--((?:color|chart)-[a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)].map(([, name, hex]) => [name.replace(/^color-/, ""), hex.toLowerCase()]));

export const themes: Record<string, Record<string, string>> = {
  claro: colors(blockAfter(css, ":root {")),
  "oscuro (sistema)": colors(blockAfter(blockAfter(css, "@media (prefers-color-scheme: dark)"), ':root:not([data-theme="light"]) {')),
  "oscuro (fijado)": colors(blockAfter(css, ':root[data-theme="dark"] {')),
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}


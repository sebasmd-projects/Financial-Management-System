import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Redes de seguridad sobre el TEXTO de `src/` (AGENTS.md: seguridad primero). ESLint dice lo mismo (`eslint.config.mjs`),
// pero un `// eslint-disable` lo apaga y esta prueba no: si alguien lo hace, falla aquí.
const SRC = fileURLToPath(new URL(".", import.meta.url));
const ROOT = fileURLToPath(new URL("..", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const rel = (path: string) => relative(ROOT, path).split("\\").join("/");
const all = walk(SRC);
const isTest = (path: string) => /\.test\.(ts|tsx)$/.test(path) || rel(path).startsWith("src/test/");
const code = all.filter((path) => /\.(ts|tsx)$/.test(path) && !isTest(path));
const styles = all.filter((path) => path.endsWith(".css"));

/** Sin comentarios (los de bloque y los `//` precedidos de espacio o de inicio de línea, que no son parte de una URL). */
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
const read = (path: string) => strip(readFileSync(path, "utf8"));

const THEME_STORAGE = "src/ui/theme/storage.ts";
const PUSH_MODULE = "src/features/finance/notifications/push.ts";
const SW_SOURCE = "src/features/finance/notifications/sw-source.ts";

describe("nada financiero en el navegador", () => {
  it("localStorage, sessionStorage, IndexedDB y Cache API solo en la preferencia de tema", () => {
    const offenders = code.filter((path) => rel(path) !== THEME_STORAGE && /\b(localStorage|sessionStorage|indexedDB|openDatabase|caches\s*\.)/.test(read(path)));
    expect(offenders.map(rel)).toEqual([]);
  });
  it("la preferencia de tema guarda una sola clave con un valor de tres posibles", () => {
    const source = readFileSync(join(ROOT, THEME_STORAGE), "utf8");
    expect([...source.matchAll(/localStorage\.setItem\(([^,]+),/g)].map((m) => m[1])).toEqual(["THEME_KEY"]);
  });
  it("ninguna cookie se escribe desde JavaScript", () => {
    expect(code.filter((path) => /document\.cookie\s*=[^=]/.test(read(path))).map(rel)).toEqual([]);
  });
  it("nada en consola", () => {
    expect(code.filter((path) => /\bconsole\s*\./.test(read(path))).map(rel)).toEqual([]);
  });
  it("el almacenamiento persistente no existe, y el service worker solo se registra desde el módulo de Web Push", () => {
    expect(code.filter((path) => /navigator\.storage/.test(read(path))).map(rel)).toEqual([]);
    expect(code.filter((path) => rel(path) !== PUSH_MODULE && /serviceWorker/.test(read(path))).map(rel)).toEqual([]);
  });
  it("el código del service worker no puede interceptar ni guardar nada", () => {
    const source = read(join(ROOT, SW_SOURCE));
    expect(source).not.toMatch(/["']fetch["']|\bcaches\b|indexedDB|localStorage|sessionStorage/);
  });
  it("ningún módulo guarda la carga de un push ni lo que sea de la suscripción", () => {
    expect(read(join(ROOT, PUSH_MODULE))).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\s*\./);
  });
});

describe("el dinero no pasa por Number", () => {
  it("ni parseFloat, Number(), toFixed, toLocaleString ni NumberFormat en el código de la app", () => {
    const offenders = code.filter((path) => /\bparseFloat\b|\bNumber\s*\(|\.toFixed\s*\(|\.toLocaleString\s*\(|\bNumberFormat\b|\bparseInt\b/.test(read(path)));
    expect(offenders.map(rel)).toEqual([]);
  });
  it("money.ts no usa Math ni Intl", () => {
    expect(read(join(ROOT, "src/lib/money.ts"))).not.toMatch(/\bMath\.|\bIntl\b/);
  });
});

describe("nada de terceros", () => {
  it("el código y los estilos no cargan nada de otro origen", () => {
    // Excepciones: los espacios de nombres XML del sitemap (identificadores, no se descargan) y el origen de desarrollo.
    const external = /https?:\/\/(?!localhost[:"']|www\.sitemaps\.org\/|www\.w3\.org\/)[^\s"'`)]+/;
    const offenders = [...code, ...styles].filter((path) => external.test(read(path)));
    expect(offenders.map(rel)).toEqual([]);
  });
  it("sin fuentes de Google ni CDN", () => {
    const offenders = [...code, ...styles].filter((path) => /googleapis|gstatic|jsdelivr|unpkg|cdnjs|next\/font\/google/.test(readFileSync(path, "utf8")));
    expect(offenders.map(rel).filter((p) => !p.endsWith("guards.test.ts"))).toEqual([]);
  });
});

describe("dependencias", () => {
  it("todas con versión exacta (sin ^ ni ~) y sin analítica ni librerías de dinero con Number", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    const entries = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(entries.filter(([, version]) => !/^\d+\.\d+\.\d+$/.test(version))).toEqual([]);
    const names = entries.map(([name]) => name);
    expect(names.filter((name) => /analytics|sentry|gtag|segment|mixpanel|hotjar|bignumber|big\.js|decimal\.js|currency/.test(name))).toEqual([]);
  });
});

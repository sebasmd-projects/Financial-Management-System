import { locales, type Locale } from "@/i18n/config";
import { alternatePath } from "@/nav/routes";
import { ASSET_PREFIX, rootPath } from "@/config/paths";

const FALLBACK_ORIGIN = "http://localhost:3100";

/**
 * El origen público (`SITE_URL`, el mismo del CV). Se lee en cada petición (las páginas son dinámicas), así que la
 * imagen no lo lleva dentro. Solo http(s), sin ruta ni barra final; si falta o no vale, el de desarrollo.
 */
export function siteOrigin(raw: string | undefined = process.env.SITE_URL): string {
  try {
    const url = new URL(raw?.trim() ?? "");
    if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
  } catch {
    // cae al de desarrollo
  }
  return FALLBACK_ORIGIN;
}

export interface Alternates {
  canonical: string;
  /** `es`, `en` y `x-default` (el inglés, que es el idioma de respaldo). */
  languages: Record<string, string>;
}

/** Canonical y `hreflang` de una página de la app, con URLs absolutas. `pathname` es la ruta en su propio idioma. */
export function alternatesFor(pathname: string, current: Locale, origin: string): Alternates {
  const abs = (path: string) => `${origin}${path}`;
  const languages: Record<string, string> = {};
  for (const locale of locales) languages[locale] = abs(locale === current ? pathname : alternatePath(pathname, locale));
  languages["x-default"] = languages.en;
  return { canonical: abs(pathname), languages };
}

/** Las dos páginas de aterrizaje, con su canonical y sus alternativas: lo único que se indexa. */
export function landingEntries(origin: string): { loc: string; languages: Record<string, string> }[] {
  return locales.map((locale) => ({ loc: `${origin}${rootPath(locale)}`, languages: alternatesFor(rootPath(locale), locale, origin).languages }));
}

const xml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** `sitemap.xml` solo de las páginas de aterrizaje (con `xhtml:link` de cada idioma y `x-default`). */
export function buildSitemap(origin: string): string {
  const urls = landingEntries(origin)
    .map(
      ({ loc, languages }) =>
        `  <url>\n    <loc>${xml(loc)}</loc>\n` +
        Object.entries(languages)
          .map(([lang, href]) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${xml(href)}"/>`)
          .join("\n") +
        `\n  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

/** Las reglas de `robots.txt` del FMS: la página de aterrizaje sí; todo lo de dentro (la app privada) no. */
export function buildRobots(origin: string): string {
  const lines = ["User-agent: *"];
  for (const locale of locales) lines.push(`Allow: ${rootPath(locale)}$`);
  for (const locale of locales) lines.push(`Disallow: ${rootPath(locale)}/`);
  lines.push("Disallow: /finanzas/", "Disallow: /finance/", "", `Sitemap: ${origin}${ASSET_PREFIX}/sitemap.xml`);
  return `${lines.join("\n")}\n`;
}

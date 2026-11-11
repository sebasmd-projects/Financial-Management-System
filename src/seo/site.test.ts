import { describe, expect, it } from "vitest";
import { alternatesFor, buildRobots, buildSitemap, landingEntries, siteOrigin } from "./site";

const ORIGIN = "https://example.test";

describe("origen público", () => {
  it("solo http(s), sin ruta ni barra final; si no, el de desarrollo", () => {
    expect(siteOrigin("https://example.test/")).toBe("https://example.test");
    expect(siteOrigin("https://example.test/algo?x=1")).toBe("https://example.test");
    expect(siteOrigin("javascript:alert(1)")).toBe("http://localhost:3100");
    expect(siteOrigin("")).toBe("http://localhost:3100");
    expect(siteOrigin(undefined)).toBe("http://localhost:3100");
  });
});

describe("canonical y hreflang", () => {
  it("la raíz: es, en y x-default → inglés; canonical = la propia", () => {
    expect(alternatesFor("/es/finanzas", "es", ORIGIN)).toEqual({
      canonical: "https://example.test/es/finanzas",
      languages: { es: "https://example.test/es/finanzas", en: "https://example.test/en/finance", "x-default": "https://example.test/en/finance" },
    });
    expect(alternatesFor("/en/finance", "en", ORIGIN).canonical).toBe("https://example.test/en/finance");
  });
  it("una pantalla: cada idioma con su slug; x-default sigue siendo el inglés", () => {
    expect(alternatesFor("/es/finanzas/pagos/fijos", "es", ORIGIN)).toEqual({
      canonical: "https://example.test/es/finanzas/pagos/fijos",
      languages: {
        es: "https://example.test/es/finanzas/pagos/fijos",
        en: "https://example.test/en/finance/payments/fixed",
        "x-default": "https://example.test/en/finance/payments/fixed",
      },
    });
    const fromEn = alternatesFor("/en/finance/transactions/42/entries", "en", ORIGIN);
    expect(fromEn.languages.es).toBe("https://example.test/es/finanzas/movimientos/42/asientos");
    expect(fromEn.canonical).toBe("https://example.test/en/finance/transactions/42/entries");
  });
});

describe("sitemap.xml y robots.txt: solo la página de aterrizaje", () => {
  it("dos URLs, cada una con sus alternativas y x-default", () => {
    expect(landingEntries(ORIGIN).map((e) => e.loc)).toEqual(["https://example.test/es/finanzas", "https://example.test/en/finance"]);
    const xml = buildSitemap(ORIGIN);
    expect(xml.match(/<url>/g)).toHaveLength(2);
    expect(xml).toContain("<loc>https://example.test/es/finanzas</loc>");
    expect(xml).toContain("<loc>https://example.test/en/finance</loc>");
    expect(xml).toContain('hreflang="x-default" href="https://example.test/en/finance"');
    expect(xml).toContain('hreflang="es" href="https://example.test/es/finanzas"');
    expect(xml).not.toMatch(/pagos|payments|movimientos|transactions/);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });
  it("robots: permite la raíz, prohíbe lo de dentro y las rutas sin idioma, e indica el sitemap", () => {
    const robots = buildRobots(ORIGIN);
    expect(robots).toContain("Allow: /es/finanzas$");
    expect(robots).toContain("Allow: /en/finance$");
    expect(robots).toContain("Disallow: /es/finanzas/");
    expect(robots).toContain("Disallow: /en/finance/");
    expect(robots).toContain("Disallow: /finanzas/");
    expect(robots).toContain("Sitemap: https://example.test/_fms/sitemap.xml");
  });
});

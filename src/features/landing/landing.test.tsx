import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { en } from "@/i18n/dictionaries/en";
import { Landing } from "./landing";

describe("página de aterrizaje", () => {
  const html = { es: renderToStaticMarkup(<Landing locale="es" />), en: renderToStaticMarkup(<Landing locale="en" />) };

  it("explica lo gratis, la seguridad y las funciones, en cada idioma", () => {
    expect(html.es).toContain(es.landing.heroTitle);
    expect(html.es).toContain("Cifrado por persona");
    expect(html.es).toContain("Verificación en dos pasos obligatoria");
    expect(html.es).toContain("Un resumen sin desplazarte");
    expect(html.es).toContain("Sin suscripciones");
    expect(html.en).toContain(en.landing.heroTitle);
    expect(html.en).toContain("Encrypted per person");
    expect(html.en).toContain("Mandatory two-step verification");
    expect(html.en).toContain("A summary without scrolling");
  });
  it("«Iniciar sesión / Crear cuenta» van al login y al registro del CV con next=<la landing>", () => {
    expect(html.es).toContain('href="/es/account/login?next=%2Fes%2Ffinanzas"');
    expect(html.es).toContain('href="/es/account/signup?next=%2Fes%2Ffinanzas"');
    expect(html.es).toContain("Iniciar sesión");
    expect(html.es).toContain("Crear cuenta");
    expect(html.en).toContain('href="/en/account/login?next=%2Fen%2Ffinance"');
    expect(html.en).toContain('href="/en/account/signup?next=%2Fen%2Ffinance"');
    expect(html.en).toContain("Sign in");
    expect(html.en).toContain("Create account");
  });
  it("enlaza al otro idioma con hreflang y a términos y privacidad del CV", () => {
    expect(html.es).toMatch(/href="\/en\/finance" hreflang="en"/i);
    expect(html.en).toContain('href="/es/finanzas"');
    expect(html.es).toContain('href="/es/terms"');
    expect(html.en).toContain('href="/en/privacy"');
  });
  it("un solo h1, main#contenido y nada de datos de nadie (sin cookies, sesión ni nombres)", () => {
    for (const text of Object.values(html)) {
      expect(text.match(/<h1/g)).toHaveLength(1);
      expect(text).toContain('<main id="contenido"');
      expect(text).not.toMatch(/Ana Prueba|example\.test|csrf|session|display_name/i);
    }
  });
  it("el HTML es el mismo siempre: depende solo del idioma", () => {
    expect(renderToStaticMarkup(<Landing locale="es" />)).toBe(html.es);
  });
});

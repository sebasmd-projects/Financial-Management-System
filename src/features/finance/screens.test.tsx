import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { es } from "@/i18n/dictionaries/es";
import { I18nProvider } from "@/i18n/provider";
import { ROUTES, routeById } from "@/nav/routes";
import { IMPLEMENTED } from "./implemented";
import { FinanceScreen } from "./screens";

// Fuera de Next no hay enrutador: las pantallas solo necesitan los parámetros de búsqueda y `useRouter`.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/es/finanzas",
}));

const PARAMS = ["11111111-1111-4111-8111-111111111111", "2026-11"];

describe("pantallas de FMS-1", () => {
  it("todas las que se anuncian existen en la tabla de rutas (los dos idiomas) y tienen título", () => {
    for (const id of IMPLEMENTED) {
      expect(ROUTES.some((r) => r.id === id), id).toBe(true);
      expect(es.screens[id], id).toBeTruthy();
      expect(en.screens[id], id).toBeTruthy();
      expect(routeById(id).es).toBeTruthy();
    }
  });

  describe.each([
    ["es", es],
    ["en", en],
  ] as const)("primer pintado en %s (sin datos todavía: cargando, nunca datos inventados)", (locale, dict) => {
    it.each([...IMPLEMENTED])("%s", (id) => {
      const html = renderToStaticMarkup(
        <I18nProvider locale={locale} dict={dict}>
          <FinanceScreen routeId={id} params={PARAMS} />
        </I18nProvider>,
      );
      expect(html.match(/<h1/g), "un solo h1").toHaveLength(1);
      expect(html).not.toMatch(/NaN|undefined|\[object|\$\d/);
    });
  });

  it("el formulario de movimiento no pinta nada financiero hasta que llegan las cuentas", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="es" dict={es}>
        <FinanceScreen routeId="movimiento-nuevo" params={[]} />
      </I18nProvider>,
    );
    expect(html).toContain("Nuevo movimiento");
    expect(html).toContain('role="status"');
    expect(html).not.toContain("<form");
  });
});

import { describe, expect, it } from "vitest";
import { locales } from "@/i18n/config";
import { en } from "@/i18n/dictionaries/en";
import { es } from "@/i18n/dictionaries/es";
import { alternatePath, fmsHref, isItemActive, isSectionActive, matchRoute, parseFmsPath, ROUTES, routeById, routePath, SECTIONS, sectionOf } from "./routes";
import { alternatePathFromRoot } from "./legacy";
import { normalize, searchScreens } from "./search";

describe("árbol del propietario (diseño §1.1)", () => {
  it("8 secciones en el orden y con los nombres del propietario", () => {
    expect(SECTIONS.map((s) => es.nav.sections[s.id])).toEqual([
      "Resumen financiero",
      "Movimientos",
      "Cuentas y tarjetas",
      "Pagos y recurrencias",
      "Créditos y obligaciones",
      "Presupuestos y metas",
      "Informes y analítica",
      "Configuración financiera",
    ]);
  });
  it("subelementos del diseño", () => {
    const labels = (id: string) => SECTIONS.find((s) => s.id === id)!.items.map((i) => es.nav.items[i.id]);
    expect(labels("movimientos")).toEqual(["Ingresos", "Egresos", "Transferencias", "Historial", "Compartidos"]);
    expect(labels("cuentas")).toEqual(["Bancos", "Efectivo", "Débito", "Crédito", "Importar extracto"]);
    expect(labels("pagos")).toEqual(["Suscripciones", "Gastos fijos", "Calendario"]);
    expect(labels("creditos")).toEqual(["Préstamos", "Cuotas", "Intereses", "Amortizaciones", "Deudas personales"]);
    expect(labels("plan")).toEqual(["Presupuestos", "Ahorro", "Objetivos"]);
    expect(labels("informes")).toEqual(["Estadísticas", "Proyecciones", "Patrimonio"]);
    expect(labels("config")).toEqual(["Categorías", "Etiquetas", "Instituciones", "Monedas", "Reglas", "Parámetros Colombia", "Auditoría"]);
    expect(labels("resumen")).toEqual([]);
  });
  it("todo subelemento tiene texto en los dos idiomas y su ruta existe", () => {
    for (const section of SECTIONS) {
      expect(routeById(section.route)).toBeTruthy();
      for (const item of section.items) {
        expect(es.nav.items[item.id], item.id).toBeTruthy();
        expect(en.nav.items[item.id], item.id).toBeTruthy();
        expect(routeById(item.route), item.id).toBeTruthy();
      }
    }
  });
  it("cada ruta tiene título en los dos idiomas", () => {
    for (const route of ROUTES) {
      expect(es.screens[route.id], route.id).toBeTruthy();
      expect(en.screens[route.id], route.id).toBeTruthy();
    }
  });
});

describe("tabla única de rutas", () => {
  const params = (pattern: string) => (pattern.match(/\[[^\]]+\]/g) ?? []).join("");
  it("ids únicos y patrones únicos por idioma", () => {
    expect(new Set(ROUTES.map((r) => r.id)).size).toBe(ROUTES.length);
    for (const locale of locales) expect(new Set(ROUTES.map((r) => r[locale])).size, locale).toBe(ROUTES.length);
  });
  it("los dos idiomas tienen los mismos parámetros en el mismo orden", () => {
    for (const route of ROUTES) expect(params(route.es), route.id).toBe(params(route.en));
  });
  it("el primer segmento traducido de cada sección", () => {
    const first = (locale: "es" | "en", id: string) => routeById(SECTIONS.find((s) => s.id === id)!.route as never)[locale].split("/")[1];
    expect(["movimientos", "cuentas", "pagos", "creditos", "plan", "informes"].map((s) => first("es", s))).toEqual(["movimientos", "cuentas", "pagos", "creditos", "presupuestos", "informes"]);
    expect(["movimientos", "cuentas", "pagos", "creditos", "plan", "informes"].map((s) => first("en", s))).toEqual(["transactions", "accounts", "payments", "loans", "budgets", "reports"]);
    expect(routeById("config-categorias").es).toBe("/configuracion/categorias");
    expect(routeById("config-categorias").en).toBe("/settings/categories");
  });
  it("las subrutas de Movimientos son las del propietario", () => {
    expect(["movimientos-ingresos", "movimientos-egresos", "movimientos-transferencias", "movimientos-historial"].map((id) => routeById(id as never).es)).toEqual([
      "/movimientos/ingresos",
      "/movimientos/egresos",
      "/movimientos/transferencias",
      "/movimientos/historial",
    ]);
    expect(["movimientos-ingresos", "movimientos-egresos", "movimientos-transferencias", "movimientos-historial"].map((id) => routeById(id as never).en)).toEqual([
      "/transactions/income",
      "/transactions/expenses",
      "/transactions/transfers",
      "/transactions/history",
    ]);
  });
  it("ida y vuelta: cada ruta, en cada idioma, se resuelve a sí misma", () => {
    for (const route of ROUTES) {
      for (const locale of locales) {
        const sample = (route[locale].match(/\[[^\]]+\]/g) ?? []).map((p) => (p.includes("|") ? p.slice(1, -1).split("|")[0] : p === "[periodo]" ? "2026-11" : "x1"));
        const path = routePath(locale, route.id, sample);
        expect(matchRoute(locale, path)?.route.id, `${locale} ${path}`).toBe(route.id);
        expect(matchRoute(locale, path)?.params, `${locale} ${path}`).toEqual(sample);
      }
    }
  });
  it("sin montos en la URL (AGENTS.md)", () => {
    for (const route of ROUTES) expect(`${route.es} ${route.en}`).not.toMatch(/monto|amount/i);
  });
});

describe("URLs completas y cambio de idioma", () => {
  it("fmsHref", () => {
    expect(fmsHref("es", "resumen")).toBe("/es/finanzas");
    expect(fmsHref("en", "resumen")).toBe("/en/finance");
    expect(fmsHref("es", "pagos-fijos")).toBe("/es/finanzas/pagos/fijos");
    expect(fmsHref("en", "movimiento-asientos", ["42"])).toBe("/en/finance/transactions/42/entries");
    expect(fmsHref("en", "tarjeta-extracto", ["3", "2026-11"])).toBe("/en/finance/cards/3/statements/2026-11");
  });
  it.each([
    ["/es/finanzas", "en", "/en/finance"],
    ["/en/finance", "es", "/es/finanzas"],
    ["/es/finanzas/pagos/fijos", "en", "/en/finance/payments/fixed"],
    ["/en/finance/payments/fixed", "es", "/es/finanzas/pagos/fijos"],
    ["/es/finanzas/movimientos/42/asientos", "en", "/en/finance/transactions/42/entries"],
    ["/en/finance/reports/net-worth/assets/8", "es", "/es/finanzas/informes/patrimonio/activos/8"],
    ["/es/finanzas/configuracion/parametros", "en", "/en/finance/settings/parameters"],
    ["/es/finanzas/creditos/simuladores/abono-extra", "en", "/en/finance/loans/simulators/extra-payment"],
    ["/es/finanzas/presupuestos/objetivos/5", "en", "/en/finance/budgets/goals/5"],
    ["/es/finanzas/no-existe", "en", "/en/finance"],
    ["/otra/cosa", "en", "/en/finance"],
  ] as const)("%s → %s", (from, to, expected) => {
    expect(alternatePath(from, to)).toBe(expected);
  });
  it("los slugs de un idioma no valen en el otro", () => {
    expect(parseFmsPath("/es/finanzas/transactions")?.match).toBeNull();
    expect(parseFmsPath("/en/finance/movimientos")?.match).toBeNull();
    expect(parseFmsPath("/es/finance")).toBeNull();
    expect(parseFmsPath("/en/finanzas")).toBeNull();
    expect(parseFmsPath("/fr/finance")).toBeNull();
  });
  it("la raíz es la página de aterrizaje", () => {
    expect(parseFmsPath("/es/finanzas")).toMatchObject({ locale: "es", isLanding: true });
    expect(parseFmsPath("/en/finance/")).toMatchObject({ locale: "en", isLanding: true });
    expect(parseFmsPath("/en/finance/payments")?.isLanding).toBe(false);
  });
  it("rutas sin idioma (/finanzas, /finance) → la equivalente completa", () => {
    expect(alternatePathFromRoot("es", "/pagos/fijos", "en")).toBe("/en/finance/payments/fixed");
    expect(alternatePathFromRoot("en", "/payments/fixed", "es")).toBe("/es/finanzas/pagos/fijos");
    expect(alternatePathFromRoot("es", "/payments/fixed", "en")).toBe("/en/finance/payments/fixed");
    expect(alternatePathFromRoot("es", "/", "en")).toBe("/en/finance");
    expect(alternatePathFromRoot("es", "/nada", "es")).toBe("/es/finanzas");
  });
});

describe("rutas profundas", () => {
  it.each([
    ["es", "/", "resumen"],
    ["es", "/movimientos", "movimientos"],
    ["es", "/movimientos/nuevo", "movimiento-nuevo"],
    ["en", "/transactions/new", "movimiento-nuevo"],
    ["es", "/movimientos/42", "movimiento"],
    ["es", "/movimientos/compartidos/ana", "compartidos-persona"],
    ["en", "/transactions/shared/ana", "compartidos-persona"],
    ["es", "/tarjetas/3/extractos/2026-11", "tarjeta-extracto"],
    ["en", "/cards/3/statements/2026-11", "tarjeta-extracto"],
    ["es", "/pagos/recurrencias/nueva", "pagos-recurrencia-nueva"],
    ["en", "/payments/recurring/5", "pagos-recurrencia"],
    ["es", "/creditos/simuladores/compra-tarjeta", "simulador-compra-tarjeta"],
    ["en", "/loans/simulators/card-purchase", "simulador-compra-tarjeta"],
    ["es", "/presupuestos/ahorro", "plan-ahorro"],
    ["es", "/presupuestos/2", "plan-presupuesto"],
    ["en", "/budgets/indicators", "plan-indicadores"],
    ["es", "/informes/flujo-de-caja", "informe"],
    ["en", "/reports/projections", "informes-proyecciones"],
    ["es", "/configuracion/auditoria", "config-auditoria"],
    ["en", "/settings/audit", "config-auditoria"],
    ["en", "/welcome/3", "bienvenida"],
  ] as const)("%s %s → %s", (locale, path, id) => {
    expect(matchRoute(locale, path)?.route.id).toBe(id);
  });
  it("lo estático gana a lo dinámico", () => {
    expect(matchRoute("es", "/movimientos/historial")?.route.id).toBe("movimientos-historial");
    expect(matchRoute("en", "/reports/statistics")?.route.id).toBe("informes-estadisticas");
    expect(matchRoute("es", "/presupuestos/objetivos")?.route.id).toBe("plan-objetivos");
  });
  it("lo que no está en la tabla no existe", () => {
    for (const path of ["/zzz", "/configuracion/otra", "/bienvenida/6", "/tarjetas/3/extractos/ayer", "/movimientos/1/2/3", "/movimientos/a b", "/movimientos/<script>", "/informes/../x"]) {
      expect(matchRoute("es", path), path).toBeNull();
    }
    expect(matchRoute("en", "/settings/categorias")).toBeNull();
  });
  it("sección de cada ruta", () => {
    expect(sectionOf("/es/finanzas/tarjetas/3")).toBe("cuentas");
    expect(sectionOf("/en/finance/profile")).toBeNull();
    expect(sectionOf("/en/finance/zzz")).toBeNull();
  });
});

describe("activo en el menú", () => {
  const item = (id: string) => SECTIONS.flatMap((s) => s.items).find((i) => i.id === id)!;
  it("subelementos por pantalla, en los dos idiomas", () => {
    expect(isItemActive(item("egresos"), "/es/finanzas/movimientos/egresos")).toBe(true);
    expect(isItemActive(item("egresos"), "/en/finance/transactions/expenses")).toBe(true);
    expect(isItemActive(item("ingresos"), "/es/finanzas/movimientos/egresos")).toBe(false);
    expect(isItemActive(item("prestamos"), "/en/finance/loans")).toBe(true);
  });
  it("secciones", () => {
    expect(isSectionActive(SECTIONS[0], "/es/finanzas")).toBe(true);
    expect(isSectionActive(SECTIONS[0], "/es/finanzas/pagos")).toBe(false);
    expect(isSectionActive(SECTIONS[2], "/en/finance/cards/3/pay")).toBe(true);
  });
});

describe("buscador de pantallas", () => {
  it("sin tildes ni mayúsculas", () => {
    expect(normalize("  Parámetros Colombia ")).toBe("parametros colombia");
    const hits = searchScreens("PARAMETROS", es);
    expect(hits.map((h) => h.section.id)).toEqual(["config"]);
    expect(hits[0].items.map((i) => i.id)).toEqual(["parametros"]);
  });
  it("si coincide la sección se listan todos sus subelementos; vacío lista todo", () => {
    const hits = searchScreens("cuentas", es);
    expect(hits[0].section.id).toBe("cuentas");
    expect(hits[0].items).toHaveLength(5);
    expect(searchScreens("", es)).toHaveLength(8);
    expect(searchScreens("zzzz", es)).toEqual([]);
    expect(searchScreens("payments", en)[0].section.id).toBe("pagos");
  });
});

import { describe, expect, it } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { es } from "@/i18n/dictionaries/es";
import { isItemActive, isSectionActive, matchRoute, NEW_MOVEMENT_HREF, ROUTES, SECTIONS, sectionOf } from "./routes";
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
  it("todo subelemento tiene texto en español e inglés y su ruta existe", () => {
    for (const section of SECTIONS) {
      expect(matchRoute(section.href.split("?")[0]), section.href).not.toBeNull();
      for (const item of section.items) {
        expect(es.nav.items[item.id], item.id).toBeTruthy();
        expect(en.nav.items[item.id], item.id).toBeTruthy();
        expect(matchRoute(item.href.split("?")[0]), item.href).not.toBeNull();
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

describe("rutas profundas (diseño §1.4)", () => {
  it.each([
    ["/", "resumen"],
    ["/movimientos", "movimientos"],
    ["/movimientos/nuevo", "movimiento-nuevo"],
    ["/movimientos/42", "movimiento"],
    ["/movimientos/42/asientos", "movimiento-asientos"],
    ["/movimientos/42/historial", "movimiento-historial"],
    ["/movimientos/compartidos", "compartidos"],
    ["/movimientos/compartidos/ana", "compartidos-persona"],
    ["/cuentas", "cuentas"],
    ["/cuentas/importar", "cuentas-importar"],
    ["/cuentas/7", "cuenta"],
    ["/cuentas/7/conciliar", "cuenta-conciliar"],
    ["/tarjetas/3", "tarjeta"],
    ["/tarjetas/3/extractos/2026-11", "tarjeta-extracto"],
    ["/tarjetas/3/pagar", "tarjeta-pagar"],
    ["/tarjetas/3/simular", "tarjeta-simular"],
    ["/pagos", "pagos"],
    ["/pagos/fijos", "pagos-fijos"],
    ["/pagos/fijos/9/pagar", "pagos-fijo-pagar"],
    ["/pagos/suscripciones", "pagos-suscripciones"],
    ["/pagos/recurrencias/nueva", "pagos-recurrencia-nueva"],
    ["/pagos/recurrencias/5", "pagos-recurrencia"],
    ["/pagos/calendario", "pagos-calendario"],
    ["/creditos", "creditos"],
    ["/creditos/11", "credito"],
    ["/creditos/11/tabla", "credito-tabla"],
    ["/creditos/deudas-personales", "creditos-deudas"],
    ["/creditos/simuladores/amortizacion", "simulador-amortizacion"],
    ["/creditos/simuladores/compra-tarjeta", "simulador-compra-tarjeta"],
    ["/plan/presupuestos", "plan-presupuestos"],
    ["/plan/presupuestos/2", "plan-presupuesto"],
    ["/plan/metas", "plan-metas"],
    ["/plan/metas/2", "plan-meta"],
    ["/plan/indicadores", "plan-indicadores"],
    ["/informes", "informes"],
    ["/informes/flujo-de-caja", "informe"],
    ["/informes/proyecciones", "informes-proyecciones"],
    ["/informes/proyecciones/comparar", "informes-comparar"],
    ["/informes/proyecciones/independencia", "informes-independencia"],
    ["/informes/patrimonio", "informes-patrimonio"],
    ["/informes/patrimonio/activos/8", "informes-activo"],
    ["/notificaciones", "notificaciones"],
    ["/config/parametros", "config-parametros"],
    ["/config/auditoria", "config-auditoria"],
    ["/perfil", "perfil"],
    ["/bienvenida/3", "bienvenida"],
  ])("%s → %s", (path, id) => {
    expect(matchRoute(path)?.route.id).toBe(id);
  });

  it("lo estático gana a lo dinámico y los parámetros se devuelven", () => {
    expect(matchRoute("/movimientos/nuevo")?.route.id).toBe("movimiento-nuevo");
    expect(matchRoute("/informes/proyecciones")?.route.id).toBe("informes-proyecciones");
    expect(matchRoute("/tarjetas/3/extractos/2026-11")?.params).toEqual(["3", "2026-11"]);
  });
  it("lo que no está en la tabla no existe", () => {
    for (const path of ["/zzz", "/config/otra", "/bienvenida/6", "/tarjetas/3/extractos/ayer", "/movimientos/1/2/3", "/creditos/simuladores/ninguno", "/movimientos/a b", "/movimientos/<script>", "/informes/../x"]) {
      expect(matchRoute(path), path).toBeNull();
    }
  });
  it("tolera barra final", () => {
    expect(matchRoute("/pagos/")?.route.id).toBe("pagos");
  });
  it("la alta no admite el monto en la URL (AGENTS.md: nada de montos en URLs)", () => {
    expect(NEW_MOVEMENT_HREF).toBe("/movimientos/nuevo");
    for (const route of ROUTES) expect(route.pattern).not.toMatch(/monto|amount/i);
  });
  it("sección de cada ruta", () => {
    expect(sectionOf("/tarjetas/3")).toBe("cuentas");
    expect(sectionOf("/perfil")).toBeNull();
    expect(sectionOf("/zzz")).toBeNull();
  });
});

describe("activo en el menú", () => {
  const params = (q: string) => new URLSearchParams(q);
  const item = (id: string) => SECTIONS.flatMap((s) => s.items).find((i) => i.id === id)!;
  it("los hermanos de una misma ruta se distinguen por la consulta", () => {
    expect(isItemActive(item("egresos"), "/movimientos", params("tipo=egreso"))).toBe(true);
    expect(isItemActive(item("ingresos"), "/movimientos", params("tipo=egreso"))).toBe(false);
    expect(isItemActive(item("historial"), "/movimientos", params(""))).toBe(true);
    expect(isItemActive(item("historial"), "/movimientos", params("tipo=egreso"))).toBe(false);
    expect(isItemActive(item("compartidos"), "/movimientos/compartidos", params(""))).toBe(true);
  });
  it("secciones", () => {
    const resumen = SECTIONS[0];
    expect(isSectionActive(resumen, "/")).toBe(true);
    expect(isSectionActive(resumen, "/pagos")).toBe(false);
    expect(isSectionActive(SECTIONS[2], "/tarjetas/3/pagar")).toBe(true);
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
  });
});

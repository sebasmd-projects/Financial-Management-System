import { describe, expect, it } from "vitest";
import type { ReportTable } from "@/api/models";
import { chartColumns, EMPTY_FILTERS, exportBody, filterParams, filtersReady, isDrillColumn, isReportKey, reportRoute, rowPhase, signedPercentToFraction } from "./logic";

const table = (key: string, columns: [string, string][], rows: (string | null)[][] = [["x"]]): ReportTable => ({
  key,
  title: key,
  columns: columns.map(([k, kind]) => ({ key: k, label: k, kind })) as ReportTable["columns"],
  rows: rows.map((cells) => ({ cells, movements_filter: null, ref: null })),
  totals: null,
});

describe("a qué pantalla va cada informe", () => {
  it("Estadísticas, Proyecciones y Patrimonio tienen la suya; el resto, /informes/[informe]", () => {
    expect(reportRoute("ant_expenses").route).toBe("informes-estadisticas");
    expect(reportRoute("projection").route).toBe("informes-proyecciones");
    expect(reportRoute("net_worth").route).toBe("informes-patrimonio");
    expect(reportRoute("cash_flow")).toEqual({ route: "informe", params: ["cash_flow"] });
    expect(isReportKey("cash_flow")).toBe(true);
    expect(isReportKey("../etc")).toBe(false);
  });
});

describe("filtros comunes", () => {
  it("por defecto no se manda ningún filtro", () => {
    expect(Object.values(filterParams(EMPTY_FILTERS)).filter(Boolean)).toEqual([]);
    expect(filtersReady(EMPTY_FILTERS)).toBe(true);
  });
  it("mes o rango, nunca los dos; un rango necesita las dos fechas en orden", () => {
    expect(filterParams({ ...EMPTY_FILTERS, period: "month", month: "2026-10" })).toMatchObject({ month: "2026-10" });
    expect(filterParams({ ...EMPTY_FILTERS, period: "month", month: "2026-10", from: "2026-01-01", to: "2026-02-01" })).not.toHaveProperty("from");
    expect(filtersReady({ ...EMPTY_FILTERS, period: "range", from: "2026-10-05", to: "2026-10-01" })).toBe(false);
    expect(filtersReady({ ...EMPTY_FILTERS, period: "range", from: "2026-10-01", to: "2026-10-31" })).toBe(true);
    expect(filtersReady({ ...EMPTY_FILTERS, period: "month", month: "" })).toBe(false);
  });
  it("ninguno es un monto: nada de claves con monto en la consulta", () => {
    const p = filterParams({ ...EMPTY_FILTERS, period: "range", from: "2026-10-01", to: "2026-10-31", category: "c", account: "a", card: "k", tag: "t", type: "expense" });
    expect(Object.keys(p).join()).not.toMatch(/amount|balance|total|price|value/);
  });
});

describe("cuerpo de la exportación", () => {
  it("lleva el formato y los filtros en el cuerpo, no en la URL", () => {
    expect(exportBody({ ...EMPTY_FILTERS, period: "month", month: "2026-10", type: "expense", card: "k1" }, "pdf")).toEqual({ format: "pdf", month: "2026-10", card: "k1", type: "expense" });
  });
  it("proyección: escenario, horizonte y los porcentajes solo si se cambiaron", () => {
    expect(exportBody(EMPTY_FILTERS, "xlsx", { projection: { scenario: "optimistic", horizon: "12m" } })).toEqual({ format: "xlsx", scenario: "optimistic", horizon: "12m" });
    expect(exportBody(EMPTY_FILTERS, "csv", { projection: { scenario: "base", horizon: "30", incomePct: "-0.1", variablePct: "0.2" } })).toMatchObject({ income_pct: "-0.1", variable_pct: "0.2" });
  });
  it("gastos hormiga: el umbral va en el cuerpo si no es el de por defecto", () => {
    expect(exportBody(EMPTY_FILTERS, "csv", { threshold: "50000" })).toMatchObject({ threshold: "50000" });
    expect(exportBody(EMPTY_FILTERS, "csv", { threshold: "20000" })).not.toHaveProperty("threshold");
  });
});

describe("porcentajes de escenario", () => {
  it("acepta signo y devuelve la fracción", () => {
    expect(signedPercentToFraction("+5")).toBe("0.05");
    expect(signedPercentToFraction("-10")).toBe("-0.1");
    expect(signedPercentToFraction("−7,5")).toBe("-0.075");
    expect(signedPercentToFraction("0")).toBe("0");
    expect(signedPercentToFraction("-0")).toBe("0");
    expect(signedPercentToFraction("abc")).toBeNull();
  });
});

describe("real frente a proyectado", () => {
  const t = table("projection", [["month", "date"], ["state", "text"], ["closing", "money"]]);
  it("se lee del rótulo del servidor, solo en la tabla de pronóstico", () => {
    expect(rowPhase(t, ["2026-09-01", "real", "1"])).toBe("real");
    expect(rowPhase(t, ["2026-11-01", "en curso", "1"])).toBe("current");
    expect(rowPhase(t, ["2026-12-01", "proyect.", "1"])).toBe("projected");
    expect(rowPhase({ ...t, key: "liquidity" }, ["x", "proyect.", "1"])).toBeNull();
  });
});

describe("qué se grafica y qué abre movimientos", () => {
  it("entradas y salidas juntas; si no, la columna de monto preferida; sin filas o sin etiqueta, nada", () => {
    expect(chartColumns(table("cash_flow", [["month", "date"], ["opening", "money"], ["inflow", "money"], ["outflow", "money"], ["closing", "money"]]))).toEqual(["inflow", "outflow"]);
    expect(chartColumns(table("income", [["category", "text"], ["amount", "money"], ["percent", "percent"]]))).toEqual(["amount"]);
    expect(chartColumns(table("income", [["category", "text"], ["amount", "money"]], []))).toEqual([]);
    expect(chartColumns(table("days", [["days", "int"], ["balance", "money"]]))).toEqual([]);
  });
  it("saldos de arranque o cierre y límites no abren movimientos", () => {
    expect(isDrillColumn("amount")).toBe(true);
    expect(isDrillColumn("spent")).toBe(true);
    expect(isDrillColumn("opening")).toBe(false);
    expect(isDrillColumn("limit")).toBe(false);
  });
});

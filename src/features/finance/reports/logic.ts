/**
 * Lógica pura de Informes (sin React): filtros comunes, cuerpo de la exportación, a qué pantalla va cada informe, qué columna
 * se grafica y cómo se rotula lo real y lo proyectado. Nunca `Number` para dinero; los filtros no llevan montos.
 */
import type { ExportFormat, ReportExport, ReportHorizon, ReportKey, ReportScenario, ReportTable } from "@/api/models";
import { percentToFraction } from "@/lib/amount-input";
import { isBusinessDate } from "@/lib/dates";
import type { RouteId } from "@/nav/routes";

export const REPORT_KEYS: readonly ReportKey[] = ["income_statement", "cash_flow", "net_worth", "debt", "recurring_expenses", "cards", "subscriptions", "budgets", "net_worth_evolution", "projection", "statistics", "ant_expenses"];

export function isReportKey(value: string): value is ReportKey {
  return (REPORT_KEYS as readonly string[]).includes(value);
}

/** A dónde lleva cada informe: Estadísticas, Proyecciones y Patrimonio tienen su pantalla; el resto, `/informes/[informe]`. */
export function reportRoute(key: ReportKey): { route: RouteId; params: string[] } {
  switch (key) {
    case "statistics":
    case "ant_expenses":
      return { route: "informes-estadisticas", params: [] };
    case "projection":
      return { route: "informes-proyecciones", params: [] };
    case "net_worth":
      return { route: "informes-patrimonio", params: [] };
    default:
      return { route: "informe", params: [key] };
  }
}

export type PeriodMode = "default" | "month" | "range";

export interface ReportFilters {
  period: PeriodMode;
  month: string;
  from: string;
  to: string;
  category: string;
  account: string;
  card: string;
  tag: string;
  type: "" | "income" | "expense" | "transfer";
}

export const EMPTY_FILTERS: ReportFilters = { period: "default", month: "", from: "", to: "", category: "", account: "", card: "", tag: "", type: "" };

/** ¿Los filtros están completos para pedir el informe? Un rango necesita las dos fechas en orden. */
export function filtersReady(f: ReportFilters): boolean {
  if (f.period === "range") return isBusinessDate(f.from) && isBusinessDate(f.to) && f.from <= f.to;
  if (f.period === "month") return /^\d{4}-(0[1-9]|1[0-2])$/.test(f.month);
  return true;
}

type Params = Record<string, string | undefined>;

/** Los filtros como parámetros de `GET reports/{clave}` (periodo por mes o por rango, nunca los dos). Ninguno es un monto. */
export function filterParams(f: ReportFilters): Params {
  return {
    ...(f.period === "month" ? { month: f.month } : {}),
    ...(f.period === "range" ? { from: f.from, to: f.to } : {}),
    category: f.category || undefined,
    account: f.account || undefined,
    card: f.card || undefined,
    tag: f.tag || undefined,
    type: f.type || undefined,
  };
}

export interface ProjectionOptions {
  scenario: ReportScenario;
  horizon: ReportHorizon;
  /** Fracciones (`0.05` = +5 %) solo si la persona las cambió respecto del escenario. */
  incomePct?: string;
  variablePct?: string;
}

/** Umbral de gastos hormiga: valores predefinidos (la API lo recibe por la consulta del GET; ver la nota en `ant-expenses`). */
export const ANT_THRESHOLDS = ["10000", "20000", "50000", "100000"] as const;
export const DEFAULT_ANT_THRESHOLD = "20000";

export function exportBody(f: ReportFilters, format: ExportFormat, extra: { projection?: ProjectionOptions; threshold?: string } = {}): ReportExport {
  const p = filterParams(f);
  const body: ReportExport = {
    format,
    ...(p.month ? { month: p.month } : {}),
    ...(p.from && p.to ? { from: p.from, to: p.to } : {}),
    ...(p.category ? { category: p.category } : {}),
    ...(p.account ? { account: p.account } : {}),
    ...(p.card ? { card: p.card } : {}),
    ...(p.tag ? { tag: p.tag } : {}),
    ...(f.type ? { type: f.type } : {}),
  };
  if (extra.projection) {
    body.scenario = extra.projection.scenario;
    body.horizon = extra.projection.horizon;
    if (extra.projection.incomePct !== undefined) body.income_pct = extra.projection.incomePct;
    if (extra.projection.variablePct !== undefined) body.variable_pct = extra.projection.variablePct;
  }
  if (extra.threshold && extra.threshold !== DEFAULT_ANT_THRESHOLD) body.threshold = extra.threshold;
  return body;
}

/** Un porcentaje con signo opcional (`+5`, `-10`, `7,5`) → fracción con signo (`0.05`, `-0.1`); `null` si no vale. */
export function signedPercentToFraction(raw: string): string | null {
  const text = raw.trim();
  const negative = text.startsWith("-") || text.startsWith("−");
  const magnitude = percentToFraction(text.replace(/^[+\-−]/, ""));
  if (magnitude === null) return null;
  return negative && magnitude !== "0" ? `-${magnitude}` : magnitude;
}

/** Real y proyectado se distinguen por texto y forma, no solo por color (`real`, `en curso`, `proyect.` del servidor). */
export type RowPhase = "real" | "current" | "projected" | null;
export function rowPhase(table: ReportTable, cells: readonly (string | null)[]): RowPhase {
  const index = table.columns.findIndex((c) => c.key === "state");
  if (index < 0 || table.key !== "projection") return null;
  const value = cells[index];
  return value === "real" ? "real" : value === "en curso" ? "current" : value === "proyect." ? "projected" : null;
}

const CHART_PREFERRED = ["amount", "balance", "monthly", "spent", "used", "closing", "net_worth", "count"] as const;
const NO_LINK = new Set(["opening", "closing", "limit", "deviation", "available", "from", "to", "yearly", "net_worth", "assets", "liabilities"]);

/** ¿Se puede abrir «Ver movimientos» desde esta columna de dinero? (los saldos de arranque o de cierre y los límites no son sumas de movimientos). */
export function isDrillColumn(key: string): boolean {
  return !NO_LINK.has(key);
}

/** Las columnas de dinero que se grafican: entradas y salidas juntas, o la primera preferida; nada si no hay dinero ni filas. */
export function chartColumns(table: ReportTable): string[] {
  if (table.rows.length === 0 || table.columns[0]?.kind !== "text" && table.columns[0]?.kind !== "date") return [];
  const money = table.columns.filter((c) => c.kind === "money").map((c) => c.key);
  if (money.includes("inflow") && money.includes("outflow")) return ["inflow", "outflow"];
  const chosen = CHART_PREFERRED.find((key) => money.includes(key)) ?? money[0];
  return chosen ? [chosen] : [];
}

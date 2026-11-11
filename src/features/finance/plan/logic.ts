/**
 * Lógica pura de Presupuestos y metas (sin React): nombres de lo que se presupuesta, el cuerpo de cada alta y las pestañas de
 * metas. Solo cadenas decimales para el dinero; los enteros (umbrales) no son dinero.
 */
import type { Account, BudgetCreate, BudgetDimension, BudgetPeriod, Category, GoalCreate, GoalKind, Named } from "@/api/models";
import { parsePositiveAmount } from "@/lib/amount-input";
import { isBusinessDate } from "@/lib/dates";
import { toInt } from "@/lib/ints";

export const DIMENSIONS: readonly BudgetDimension[] = ["category", "subcategory", "account", "cost_center", "tag"];
export const PERIODS: readonly BudgetPeriod[] = ["monthly", "biweekly", "annual", "custom"];
export const GOAL_KINDS: readonly GoalKind[] = ["emergency_fund", "save_amount", "vacation", "vehicle", "home", "pay_debt"];

/** Metas de ahorro (un colchón, un monto, unas vacaciones) frente a objetivos mayores (vehículo, vivienda, pagar una deuda). */
const SAVINGS_KINDS = new Set<GoalKind>(["emergency_fund", "save_amount", "vacation"]);
export type GoalTab = "ahorro" | "objetivos";
export const goalTab = (kind: GoalKind): GoalTab => (SAVINGS_KINDS.has(kind) ? "ahorro" : "objetivos");

export interface Lookups {
  categories: readonly Category[];
  accounts: readonly Account[];
  tags: readonly Named[];
  costCenters: readonly Named[];
}

export interface TargetOption {
  value: string;
  label: string;
}

/** Lo que se puede presupuestar en una dimensión: categorías raíz de egreso, subcategorías de egreso, cuentas, centros o etiquetas. */
export function targetOptions(dimension: BudgetDimension, lookups: Lookups): TargetOption[] {
  const named = (items: readonly Named[]) => items.filter((i) => !i.archived).map((i) => ({ value: i.id, label: i.name }));
  switch (dimension) {
    case "category":
      return lookups.categories.filter((c) => c.kind === "expense" && !c.archived && c.parent_id === null).map((c) => ({ value: c.id, label: c.name }));
    case "subcategory":
      return lookups.categories.filter((c) => c.kind === "expense" && !c.archived && c.parent_id !== null).map((c) => ({ value: c.id, label: c.path.join(" › ") }));
    case "account":
      return lookups.accounts.filter((a) => a.status !== "closed").map((a) => ({ value: a.id, label: a.name }));
    case "cost_center":
      return named(lookups.costCenters);
    case "tag":
      return named(lookups.tags);
  }
}

/** El nombre de un presupuesto: su etiqueta propia o el nombre de lo presupuestado. */
export function budgetName(budget: { label: string | null; dimension: BudgetDimension; target_id: string }, lookups: Lookups): string {
  if (budget.label) return budget.label;
  const found = targetOptions(budget.dimension, { ...lookups, categories: lookups.categories.map((c) => ({ ...c, archived: false })) }).find((o) => o.value === budget.target_id);
  if (found) return found.label;
  return lookups.categories.find((c) => c.id === budget.target_id)?.name ?? lookups.accounts.find((a) => a.id === budget.target_id)?.name ?? "—";
}

export interface BudgetInputs {
  dimension: BudgetDimension;
  target: string;
  limit: string;
  period: BudgetPeriod;
  customStart: string;
  customEnd: string;
  warn: string;
  exceed: string;
  label: string;
}

export const EMPTY_BUDGET: BudgetInputs = { dimension: "category", target: "", limit: "", period: "monthly", customStart: "", customEnd: "", warn: "80", exceed: "100", label: "" };

export type BudgetProblem = Partial<Record<"target" | "limit" | "dates" | "thresholds", true>>;

/** Umbrales enteros: atención antes del exceso, de 1 a 200 %. */
export function parseThresholds(warn: string, exceed: string): { warn: number; exceed: number } | null {
  const w = toInt(warn, 1, 200);
  const e = toInt(exceed, 1, 200);
  return w !== null && e !== null && w < e ? { warn: w, exceed: e } : null;
}

export function budgetBody(input: BudgetInputs): { body: BudgetCreate | null; problems: BudgetProblem } {
  const problems: BudgetProblem = {};
  const limit = parsePositiveAmount(input.limit);
  if (input.target === "") problems.target = true;
  if (limit === null) problems.limit = true;
  if (input.period === "custom" && (!isBusinessDate(input.customStart) || !isBusinessDate(input.customEnd) || input.customEnd < input.customStart)) problems.dates = true;
  const thresholds = parseThresholds(input.warn, input.exceed);
  if (thresholds === null) problems.thresholds = true;
  if (Object.keys(problems).length > 0 || limit === null || thresholds === null) return { body: null, problems };
  return {
    body: {
      dimension: input.dimension,
      target_id: input.target,
      limit,
      period: input.period,
      warn_percent: thresholds.warn,
      exceed_percent: thresholds.exceed,
      ...(input.period === "custom" ? { custom_start: input.customStart, custom_end: input.customEnd } : {}),
      ...(input.label.trim() ? { label: input.label.trim() } : {}),
    },
    problems,
  };
}

export interface GoalInputs {
  name: string;
  kind: GoalKind;
  target: string;
  date: string;
  planned: string;
  account: string;
  debtAccount: string;
}

export const EMPTY_GOAL: GoalInputs = { name: "", kind: "save_amount", target: "", date: "", planned: "", account: "", debtAccount: "" };

export type GoalProblem = Partial<Record<"name" | "target" | "planned" | "debt", true>>;

/** El alta de una meta: «pagar una deuda» enlaza un pasivo; las demás enlazan un fondo existente o, sin él, crean uno. */
export function goalBody(input: GoalInputs): { body: GoalCreate | null; problems: GoalProblem } {
  const problems: GoalProblem = {};
  const target = parsePositiveAmount(input.target);
  const planned = input.planned.trim() === "" ? undefined : parsePositiveAmount(input.planned);
  if (input.name.trim() === "") problems.name = true;
  if (target === null) problems.target = true;
  if (planned === null) problems.planned = true;
  if (input.kind === "pay_debt" && input.debtAccount === "") problems.debt = true;
  if (Object.keys(problems).length > 0 || target === null) return { body: null, problems };
  return {
    body: {
      name: input.name.trim(),
      kind: input.kind,
      target_amount: target,
      ...(input.date && isBusinessDate(input.date) ? { target_date: input.date } : {}),
      ...(planned ? { planned_contribution: planned } : {}),
      ...(input.kind === "pay_debt" ? { debt_account_id: input.debtAccount } : input.account ? { account_id: input.account } : {}),
    },
    problems,
  };
}

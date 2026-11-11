/**
 * Las rutas de la API y su cadena de consulta, en un solo lugar. Regla del propietario: NADA de montos en URLs, registros ni
 * analítica. Por eso `query()` rechaza las claves que llevan montos y la interfaz no usa los filtros `min_amount`/`max_amount`
 * ni la consulta de duplicados (`/movements/duplicates?amount=`): llevarían el valor en la URL (y en el registro de nginx).
 */
const FORBIDDEN_QUERY_KEYS = /amount|balance|total|price|value/i;

export type QueryValue = string | number | boolean | null | undefined;

export function query(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (FORBIDDEN_QUERY_KEYS.test(key)) throw new Error(`Montos fuera de la URL: «${key}»`);
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

const id = (value: string) => encodeURIComponent(value);

/** Rutas de creación (sin cadena de consulta). */
export const roots = {
  accounts: "/accounts",
  movements: "/movements",
  categories: "/categories",
  tags: "/tags",
  cards: "/cards",
  loans: "/loans",
  recurrences: "/recurrences",
  userParameters: "/user-parameters",
  reconciliations: "/reconciliations",
  pushSubscription: "/push-subscription",
  notificationsRead: "/notifications/read",
  debts: "/debts",
  budgets: "/budgets",
  goals: "/goals",
  exchangeRates: "/exchange-rates",
  imports: "/imports",
  assets: "/assets",
  costCenters: "/cost-centers",
  customAttributes: "/custom-attributes",
} as const;

export const paths = {
  summary: (period?: string) => `/summary${query({ period })}`,
  accounts: (params: Record<string, QueryValue> = {}) => `/accounts${query({ page_size: 100, ...params })}`,
  account: (accountId: string) => `/accounts/${id(accountId)}`,
  entries: (params: Record<string, QueryValue>) => `/entries${query(params)}`,
  movements: (params: Record<string, QueryValue>) => `/movements${query(params)}`,
  movement: (movementId: string) => `/movements/${id(movementId)}`,
  movementAction: (movementId: string, action: "confirm" | "annul" | "adjust") => `/movements/${id(movementId)}/${action}`,
  movementEdit: (movementId: string, step: "preview" | "apply") => `/movements/${id(movementId)}/edit/${step}`,
  movementEntries: (movementId: string) => `/movements/${id(movementId)}/entries`,
  transfers: () => "/transfers",
  categories: (params: Record<string, QueryValue> = {}) => `/categories${query({ page_size: 200, ...params })}`,
  category: (categoryId: string) => `/categories/${id(categoryId)}`,
  tags: () => `/tags${query({ page_size: 200 })}`,
  costCenters: () => `/cost-centers${query({ page_size: 200 })}`,
  tag: (tagId: string) => `/tags/${id(tagId)}`,
  paymentMethods: () => "/payment-methods",
  institutions: () => "/institutions",
  cards: () => `/cards${query({ page_size: 100 })}`,
  card: (cardId: string) => `/cards/${id(cardId)}`,
  cardAction: (cardId: string, action: "purchases" | "payments" | "advances" | "simulate") => `/cards/${id(cardId)}/${action}`,
  cardPlans: (cardId: string) => `/cards/${id(cardId)}/plans`,
  cardStatements: (cardId: string, month?: string) => `/cards/${id(cardId)}/statements${query({ month })}`,
  loans: () => `/loans${query({ page_size: 100 })}`,
  loan: (loanId: string) => `/loans/${id(loanId)}`,
  loanSchedule: (loanId: string) => `/loans/${id(loanId)}/schedule`,
  loanPay: (loanId: string, installment: number) => `/loans/${id(loanId)}/installments/${installment}/pay`,
  fixedExpenses: (period?: string) => `/fixed-expenses${query({ period })}`,
  subscriptions: () => "/subscriptions",
  recurrences: (params: Record<string, QueryValue> = {}) => `/recurrences${query({ page_size: 100, ...params })}`,
  recurrence: (recurrenceId: string) => `/recurrences/${id(recurrenceId)}`,
  recurrencePreview: () => "/recurrences/preview",
  occurrences: (params: Record<string, QueryValue>) => `/occurrences${query({ page_size: 100, ...params })}`,
  occurrence: (occurrenceId: string) => `/occurrences/${id(occurrenceId)}`,
  occurrenceAction: (occurrenceId: string, action: "pay" | "skip" | "split" | "unsplit") => `/occurrences/${id(occurrenceId)}/${action}`,
  occurrenceQuote: (occurrenceId: string, on?: string) => `/occurrences/${id(occurrenceId)}/quote${query({ on })}`,
  dashboard: (period?: string) => `/dashboard${query({ period })}`,
  calendar: (params: { view?: "month" | "week" | "day"; range?: 7 | 15 | 30; date?: string }) => `/calendar${query(params)}`,
  notifications: (params: Record<string, QueryValue> = {}) => `/notifications${query(params)}`,
  notificationSnooze: (notificationId: string) => `/notifications/${id(notificationId)}/snooze`,
  notificationPrefs: () => "/notification-prefs",
  notificationRules: () => "/notification-rules",
  parameterCatalog: () => "/parameters/catalog",
  parameters: (key: string) => `/parameters${query({ key })}`,
  userParameters: (key?: string) => `/user-parameters${query({ key })}`,
  userParameter: (parameterId: string) => `/user-parameters/${id(parameterId)}`,
  reconciliations: (accountId?: string) => `/reconciliations${query({ account: accountId, page_size: 20 })}`,
  reconciliationPreview: () => "/reconciliations/preview",
  reconciliationAdjust: () => "/reconciliations/adjust",
  reconciliationReopen: (reconciliationId: string) => `/reconciliations/${id(reconciliationId)}/reopen`,
  // FMS-2a: créditos, deudas personales y simuladores (los simuladores son POST y no escriben nada)
  loanRates: (loanId: string) => `/loans/${id(loanId)}/rates`,
  loanLate: (loanId: string, on?: string) => `/loans/${id(loanId)}/late${query({ on })}`,
  creditInstallments: (params: Record<string, QueryValue> = {}) => `/credit/installments${query({ page_size: 100, ...params })}`,
  creditInterest: (params: { from?: string; to?: string } = {}) => `/credit/interest${query(params)}`,
  debts: (params: Record<string, QueryValue> = {}) => `/debts${query({ page_size: 100, ...params })}`,
  debt: (debtId: string) => `/debts/${id(debtId)}`,
  debtPayments: (debtId: string) => `/debts/${id(debtId)}/payments`,
  debtReminder: (debtId: string, locale: string) => `/debts/${id(debtId)}/reminder${query({ locale })}`,
  debtsSummary: () => "/debts/summary",
  simulate: (kind: "rates" | "installment" | "extra-payment" | "compare" | "installment/export") => `/simulators/${kind}`,
  // FMS-2a: planeación
  budgets: (params: { all?: boolean; on?: string } = {}) => `/budgets${query({ all: params.all ? "true" : undefined, on: params.on })}`,
  budget: (budgetId: string, on?: string) => `/budgets/${id(budgetId)}${query({ on })}`,
  budgetHistory: (budgetId: string, months = 6) => `/budgets/${id(budgetId)}/history${query({ months })}`,
  budgetSuggestions: () => "/budgets/suggestions",
  goals: () => "/goals",
  goal: (goalId: string) => `/goals/${id(goalId)}`,
  goalContribute: (goalId: string) => `/goals/${id(goalId)}/contribute`,
  indicators: (month?: string) => `/indicators${query({ month })}`,
  // FMS-2a: informes
  reports: () => "/reports",
  reportQuery: (key: string) => `/reports/${id(key)}/query`,
  movementsSearch: () => "/movements/search",
  reportExport: (key: string) => `/reports/${id(key)}/export`,
  liquidity: (params: Record<string, QueryValue> = {}) => `/liquidity${query(params)}`,
  // FMS-2b: monedas (las tasas son «pesos por unidad»: no son montos del usuario), importación, patrimonio, clasificación y auditoría.
  // `fx/quote` no se usa: lleva el monto en la URL; la vista previa se calcula en el cliente y el servidor decide al guardar.
  currencies: () => "/currencies",
  consolidation: (params: { from?: string; to?: string } = {}) => `/currencies/consolidation${query(params)}`,
  exchangeRates: (params: Record<string, QueryValue> = {}) => `/exchange-rates${query({ page_size: 100, ...params })}`,
  exchangeRate: (rateId: string) => `/exchange-rates/${id(rateId)}`,
  importPreview: () => "/imports/preview",
  imports: (params: Record<string, QueryValue> = {}) => `/imports${query({ page_size: 20, ...params })}`,
  importUndo: (batchId: string) => `/imports/${id(batchId)}/undo`,
  importMappings: () => `/import-mappings${query({ page_size: 100 })}`,
  importMapping: (mappingId: string) => `/import-mappings/${id(mappingId)}`,
  assets: (params: Record<string, QueryValue> = {}) => `/assets${query({ page_size: 100, ...params })}`,
  asset: (assetId: string) => `/assets/${id(assetId)}`,
  assetValuations: (assetId: string, params: Record<string, QueryValue> = {}) => `/assets/${id(assetId)}/valuations${query({ page_size: 50, ...params })}`,
  assetOdometer: (assetId: string) => `/assets/${id(assetId)}/odometer`,
  assetCosts: (assetId: string) => `/assets/${id(assetId)}/costs`,
  assetMaintenance: (assetId: string) => `/assets/${id(assetId)}/maintenance`,
  assetCostSummary: (assetId: string) => `/assets/${id(assetId)}/cost-summary`,
  maintenance: (maintenanceId: string) => `/maintenance/${id(maintenanceId)}`,
  maintenanceRecords: (maintenanceId: string) => `/maintenance/${id(maintenanceId)}/records`,
  netWorth: (params: { as_of?: string; months?: number } = {}) => `/net-worth${query(params)}`,
  customAttributes: () => `/custom-attributes${query({ page_size: 100 })}`,
  customAttribute: (attributeId: string) => `/custom-attributes/${id(attributeId)}`,
  costCenter: (centerId: string) => `/cost-centers/${id(centerId)}`,
  costCenterDefaults: () => "/cost-centers/defaults",
  costCenterUsage: (params: { from?: string; to?: string } = {}) => `/cost-centers/usage${query(params)}`,
  usuryCheck: (params: { rate: string; convention: string; on?: string }) => `/usury/check${query(params)}`,
  audit: (params: Record<string, QueryValue> = {}) => `/audit${query({ page_size: 25, ...params })}`,
};

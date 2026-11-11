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
} as const;

export const paths = {
  summary: (period?: string) => `/summary${query({ period })}`,
  accounts: (params: Record<string, QueryValue> = {}) => `/accounts${query({ page_size: 100, ...params })}`,
  account: (accountId: string) => `/accounts/${id(accountId)}`,
  entries: (params: Record<string, QueryValue>) => `/entries${query(params)}`,
  movements: (params: Record<string, QueryValue>) => `/movements${query(params)}`,
  movement: (movementId: string) => `/movements/${id(movementId)}`,
  movementAction: (movementId: string, action: "confirm" | "annul" | "adjust") => `/movements/${id(movementId)}/${action}`,
  movementEntries: (movementId: string) => `/movements/${id(movementId)}/entries`,
  transfers: () => "/transfers",
  categories: (params: Record<string, QueryValue> = {}) => `/categories${query({ page_size: 200, ...params })}`,
  category: (categoryId: string) => `/categories/${id(categoryId)}`,
  tags: () => `/tags${query({ page_size: 200 })}`,
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
  occurrenceAction: (occurrenceId: string, action: "pay" | "skip") => `/occurrences/${id(occurrenceId)}/${action}`,
};

/** Respuestas de ejemplo con la FORMA del contrato (`core/api/schema.gen.ts`): si el contrato cambia, `tsc` las señala. */
import type { components } from "@core/api/schema.gen";

type S = components["schemas"];

export const dashboard: S["Dashboard"] = {
  period: "2026-11-01",
  is_current: true,
  today: "2026-11-10",
  kpi: {
    remaining: "1840000.00",
    spent: "2310000.00",
    income: "5200000.00",
    committed: "1050000.00",
    loan_capital_paid: "0.00",
    goal_contributions: "0.00",
    available_today: "3420000.00",
    owed: "850000.00",
    owed_to_me: "0.00",
    overdue_total: "450000.00",
  },
  bar: { spent: "2310000.00", committed: "1050000.00", free: "1840000.00" },
  liquidity: {
    horizons: [
      { days: 15, balance: "2100000.00" },
      { days: 30, balance: "1250000.00" },
      { days: 60, balance: "-120000.00" },
      { days: 90, balance: "-900000.00" },
    ],
    first_negative_date: "2027-01-05",
    missing: "120000.00",
  },
  rail: [
    { kind: "card_payment", name: "Visa Bancolombia", amount: "850000.00", index_missing: false, date: "2026-11-16", days_left: 6, state: "normal", ref_kind: "card", ref_id: "11111111-1111-4111-8111-111111111111" },
    { kind: "loan_installment", name: "Libre inversión", amount: "723048.00", index_missing: false, date: "2026-11-08", days_left: -2, state: "overdue", ref_kind: "loan_installment", ref_id: "22222222-2222-4222-8222-222222222222" },
    { kind: "loan_installment", name: "Crédito UVR", amount: null, index_missing: true, date: "2026-11-20", days_left: 10, state: "normal", ref_kind: "loan_installment", ref_id: "33333333-3333-4333-8333-333333333333" },
  ],
  fixed_expenses: {
    paid_count: 1,
    total_count: 3,
    paid: "450000.00",
    total: "1340000.00",
    percent: 33,
    items: [
      { occurrence_id: "44444444-4444-4444-8444-444444444444", name: "Arriendo", status: "overdue", due_date: "2026-11-05", expected: "450000.00", paid: "0.00", pending: "450000.00", percent: 0, days_left: -5, estimated: false },
      { occurrence_id: "55555555-5555-4555-8555-555555555555", name: "Internet", status: "partial", due_date: "2026-11-15", expected: "90000.00", paid: "50000.00", pending: "40000.00", percent: 55, days_left: 5, estimated: false },
      { occurrence_id: "66666666-6666-4666-8666-666666666666", name: "Agua", status: "paid", due_date: "2026-11-03", expected: "120000.00", paid: "120000.00", pending: "0.00", percent: 100, days_left: -7, estimated: true },
    ],
    more: 0,
  },
  shortcuts: [{ name: "Gasolina", amount: "180000.00", category_id: "77777777-7777-4777-8777-777777777777" }],
  alerts: [
    { kind: "overdue", severity: "critical", name: "Arriendo", amount: "450000.00", index_missing: false, date: "2026-11-05", ref_kind: "occurrence", ref_id: "44444444-4444-4444-8444-444444444444" },
    { kind: "due_today", severity: "warning", name: "Internet", amount: "40000.00", index_missing: false, date: "2026-11-10", ref_kind: "occurrence", ref_id: "55555555-5555-4555-8555-555555555555" },
  ],
  notices: [],
  all_clear_days: null,
};

export const emptyDashboard: S["Dashboard"] = {
  ...dashboard,
  kpi: { ...dashboard.kpi, remaining: "0.00", spent: "0.00", income: "0.00", committed: "0.00", available_today: "0.00", owed: "0.00", overdue_total: "0.00" },
  bar: { spent: "0.00", committed: "0.00", free: "0.00" },
  liquidity: { horizons: [], first_negative_date: null, missing: null },
  rail: [],
  fixed_expenses: { paid_count: 0, total_count: 0, paid: "0.00", total: "0.00", percent: 0, items: [], more: 0 },
  shortcuts: [],
  alerts: [],
  all_clear_days: 6,
};

export const accounts = {
  count: 2,
  page: 1,
  page_size: 100,
  results: [
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", type: "asset", kind: "savings", system_key: "", name: "Ahorros Bancolombia", last4: null, institution: null, parent_id: null, currency: "COP", gmf_exempt: false, liquid: true, enforce_funds: false, status: "active", posted_balance: "3420000.00", projected_balance: "3420000.00" },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", type: "liability", kind: "credit_card", system_key: "", name: "Visa Bancolombia", last4: "1234", institution: null, parent_id: null, currency: "COP", gmf_exempt: false, liquid: false, enforce_funds: false, status: "active", posted_balance: "-850000.00", projected_balance: "-850000.00" },
  ],
};

export const categories = {
  count: 1,
  page: 1,
  page_size: 200,
  results: [{ id: "77777777-7777-4777-8777-777777777777", name: "Combustible", kind: "expense", parent_id: null, path: ["Transporte", "Combustible"], account_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", default_nature: "", default_classification: "", archived: false }],
};

export const emptyPage = { count: 0, page: 1, page_size: 30, results: [] };

export const movement = (over: Record<string, unknown> = {}) =>
  ({ id: "99999999-9999-4999-8999-999999999999", type: "expense", origin: "manual", status: "confirmado", voided: false, date: "2026-11-10", amount: "180000.00", currency: "COP", description: "Gasolina", category: { id: "77777777-7777-4777-8777-777777777777", name: "Combustible", path: ["Transporte", "Combustible"] }, account: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Ahorros Bancolombia" }, payment_method: null, counterparty: null, tags: [], attachments: 0, warnings: [], ...over }) as unknown as S["Movement"];

export const notifications: S["NotificationList"] = {
  unread: 2,
  results: [
    { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", rule_key: "fixed_due", severity: "warning", title: "Internet vence pronto", body: "Paga antes del 15/11.", object_kind: "occurrence", object_id: "55555555-5555-4555-8555-555555555555", due_date: "2026-11-15", visible_at: "2026-11-10T13:00:00Z", is_read: false, group: "today" },
    { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", rule_key: "card_due", severity: "critical", title: "Visa vence en 5 días", body: "Abre la aplicación.", object_kind: "card", object_id: "11111111-1111-4111-8111-111111111111", due_date: "2026-11-16", visible_at: "2026-11-09T13:00:00Z", is_read: false, group: "this_week" },
    { id: "ffffffff-ffff-4fff-8fff-ffffffffffff", rule_key: "period_start", severity: "info", title: "Empezó noviembre", body: "9 gastos fijos.", object_kind: "", object_id: null, due_date: null, visible_at: "2026-11-01T13:00:00Z", is_read: true, group: "earlier" },
  ],
} as unknown as S["NotificationList"];

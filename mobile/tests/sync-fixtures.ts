/** Respuestas de ejemplo de los bancos por correo (sintéticas: ningún correo, ningún monto real). */
const NOW = new Date().toISOString();

export const catalog = {
  configured: true,
  institutions: [
    { id: 1, code: "bancolombia", name: "Bancolombia", mobile_only: false },
    { id: 2, code: "nequi", name: "Nequi", mobile_only: true },
    { id: 3, code: "nu", name: "Nu", mobile_only: true },
  ],
  providers: ["gmail", "outlook", "other"],
  ingest_domains: { es: "recibir.example.test", default: "ingest.example.test" },
  mail_link_hosts: { gmail: ["mail.google.com"], outlook: ["outlook.live.com"], other: [] as string[] },
};

export const accounts = {
  count: 3,
  page: 1,
  results: [
    { id: "acc-1", type: "asset", kind: "savings", name: "Ahorros Bancolombia", status: "active", last4: "1234", is_default: true },
    { id: "acc-2", type: "asset", kind: "wallet", name: "Nequi", status: "active", last4: null, is_default: false },
    { id: "card-1", type: "liability", kind: "credit_card", name: "Visa", status: "active", last4: null, is_default: false },
  ],
};

export const connection = {
  id: "c1",
  institution_id: 1,
  institution_code: "bancolombia",
  institution_name: "Bancolombia",
  account_id: "acc-1",
  account_name: "Ahorros Bancolombia",
  status: "active",
  include_statements: true,
  last_event_at: NOW,
  rotated_at: null,
  created_at: "2026-11-01T10:00:00Z",
  is_manager: true,
  label: null,
  provider: "gmail",
  domain: "recibir.example.test",
  forwarding_code: null,
  forwarding_code_expires_at: null,
  rejected_count: 0,
  address: null,
};

export const event = {
  id: "e1",
  connection_id: "c1",
  account_id: "acc-1",
  institution_code: "bancolombia",
  status: "proposed",
  auth: "dkim",
  error_code: "",
  received_at: "2026-11-14T15:00:00Z",
  date: "2026-11-13",
  amount: "180000.00",
  kind: "expense",
  counterparty: "Exito",
  description: "Compra Éxito",
  notes: null as string | null,
  last4: "1234",
  reference: null,
  match: "new",
  movement_id: "m1",
  candidate_id: null,
  batch_id: "b1",
  rule_id: null,
  decided_at: null,
  suggested_category_id: "cat-1",
  mail_link: { exact: true, provider: "gmail", search_hint: "from:bancolombia.test 2026-11-13", url: "https://mail.google.com/mail/u/0/#search/rfc822msgid%3Aabc" },
};

export const page = (results: unknown[]) => ({ count: results.length, page: 1, page_size: 100, results });

export const categories = { count: 1, page: 1, results: [{ id: "cat-1", name: "Mercado", kind: "expense", archived: false, path: ["Mercado"] }] };

export const rule = {
  id: "r1",
  name: "Nómina",
  enabled: true,
  trigger: "sync_event",
  action: "auto_confirm",
  action_category_id: null,
  action_counterparty: "Acme",
  applied_count: 3,
  last_applied_at: "2026-11-10T13:00:00Z",
  channels: ["app"],
  conditions: [
    { field: "kind", op: "eq", value: "income" },
    { field: "text", op: "contains", value: "nomina acme" },
    { field: "amount", op: "gte", value: "3000000.00" },
  ],
};

export const suggestion = {
  key: "s1",
  kind: "income",
  text: "nomina acme",
  count: 3,
  amount_min: "3000000.00",
  amount_max: "3200000.00",
  day_min: 13,
  day_max: 17,
  trigger: "sync_event",
  action: "auto_confirm",
  conditions: [
    { field: "kind", op: "eq", value: "income" },
    { field: "text", op: "starts_with", value: "nomina acme" },
    { field: "amount", op: "gte", value: "3000000.00" },
    { field: "amount", op: "lte", value: "3200000.00" },
  ],
};

/** La salud que calcula el servidor (`GET sync/connections/{id}/health`). */
export const health = (state: "ok" | "quiet" | "paused" | "error" | "waiting", days = 0, id = "c1") => ({
  connection_id: id,
  state,
  status: state === "paused" ? "paused" : "active",
  last_event_at: null,
  last_event_status: null,
  last_error_code: state === "error" ? "not_authenticated" : null,
  last_error_at: null,
  rejected_count: 0,
  quiet_days: 14,
  days_since_last_event: days,
  quiet: state === "quiet",
});

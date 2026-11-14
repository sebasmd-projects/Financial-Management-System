/** Datos de prueba de los bancos por correo (sintéticos: ningún correo, ningún monto real). */
export const page = (results: unknown[]) => ({ status: 200, json: { count: results.length, page: 1, page_size: 100, results } });

export const CATALOG = {
  configured: true,
  institutions: [
    { id: 1, code: "bancolombia", name: "Bancolombia", mobile_only: false },
    { id: 2, code: "nequi", name: "Nequi", mobile_only: true },
  ],
  providers: ["gmail", "outlook", "other"],
  ingest_domains: { es: "recibir.example.test", default: "ingest.example.test" },
};

export const ACCOUNTS = page([
  { id: "acc-1", type: "asset", kind: "savings", name: "Ahorros Bancolombia", status: "active", posted_balance: "5000000.00", last4: "1234" },
  { id: "card-1", type: "liability", kind: "credit_card", name: "Visa", status: "active", posted_balance: "0.00", last4: null },
]);

export const CATEGORIES = page([{ id: "cat-1", name: "Mercado", kind: "expense", path: ["Mercado"], archived: false }]);

const NOW = new Date().toISOString();
export const CONNECTION = {
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

export const EVENT = {
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

export const RULE = {
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
  cooldown_days: 7,
  created_at: "2026-11-01T10:00:00Z",
  last_fired_on: null,
  severity: "info",
  title: null,
};

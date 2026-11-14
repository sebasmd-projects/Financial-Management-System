import { describe, expect, it, vi } from "vitest";
import {
  activeForwardingCode,
  buildAutoRule,
  buildModify,
  canUndo,
  connectionHealth,
  createConnectionBody,
  describeCondition,
  draftFromConditions,
  draftFromEvent,
  draftFromRule,
  editableFields,
  emptyAutoRule,
  hasConnection,
  ingestDomain,
  offeredInstitutions,
  offeredProviders,
  safeMailUrl,
  suggestedRuleName,
  syncApi,
  syncPaths,
  type ConditionTexts,
  type SyncClient,
  type SyncEvent,
} from "./sync";

const EVENT: SyncEvent = {
  id: "e1",
  connection_id: "c1",
  account_id: "a1",
  institution_code: "bancolombia",
  status: "proposed",
  auth: "dkim",
  error_code: "",
  received_at: "2026-11-14T12:00:00Z",
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
  suggested_category_id: "cat1",
  mail_link: { exact: true, provider: "gmail", search_hint: "from:bancolombia.com.co 2026-11-13", url: "https://mail.google.com/mail/u/0/#search/rfc822msgid%3Aabc" },
};

describe("rutas", () => {
  it("ninguna lleva un monto ni un dato en la consulta, y los ids se escapan", () => {
    expect(syncPaths.events("proposed")).toBe("/sync/events?status=proposed&page=1&page_size=50");
    expect(syncPaths.approve("a/b?c")).toBe("/sync/events/a%2Fb%3Fc/approve");
    expect(syncPaths.rule("x y")).toBe("/automation/rules/x%20y");
  });
  it("el cliente manda la Idempotency-Key en lo que crea o decide y nunca la dirección en una URL", async () => {
    const post = vi.fn(async () => ({ ok: true as const, status: 200, data: {} }));
    const client = { get: vi.fn(), post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() } as unknown as SyncClient;
    const api = syncApi(client);
    await api.approve("e1", "key-1", { locale: "es" });
    expect(post).toHaveBeenCalledWith("/sync/events/e1/approve", undefined, { locale: "es", idempotencyKey: "key-1" });
    await api.modify("e1", { amount: "5" }, "key-2");
    expect(post).toHaveBeenLastCalledWith("/sync/events/e1/modify", { amount: "5" }, { idempotencyKey: "key-2" });
    await api.createConnection({ institution_id: 1, account_id: "a", provider: "gmail", include_statements: true }, "key-3");
    expect(post).toHaveBeenLastCalledWith("/sync/connections", { institution_id: 1, account_id: "a", provider: "gmail", include_statements: true }, { idempotencyKey: "key-3" });
  });
});

describe("conexiones", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  it("la salud sale de la fecha del último correo", () => {
    expect(connectionHealth({ status: "paused", last_event_at: "2026-11-13T00:00:00Z" }, now).state).toBe("paused");
    expect(connectionHealth({ status: "active", last_event_at: null }, now).state).toBe("waiting");
    expect(connectionHealth({ status: "active", last_event_at: "2026-11-13T12:00:00Z" }, now)).toEqual({ state: "ok", days: 1 });
    expect(connectionHealth({ status: "active", last_event_at: "2026-10-31T12:00:00Z" }, now)).toEqual({ state: "quiet", days: 14 });
  });
  it("el código de confirmación solo vale mientras no caduque", () => {
    expect(activeForwardingCode({ forwarding_code: "123456", forwarding_code_expires_at: "2026-11-15T00:00:00Z" }, now)).toBe("123456");
    expect(activeForwardingCode({ forwarding_code: "123456", forwarding_code_expires_at: "2026-11-14T11:00:00Z" }, now)).toBeNull();
    expect(activeForwardingCode({ forwarding_code: null, forwarding_code_expires_at: null }, now)).toBeNull();
    expect(activeForwardingCode({ forwarding_code: "1", forwarding_code_expires_at: null }, now)).toBeNull();
  });
  const catalog = {
    configured: true,
    providers: ["other", "gmail"] as ("gmail" | "outlook" | "other")[],
    ingest_domains: { es: "recibir.example.test", default: "ingest.example.test" },
    institutions: [
      { id: 1, code: "bancolombia", name: "Bancolombia", mobile_only: false },
      { id: 2, code: "nequi", name: "Nequi", mobile_only: true },
    ],
  };
  it("Nequi y Nu no se ofrecen en la web, pero sí en la app", () => {
    expect(offeredInstitutions(catalog, "web").map((i) => i.code)).toEqual(["bancolombia"]);
    expect(offeredInstitutions(catalog, "app").map((i) => i.code)).toEqual(["bancolombia", "nequi"]);
  });
  it("los proveedores salen en orden estable y el subdominio sigue al idioma", () => {
    expect(offeredProviders(catalog)).toEqual(["gmail", "other"]);
    expect(ingestDomain(catalog, "es")).toBe("recibir.example.test");
    expect(ingestDomain(catalog, "en")).toBe("ingest.example.test");
    expect(ingestDomain({ ingest_domains: {} }, "en")).toBeNull();
  });
  it("el cuerpo de conectar lleva el idioma y omite la etiqueta vacía", () => {
    expect(createConnectionBody({ institutionId: 1, accountId: "a", provider: "gmail", label: "  ", includeStatements: true, locale: "es" })).toEqual({ institution_id: 1, account_id: "a", provider: "gmail", include_statements: true, locale: "es" });
    expect(createConnectionBody({ institutionId: 1, accountId: "a", provider: "outlook", label: " Mi correo ", includeStatements: false, locale: "en" }).label).toBe("Mi correo");
    expect(hasConnection([{ institution_id: 1, account_id: "a" }], 1, "a")).toBe(true);
    expect(hasConnection([{ institution_id: 1, account_id: "a" }], 1, "b")).toBe(false);
  });
});

describe("«Ir al correo»", () => {
  it("solo abre https en un servidor de correo conocido", () => {
    expect(safeMailUrl({ url: EVENT.mail_link!.url })).toMatch(/^https:\/\/mail\.google\.com\//);
    expect(safeMailUrl({ url: "https://outlook.live.com/mail/0/" })).toBe("https://outlook.live.com/mail/0/");
  });
  it.each([
    "javascript:alert(1)",
    "http://mail.google.com/mail",
    "https://mail.google.com.evil.test/",
    "https://evil.test/https://mail.google.com/",
    "https://user:pw@mail.google.com/",
    "https://mail.google.com:8443/",
    "//mail.google.com/",
    "data:text/html,hola",
    "no es una url",
    "",
  ])("descarta %j", (url) => {
    expect(safeMailUrl({ url })).toBeNull();
  });
  it("sin enlace o sin url, nada", () => {
    expect(safeMailUrl(null)).toBeNull();
    expect(safeMailUrl({ url: null })).toBeNull();
  });
});

describe("propuestas", () => {
  it("una propuesta nueva se edita entera; una que cruzó con un pendiente no cambia tipo ni cuenta; con un confirmado solo se aprueba", () => {
    expect(editableFields({ status: "proposed", match: "new" })).toEqual({ modify: true, type: true, account: true });
    expect(editableFields({ status: "proposed", match: "matches_pending" })).toEqual({ modify: true, type: false, account: false });
    expect(editableFields({ status: "proposed", match: "matches_confirmed" }).modify).toBe(false);
    expect(editableFields({ status: "approved", match: "new" }).modify).toBe(false);
  });
  it("solo lo decidido se deshace", () => {
    for (const status of ["approved", "modified", "auto_confirmed"] as const) expect(canUndo({ status })).toBe(true);
    for (const status of ["proposed", "discarded", "undone", "parse_error", "rejected_auth"] as const) expect(canUndo({ status })).toBe(false);
  });
  it("modificar manda SOLO lo que cambió, con el monto como cadena decimal", () => {
    const draft = { ...draftFromEvent(EVENT), amount: "1.250.000,50", counterparty: "Éxito Express" };
    expect(buildModify(EVENT, draft)).toEqual({ ok: true, body: { amount: "1250000.50", counterparty: "Éxito Express" } });
  });
  it("el monto con el mismo valor (aunque se escriba distinto) no cuenta como cambio; sin cambios es un error", () => {
    expect(buildModify(EVENT, { ...draftFromEvent(EVENT), amount: "180.000" })).toEqual({ ok: false, problems: ["no_changes"] });
  });
  it("tipo, cuenta, categoría y fecha cambian; la categoría se puede quitar con null", () => {
    const draft = { ...draftFromEvent(EVENT), type: "income" as const, accountId: "a2", categoryId: "", date: "2026-11-12" };
    expect(buildModify(EVENT, draft)).toEqual({ ok: true, body: { type: "income", account_id: "a2", category_id: null, date: "2026-11-12" } });
  });
  it("en una propuesta que cruzó con un pendiente, el tipo y la cuenta no viajan aunque se toquen", () => {
    const pending = { ...EVENT, match: "matches_pending" as const };
    const draft = { ...draftFromEvent(pending), type: "income" as const, accountId: "a2", amount: "5" };
    expect(buildModify(pending, draft)).toEqual({ ok: true, body: { amount: "5" } });
  });
  it("rechaza un monto cero, con tres decimales o con letras, y una fecha que no existe, sin tocar la red", () => {
    for (const amount of ["0", "", "abc", "1,2345", "-5"]) expect(buildModify(EVENT, { ...draftFromEvent(EVENT), amount })).toEqual({ ok: false, problems: ["amount"] });
    expect(buildModify(EVENT, { ...draftFromEvent(EVENT), date: "2026-02-30" })).toEqual({ ok: false, problems: ["date"] });
  });
  it("descripción y nota solo viajan si se escribieron, y con tope", () => {
    expect(buildModify(EVENT, { ...draftFromEvent(EVENT), description: " Mercado ", notes: "n" })).toEqual({ ok: true, body: { description: "Mercado", notes: "n" } });
    expect(buildModify(EVENT, { ...draftFromEvent(EVENT), description: "x".repeat(201) })).toEqual({ ok: false, problems: ["description"] });
    expect(buildModify(EVENT, { ...draftFromEvent(EVENT), notes: "x".repeat(281) })).toEqual({ ok: false, problems: ["notes"] });
  });
});

describe("reglas de autoconfirmación", () => {
  const base = { ...emptyAutoRule(), name: "Nómina" };
  it("el monto es opcional: el texto y el tipo bastan", () => {
    const result = buildAutoRule({ ...base, kind: "income", text: "nomina acme" });
    expect(result).toEqual({
      ok: true,
      conditions: [
        { field: "kind", op: "eq", value: "income" },
        { field: "text", op: "contains", value: "nomina acme" },
      ],
      body: { name: "Nómina", trigger: "sync_event", action: "auto_confirm", conditions: expect.any(Array), action_category_id: null, action_counterparty: null, enabled: true, channels: ["app"], severity: "info", cooldown_days: 7 },
    });
  });
  it("arma todas las condiciones en el orden del catálogo, con montos como cadenas y días como enteros en texto", () => {
    const result = buildAutoRule({ ...base, institution: "bancolombia", kind: "income", textOp: "starts_with", text: "NOMINA", amountMin: "3.000.000", amountMax: "3.500.000,50", dayMin: "13", dayMax: "17", categoryId: "cat", counterparty: " Acme " });
    expect(result.ok && result.conditions).toEqual([
      { field: "institution", op: "eq", value: "bancolombia" },
      { field: "kind", op: "eq", value: "income" },
      { field: "text", op: "starts_with", value: "NOMINA" },
      { field: "amount", op: "gte", value: "3000000" },
      { field: "amount", op: "lte", value: "3500000.50" },
      { field: "day_of_month", op: "gte", value: "13" },
      { field: "day_of_month", op: "lte", value: "17" },
    ]);
    expect(result.ok && result.body.action_category_id).toBe("cat");
    expect(result.ok && result.body.action_counterparty).toBe("Acme");
  });
  it("sin ninguna condición, sin nombre, con texto corto o largo, rangos al revés: errores claros", () => {
    expect(buildAutoRule(base)).toEqual({ ok: false, problems: ["no_conditions"] });
    expect(buildAutoRule({ ...base, name: " ", kind: "income" })).toEqual({ ok: false, problems: ["name"] });
    expect(buildAutoRule({ ...base, text: "ab" })).toEqual({ ok: false, problems: ["text"] });
    expect(buildAutoRule({ ...base, text: "x".repeat(61) })).toEqual({ ok: false, problems: ["text"] });
    expect(buildAutoRule({ ...base, kind: "income", amountMin: "10", amountMax: "5" })).toEqual({ ok: false, problems: ["amount_range"] });
    expect(buildAutoRule({ ...base, kind: "income", dayMin: "20", dayMax: "3" })).toEqual({ ok: false, problems: ["day_range"] });
    expect(buildAutoRule({ ...base, kind: "income", dayMin: "32" })).toEqual({ ok: false, problems: ["day_min"] });
    expect(buildAutoRule({ ...base, kind: "income", amountMin: "1,2345" })).toEqual({ ok: false, problems: ["amount_min"] });
  });
  it("un patrón como .* o {{7*7}} viaja literal: no hay expresiones regulares ni plantillas", () => {
    const result = buildAutoRule({ ...base, text: "{{7*7}}.*" });
    expect(result.ok && result.conditions[0]).toEqual({ field: "text", op: "contains", value: "{{7*7}}.*" });
  });
  it("una regla guardada vuelve al formulario y una que no cabe (campo repetido) no se edita", () => {
    const conditions = [
      { field: "kind", op: "eq", value: "expense" },
      { field: "text", op: "eq", value: "netflix" },
      { field: "amount", op: "lte", value: "50000.00" },
    ];
    const draft = draftFromRule({ name: "Netflix", conditions, action_category_id: "c", action_counterparty: null, enabled: false });
    expect(draft).toMatchObject({ name: "Netflix", kind: "expense", textOp: "eq", text: "netflix", amountMax: "50000.00", categoryId: "c", enabled: false });
    expect(draftFromConditions([...conditions, { field: "text", op: "contains", value: "otra" }])).toBeNull();
    expect(draftFromConditions([{ field: "amount", op: "gt", value: "1" }])).toBeNull();
  });
  it("la condición se escribe en lenguaje de persona", () => {
    const texts: ConditionTexts = {
      institution: "Institución: {name}",
      kind: "Tipo: {kind}",
      kinds: { income: "Ingreso" },
      text: { contains: "Texto contiene «{text}»", starts_with: "Texto empieza por «{text}»", eq: "Texto es «{text}»" },
      amountMin: "Monto desde {amount}",
      amountMax: "Monto hasta {amount}",
      dayMin: "Día desde el {day}",
      dayMax: "Día hasta el {day}",
    };
    const d = (field: string, op: string, value: string) => describeCondition({ field, op, value }, texts, (code) => (code === "bancolombia" ? "Bancolombia" : undefined));
    expect(d("institution", "eq", "bancolombia")).toBe("Institución: Bancolombia");
    expect(d("institution", "eq", "otro")).toBe("Institución: otro");
    expect(d("kind", "eq", "income")).toBe("Tipo: Ingreso");
    expect(d("text", "starts_with", "nomina")).toBe("Texto empieza por «nomina»");
    expect(d("amount", "gte", "3000000.00")).toBe("Monto desde $3.000.000");
    expect(d("amount", "lte", "3500000.00")).toBe("Monto hasta $3.500.000");
    expect(d("day_of_month", "lte", "17")).toBe("Día hasta el 17");
    expect(d("raro", "eq", "x")).toBe("raro eq x");
  });
  it("el nombre de una regla sugerida respeta el tope", () => {
    expect(suggestedRuleName({ text: "nomina acme" }, "Sugerida:")).toBe("Sugerida: nomina acme");
    expect(suggestedRuleName({ text: "x".repeat(200) }, "Sugerida:").length).toBeLessThanOrEqual(80);
  });
});

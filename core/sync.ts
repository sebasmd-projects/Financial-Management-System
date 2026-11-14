/**
 * Bancos por correo, solo lectura (plan `docs/bank-integration-plan.md`, tickets W1 a W3 y M1 a M2), sin nada de plataforma: lo comparten la
 * web y la app. Aquí está el cliente de las rutas `sync/*` y la lógica pura: la salud de una conexión, qué se puede cambiar de una propuesta,
 * el cuerpo de «Modificar» (solo lo que cambió), el armado de una regla de autoconfirmación y el enlace «Ir al correo».
 *
 * Reglas que esta capa cumple por construcción:
 *  - el correo nunca se muestra: la API no lo trae y aquí solo hay campos extraídos y un enlace a la web del proveedor;
 *  - los montos son cadenas decimales (`core/money`, `core/amount-input`): nunca `Number`; nunca en una URL;
 *  - la dirección de reenvío solo existe en la respuesta de crear y de rotar: no se guarda, y aquí no hay dónde guardarla.
 */
import type { ApiResult, RequestOptions } from "./api/client";
import type { components } from "./api/schema.gen";
import { normalizeAmountInput, parsePositiveAmount } from "./amount-input";
import { isBusinessDate } from "./dates";
import { toInt } from "./ints";
import { compareAmounts, formatCop } from "./money";

type S = components["schemas"];

export type SyncCatalog = S["SyncCatalog"];
export type SyncInstitution = S["SyncInstitution"];
export type SyncConnection = S["SyncConnection"];
export type SyncConnectionHealth = S["SyncConnectionHealth"];
export type SyncConnectionCreate = S["SyncConnectionCreate"];
export type SyncConnectionPatch = S["PatchedSyncConnectionPatch"];
export type SyncConnectionPage = S["SyncConnectionPage"];
export type SyncEvent = S["SyncEvent"];
export type SyncEventPage = S["SyncEventPage"];
export type SyncEventModify = S["SyncEventModify"];
export type SyncEventSummary = S["SyncEventSummary"];
export type SyncRuleSuggestion = S["SyncRuleSuggestion"];
export type SyncSettings = S["SyncSettings"];
export type MailLink = S["MailLink"];
export type Provider = S["ProviderEnum"];
export type CustomRule = S["CustomRule"];
export type RuleCondition = S["Condition"];
/** Una condición tal como llega en una sugerencia o se escribe en una prueba: campo, operador y valor son texto. */
export interface LooseCondition {
  field: string;
  op: string;
  value: string;
}
export type RuleCreate = S["CustomRuleCreate"];
export type RulePatch = S["PatchedCustomRulePatch"];
export type DryRun = S["DryRun"];
export type EventStatus = S["SyncEventStatusEnum"];
export type EventKind = "income" | "expense" | "transfer_in" | "transfer_out";

const id = (value: string) => encodeURIComponent(value);

/** Las rutas (sin el ámbito: en un Hogar, `connections` y `events` cuelgan de `households/{id}/…`; lo demás es personal). Nada de montos. */
export const syncPaths = {
  catalog: "/sync/catalog",
  connections: "/sync/connections",
  connection: (connectionId: string) => `/sync/connections/${id(connectionId)}`,
  rotate: (connectionId: string) => `/sync/connections/${id(connectionId)}/rotate`,
  health: (connectionId: string) => `/sync/connections/${id(connectionId)}/health`,
  events: (status: "proposed" | "all", page = 1) => `/sync/events?status=${status}&page=${page}&page_size=50`,
  summary: "/sync/events/summary",
  event: (eventId: string) => `/sync/events/${id(eventId)}`,
  approve: (eventId: string) => `/sync/events/${id(eventId)}/approve`,
  modify: (eventId: string) => `/sync/events/${id(eventId)}/modify`,
  discard: (eventId: string) => `/sync/events/${id(eventId)}/discard`,
  undo: (eventId: string) => `/sync/events/${id(eventId)}/undo`,
  suggestions: "/sync/rule-suggestions",
  dismissSuggestion: "/sync/rule-suggestions/dismiss",
  settings: "/sync/settings",
  rules: "/automation/rules?page_size=100",
  rulesRoot: "/automation/rules",
  rule: (ruleId: string) => `/automation/rules/${id(ruleId)}`,
  ruleTest: (ruleId: string) => `/automation/rules/${id(ruleId)}/test`,
  rulePreview: "/automation/rules/preview",
} as const;

/** Lo mínimo que se pide al cliente de la API: el de la web y el de la app lo cumplen (con el ámbito ya aplicado a `connections` y `events`). */
export interface SyncClient {
  get<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>>;
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>>;
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>>;
  delete<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>>;
}

/** `key` es la `Idempotency-Key` de la intención de la persona (crear, rotar, aprobar, modificar, descartar y deshacer la llevan). */
export function syncApi(client: SyncClient) {
  const keyed = (key: string, options?: RequestOptions): RequestOptions => ({ ...options, idempotencyKey: key });
  return {
    catalog: (options?: RequestOptions) => client.get<SyncCatalog>(syncPaths.catalog, options),
    connections: (options?: RequestOptions) => client.get<SyncConnectionPage>(`${syncPaths.connections}?page_size=100`, options),
    connection: (connectionId: string, options?: RequestOptions) => client.get<SyncConnection>(syncPaths.connection(connectionId), options),
    createConnection: (body: SyncConnectionCreate, key: string, options?: RequestOptions) => client.post<SyncConnection>(syncPaths.connections, body, keyed(key, options)),
    patchConnection: (connectionId: string, body: SyncConnectionPatch, options?: RequestOptions) => client.patch<SyncConnection>(syncPaths.connection(connectionId), body, options),
    health: (connectionId: string, options?: RequestOptions) => client.get<SyncConnectionHealth>(syncPaths.health(connectionId), options),
    rotate: (connectionId: string, key: string, options?: RequestOptions) => client.post<SyncConnection>(syncPaths.rotate(connectionId), undefined, keyed(key, options)),
    deleteConnection: (connectionId: string, options?: RequestOptions) => client.delete<void>(syncPaths.connection(connectionId), options),
    events: (status: "proposed" | "all", options?: RequestOptions) => client.get<SyncEventPage>(syncPaths.events(status), options),
    summary: (options?: RequestOptions) => client.get<SyncEventSummary>(syncPaths.summary, options),
    approve: (eventId: string, key: string, options?: RequestOptions) => client.post<SyncEvent>(syncPaths.approve(eventId), undefined, keyed(key, options)),
    modify: (eventId: string, body: SyncEventModify, key: string, options?: RequestOptions) => client.post<SyncEvent>(syncPaths.modify(eventId), body, keyed(key, options)),
    discard: (eventId: string, key: string, options?: RequestOptions) => client.post<SyncEvent>(syncPaths.discard(eventId), undefined, keyed(key, options)),
    undo: (eventId: string, key: string, options?: RequestOptions) => client.post<SyncEvent>(syncPaths.undo(eventId), undefined, keyed(key, options)),
    suggestions: (options?: RequestOptions) => client.get<{ results: SyncRuleSuggestion[] }>(syncPaths.suggestions, options),
    dismissSuggestion: (key: string, options?: RequestOptions) => client.post<void>(syncPaths.dismissSuggestion, { key }, options),
    settings: (options?: RequestOptions) => client.get<SyncSettings>(syncPaths.settings, options),
    rules: (options?: RequestOptions) => client.get<{ results: CustomRule[] }>(syncPaths.rules, options),
    createRule: (body: RuleCreate, key: string, options?: RequestOptions) => client.post<CustomRule>(syncPaths.rulesRoot, body, keyed(key, options)),
    patchRule: (ruleId: string, body: RulePatch, options?: RequestOptions) => client.patch<CustomRule>(syncPaths.rule(ruleId), body, options),
    deleteRule: (ruleId: string, options?: RequestOptions) => client.delete<void>(syncPaths.rule(ruleId), options),
    previewRule: (body: { trigger: "sync_event"; conditions: RuleCondition[] }, options?: RequestOptions) => client.post<DryRun>(syncPaths.rulePreview, body, options),
  };
}

// --- conexiones ---------------------------------------------------------------------------------------------------------------------

export type Health = "paused" | "waiting" | "ok" | "quiet" | "error" | "unknown";

/**
 * La salud que se le muestra a la persona. **La decide el servidor** (`GET sync/connections/{id}/health`: su último evento, el código del último
 * error y su umbral de silencio `quiet_days`): aquí ya no hay una regla de días. Una conexión pausada se ve pausada aunque la salud aún no haya
 * llegado; sin respuesta del servidor (cargando o con error) el estado es `unknown` y la pantalla no afirma nada. `days` son los días desde el
 * último correo y `code` el código del último error (nunca su contenido).
 */
export function connectionHealth(
  connection: Pick<SyncConnection, "status">,
  health: Pick<SyncConnectionHealth, "state" | "days_since_last_event" | "last_error_code"> | null | undefined,
): { state: Health; days: number; code: string | null } {
  if (connection.status === "paused") return { state: "paused", days: 0, code: null };
  if (!health || health.state === "paused") return { state: "unknown", days: 0, code: null };
  return { state: health.state, days: health.days_since_last_event, code: health.last_error_code };
}

/** ¿Hay un código de confirmación de reenvío vigente (Gmail)? El servidor ya no lo manda pasadas las 24 h; se cuida igual la hora. */
export function activeForwardingCode(connection: Pick<SyncConnection, "forwarding_code" | "forwarding_code_expires_at">, now: Date = new Date()): string | null {
  if (!connection.forwarding_code) return null;
  const expires = connection.forwarding_code_expires_at ? Date.parse(connection.forwarding_code_expires_at) : Number.NaN;
  if (Number.isNaN(expires) || expires <= now.getTime()) return null;
  return connection.forwarding_code;
}

/** Las instituciones que se ofrecen: en la web, sin las que solo se activan en la app (Nequi y Nu); en la app, todas. */
export function offeredInstitutions(catalog: Pick<SyncCatalog, "institutions">, platform: "web" | "app"): SyncInstitution[] {
  return catalog.institutions.filter((institution) => platform === "app" || !institution.mobile_only);
}

/** ¿Esta institución ya tiene una conexión con esta cuenta? (el servidor lo permite; solo se avisa para no duplicar por descuido). */
export function hasConnection(connections: readonly Pick<SyncConnection, "institution_id" | "account_id">[], institutionId: number, accountId: string): boolean {
  return connections.some((c) => c.institution_id === institutionId && c.account_id === accountId);
}

/** Las cuentas a las que un banco puede mandar movimientos por correo: las bancarias (el servidor igual valida `invalid_account_for_sync`). */
const BANK_ACCOUNT_KINDS: ReadonlySet<string> = new Set(["savings", "checking", "wallet", "pocket", "fund"]);
export const isBankAccount = (account: { kind: string; status: string }): boolean => BANK_ACCOUNT_KINDS.has(account.kind) && account.status !== "closed";

export const PROVIDER_ORDER: readonly Provider[] = ["gmail", "outlook", "other"];

/** Los proveedores del catálogo en un orden estable (el servidor puede mandar más de los que la interfaz sabe explicar). */
export function offeredProviders(catalog: Pick<SyncCatalog, "providers">): Provider[] {
  return PROVIDER_ORDER.filter((p) => catalog.providers.includes(p));
}

/** El subdominio de ingesta que corresponde al idioma de la persona (el servidor también lo resuelve con `locale`). */
export function ingestDomain(catalog: Pick<SyncCatalog, "ingest_domains">, locale: string): string | null {
  return catalog.ingest_domains[locale] ?? catalog.ingest_domains.default ?? null;
}

/** El cuerpo de «Conectar». El `locale` elige el subdominio de ingesta; la etiqueta es opcional. */
export function createConnectionBody(input: { institutionId: number; accountId: string; provider: Provider; label: string; includeStatements: boolean; locale: string }): SyncConnectionCreate {
  const label = input.label.trim();
  return { institution_id: input.institutionId, account_id: input.accountId, provider: input.provider, include_statements: input.includeStatements, locale: input.locale, ...(label ? { label } : {}) };
}

// --- «Ir al correo» -----------------------------------------------------------------------------------------------------------------

/** Los hosts de «Ir al correo» por proveedor: lo que publica `sync/catalog` (`mail_link_hosts`). */
export type MailHosts = Readonly<Record<string, readonly string[]>>;

/** La lista incorporada, la misma que hoy genera el servidor: se usa mientras el catálogo no llega o si falla. */
export const DEFAULT_MAIL_HOSTS: MailHosts = { gmail: ["mail.google.com"], outlook: ["outlook.live.com"], other: [] };

const HOSTNAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * Los hosts permitidos según el catálogo del servidor. Solo se aceptan nombres de host planos (sin esquema, ruta, puerto ni comodines); si el
 * catálogo no llegó o no trae ninguno válido, la lista incorporada. Nunca se amplía la lista con algo que no sea un host.
 */
export function mailHostsFrom(catalog: Partial<Pick<SyncCatalog, "mail_link_hosts">> | null | undefined): MailHosts {
  const raw = catalog?.mail_link_hosts;
  if (!raw || typeof raw !== "object") return DEFAULT_MAIL_HOSTS;
  const out: Record<string, string[]> = {};
  for (const [provider, hosts] of Object.entries(raw)) {
    if (!Array.isArray(hosts)) continue;
    out[provider] = hosts.filter((h): h is string => typeof h === "string" && HOSTNAME.test(h));
  }
  return Object.values(out).some((hosts) => hosts.length > 0) ? out : DEFAULT_MAIL_HOSTS;
}

/**
 * «Ir al correo» solo lleva a un servidor de correo de la lista del servidor (o la incorporada). La URL viene del servidor, pero nunca se abre sin
 * comprobarla: HTTPS, sin usuario, contraseña ni puerto, y el host de ESE proveedor. Cualquier otra cosa (un esquema `javascript:`, otro dominio)
 * se descarta y solo queda la pista. Quien la abre lo hace con `noopener noreferrer`.
 */
export function safeMailUrl(link: Pick<MailLink, "url" | "provider"> | null | undefined, hosts: MailHosts = DEFAULT_MAIL_HOSTS): string | null {
  const raw = link?.url;
  if (!link || !raw || raw.length > 2048) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.port !== "") return null;
  const allowed = Object.prototype.hasOwnProperty.call(hosts, link.provider) ? hosts[link.provider] : [];
  return allowed.includes(parsed.hostname) ? parsed.toString() : null;
}

// --- propuestas («Por revisar») -----------------------------------------------------------------------------------------------------

/** Lo que ya se decidió y se puede deshacer (anula con reverso lo que el lote confirmó; lo conciliado lo impide: `409 immutable_entry`). */
export const UNDOABLE: readonly EventStatus[] = ["approved", "modified", "auto_confirmed"];

export const isProposed = (event: Pick<SyncEvent, "status">): boolean => event.status === "proposed";
export const canUndo = (event: Pick<SyncEvent, "status">): boolean => UNDOABLE.includes(event.status);

/**
 * Qué se puede cambiar antes de aprobar. Una propuesta nueva se edita entera; si cruzó con un pendiente (la ocurrencia de una recurrencia) no se
 * cambia el tipo ni la cuenta; si cruzó con un movimiento ya confirmado solo se aprueba, no se modifica (`409 linked_to_existing`).
 */
export function editableFields(event: Pick<SyncEvent, "status" | "match">): { modify: boolean; type: boolean; account: boolean } {
  if (event.status !== "proposed") return { modify: false, type: false, account: false };
  if (event.match === "new" || event.match === "") return { modify: true, type: true, account: true };
  if (event.match === "matches_pending") return { modify: true, type: false, account: false };
  return { modify: false, type: false, account: false };
}

/** El tipo del movimiento (`income` o `expense`) de un evento; las transferencias no se cambian aquí. */
export function eventMoneyType(kind: SyncEvent["kind"]): "income" | "expense" | null {
  if (kind === "income" || kind === "transfer_in") return "income";
  if (kind === "expense" || kind === "transfer_out") return "expense";
  return null;
}

export interface ModifyDraft {
  type: "income" | "expense";
  amount: string;
  date: string;
  accountId: string;
  categoryId: string;
  counterparty: string;
  description: string;
  notes: string;
}

/** El borrador de «Modificar» con lo que el evento ya trae (todo editable, el monto incluido). */
export function draftFromEvent(event: SyncEvent): ModifyDraft {
  return {
    type: eventMoneyType(event.kind) ?? "expense",
    amount: event.amount ?? "",
    date: event.date ?? "",
    accountId: event.account_id,
    categoryId: event.suggested_category_id ?? "",
    counterparty: event.counterparty ?? "",
    description: event.description ?? "",
    notes: event.notes ?? "",
  };
}

export type ModifyProblem = "amount" | "date" | "counterparty" | "description" | "notes" | "no_changes";

export type ModifyResult = { ok: true; body: SyncEventModify } | { ok: false; problems: ModifyProblem[] };

const LIMITS = { counterparty: 120, description: 200, notes: 280 } as const;

/**
 * El cuerpo de «Modificar»: SOLO lo que cambió (el servidor audita antes y después, y `modify` sin cambios es un error). El monto se lee con
 * `core/amount-input` (texto, hasta 2 decimales, nunca se redondea) y tiene que ser positivo; la fecha, una fecha de negocio. Descripción y
 * nota vienen en el evento (lo actual): se envían solo si cambiaron, y vaciarlas las borra (`null`).
 */
export function buildModify(event: SyncEvent, draft: ModifyDraft): ModifyResult {
  const fields = editableFields(event);
  const problems: ModifyProblem[] = [];
  const body: SyncEventModify = {};

  const amount = parsePositiveAmount(draft.amount);
  if (amount === null) problems.push("amount");
  else if (event.amount === null || compareAmounts(amount, event.amount) !== 0) body.amount = amount;

  if (!isBusinessDate(draft.date)) problems.push("date");
  else if (draft.date !== event.date) body.date = draft.date;

  const originalType = eventMoneyType(event.kind);
  if (fields.type && originalType !== null && draft.type !== originalType) body.type = draft.type;
  if (fields.account && draft.accountId && draft.accountId !== event.account_id) body.account_id = draft.accountId;

  const originalCategory = event.suggested_category_id ?? "";
  if (draft.categoryId !== originalCategory) body.category_id = draft.categoryId || null;

  const counterparty = draft.counterparty.trim();
  if (counterparty.length > LIMITS.counterparty) problems.push("counterparty");
  else if (counterparty !== (event.counterparty ?? "")) body.counterparty = counterparty || null;

  const description = draft.description.trim();
  if (description.length > LIMITS.description) problems.push("description");
  else if (description !== (event.description ?? "")) body.description = description || null;

  const notes = draft.notes.trim();
  if (notes.length > LIMITS.notes) problems.push("notes");
  else if (notes !== (event.notes ?? "")) body.notes = notes || null;

  if (problems.length > 0) return { ok: false, problems };
  if (Object.keys(body).length === 0) return { ok: false, problems: ["no_changes"] };
  return { ok: true, body };
}

// --- reglas de autoconfirmación -----------------------------------------------------------------------------------------------------

export const TEXT_OPS = ["contains", "starts_with", "eq"] as const;
export type TextOp = (typeof TEXT_OPS)[number];
export const TEXT_MIN = 3;
export const TEXT_MAX = 60;

export interface AutoRuleDraft {
  name: string;
  /** Código de la institución del catálogo, o `""` para cualquiera. */
  institution: string;
  /** `""` = cualquiera. */
  kind: "" | EventKind;
  textOp: TextOp;
  text: string;
  amountMin: string;
  amountMax: string;
  dayMin: string;
  dayMax: string;
  categoryId: string;
  counterparty: string;
  enabled: boolean;
}

export const emptyAutoRule = (): AutoRuleDraft => ({ name: "", institution: "", kind: "", textOp: "contains", text: "", amountMin: "", amountMax: "", dayMin: "", dayMax: "", categoryId: "", counterparty: "", enabled: true });

export type AutoRuleProblem = "name" | "text" | "amount_min" | "amount_max" | "amount_range" | "day_min" | "day_max" | "day_range" | "counterparty" | "no_conditions";

export type AutoRuleResult = { ok: true; body: RuleCreate; conditions: RuleCondition[] } | { ok: false; problems: AutoRuleProblem[] };

const MAX_NAME = 80;
const MAX_ACTION_COUNTERPARTY = 120;

/**
 * Las condiciones de la regla en el orden del catálogo (se combinan con «y»). Todas son opcionales —también el monto: propietario, 2026-11-14—
 * pero tiene que haber al menos una. El texto se compara LITERAL, de 3 a 60 caracteres: aquí no hay expresiones regulares ni plantillas.
 */
export function buildAutoRule(draft: AutoRuleDraft): AutoRuleResult {
  const problems: AutoRuleProblem[] = [];
  const conditions: RuleCondition[] = [];

  const name = draft.name.trim();
  if (name === "" || name.length > MAX_NAME) problems.push("name");

  if (draft.institution) conditions.push({ field: "institution", op: "eq", value: draft.institution });
  if (draft.kind) conditions.push({ field: "kind", op: "eq", value: draft.kind });

  const text = draft.text.trim();
  if (text !== "") {
    if (text.length < TEXT_MIN || text.length > TEXT_MAX) problems.push("text");
    else conditions.push({ field: "text", op: draft.textOp, value: text });
  }

  const min = draft.amountMin.trim() === "" ? null : normalizeAmountInput(draft.amountMin);
  const max = draft.amountMax.trim() === "" ? null : normalizeAmountInput(draft.amountMax);
  if (draft.amountMin.trim() !== "" && min === null) problems.push("amount_min");
  if (draft.amountMax.trim() !== "" && max === null) problems.push("amount_max");
  if (min !== null && max !== null && compareAmounts(min, max) > 0) problems.push("amount_range");
  if (min !== null) conditions.push({ field: "amount", op: "gte", value: min });
  if (max !== null) conditions.push({ field: "amount", op: "lte", value: max });

  const dayMin = day(draft.dayMin);
  const dayMax = day(draft.dayMax);
  if (draft.dayMin.trim() !== "" && dayMin === null) problems.push("day_min");
  if (draft.dayMax.trim() !== "" && dayMax === null) problems.push("day_max");
  if (dayMin !== null && dayMax !== null && dayMin > dayMax) problems.push("day_range");
  if (dayMin !== null) conditions.push({ field: "day_of_month", op: "gte", value: String(dayMin) });
  if (dayMax !== null) conditions.push({ field: "day_of_month", op: "lte", value: String(dayMax) });

  const counterparty = draft.counterparty.trim();
  if (counterparty.length > MAX_ACTION_COUNTERPARTY) problems.push("counterparty");

  if (problems.length === 0 && conditions.length === 0) problems.push("no_conditions");
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    conditions,
    body: {
      name,
      trigger: "sync_event",
      action: "auto_confirm",
      conditions,
      action_category_id: draft.categoryId || null,
      action_counterparty: counterparty || null,
      enabled: draft.enabled,
      // El aviso de una regla que confirma lo manda el centro de avisos (`sync_auto_confirmed`): estos campos son los de cualquier regla.
      channels: ["app"],
      severity: "info",
      cooldown_days: 7,
    },
  };
}

function day(text: string): number | null {
  return toInt(text.trim(), 1, 31);
}

/** Las condiciones guardadas → el borrador para editar. `null` si la regla no cabe en el formulario (un campo repetido, un operador raro): se pausa o se borra, no se edita. */
export function draftFromRule(rule: Pick<CustomRule, "name" | "action_category_id" | "action_counterparty" | "enabled"> & { conditions: readonly LooseCondition[] }): AutoRuleDraft | null {
  const draft = draftFromConditions(rule.conditions);
  if (draft === null) return null;
  return { ...draft, name: rule.name, categoryId: rule.action_category_id ?? "", counterparty: rule.action_counterparty ?? "", enabled: rule.enabled };
}

/** Lo mismo desde las condiciones de una sugerencia (listas para `POST automation/rules`). */
export function draftFromConditions(conditions: readonly LooseCondition[]): AutoRuleDraft | null {
  const draft = emptyAutoRule();
  const seen = new Set<string>();
  for (const c of conditions) {
    const slot = `${c.field}:${c.field === "amount" || c.field === "day_of_month" ? c.op : ""}`;
    if (seen.has(slot)) return null;
    seen.add(slot);
    if (c.field === "institution" && c.op === "eq") draft.institution = c.value;
    else if (c.field === "kind" && c.op === "eq" && isKind(c.value)) draft.kind = c.value;
    else if (c.field === "text" && isTextOp(c.op)) {
      draft.textOp = c.op;
      draft.text = c.value;
    } else if (c.field === "amount" && c.op === "gte") draft.amountMin = c.value;
    else if (c.field === "amount" && c.op === "lte") draft.amountMax = c.value;
    else if (c.field === "day_of_month" && c.op === "gte") draft.dayMin = c.value;
    else if (c.field === "day_of_month" && c.op === "lte") draft.dayMax = c.value;
    else return null;
  }
  return draft;
}

export const isTextOp = (value: string): value is TextOp => (TEXT_OPS as readonly string[]).includes(value);
const isKind = (value: string): value is EventKind => value === "income" || value === "expense" || value === "transfer_in" || value === "transfer_out";

/** Los textos con los que se escribe una condición en lenguaje de persona (cada plataforma pone los suyos). */
export interface ConditionTexts {
  institution: string;
  kind: string;
  kinds: Record<string, string>;
  text: Record<TextOp, string>;
  amountMin: string;
  amountMax: string;
  dayMin: string;
  dayMax: string;
}

const fillText = (template: string, vars: Record<string, string>): string => template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? vars[name] : whole));

/** «Institución: bancolombia», «Tipo: Ingreso», «Comercio o contraparte contiene “nomina acme”», «Monto desde $3.000.000», «Día del mes hasta 17». */
export function describeCondition(condition: LooseCondition, texts: ConditionTexts, institutionName?: (code: string) => string | undefined): string {
  const { field, op, value } = condition;
  if (field === "institution") return fillText(texts.institution, { name: institutionName?.(value) ?? value });
  if (field === "kind") return fillText(texts.kind, { kind: texts.kinds[value] ?? value });
  if (field === "text") return fillText(isTextOp(op) ? texts.text[op] : texts.text.eq, { text: value });
  if (field === "amount") return fillText(op === "lte" ? texts.amountMax : texts.amountMin, { amount: formatCop(value) });
  if (field === "day_of_month") return fillText(op === "lte" ? texts.dayMax : texts.dayMin, { day: value });
  return `${field} ${op} ${value}`;
}

/** Las reglas que esta pantalla gestiona: las del disparador de los correos de los bancos (el resto vive en «Reglas»). */
export const isAutoConfirmRule = (rule: Pick<CustomRule, "trigger">): boolean => rule.trigger === "sync_event";

/** El nombre con que se crea una regla aceptada desde una sugerencia: el texto que la sugirió. */
export function suggestedRuleName(suggestion: Pick<SyncRuleSuggestion, "text">, prefix: string): string {
  const text = suggestion.text.trim().slice(0, MAX_NAME - prefix.length - 1);
  return `${prefix} ${text}`.trim().slice(0, MAX_NAME);
}

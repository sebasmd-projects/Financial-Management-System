import type { ImportAction, ImportMapping, ImportPreviewRow } from "@/api/models";

/** Tope del servidor (`FMS_ATTACHMENT_MAX_BYTES`): se avisa antes de subir. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".ofx", ".qfx", ".txt"] as const;

export const DATE_FORMATS = ["%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d", "%d-%m-%Y", "%Y/%m/%d", "%d/%m/%y", "%d.%m.%Y", "%Y%m%d", "serial"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export function fileProblem(file: { name: string; size: number }): "too_large" | "empty" | "extension" | null {
  if (file.size === 0) return "empty";
  if (file.size > MAX_UPLOAD_BYTES) return "too_large";
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext)) ? null : "extension";
}

/** El mapeo tal como se edita: todo texto (los títulos de las columnas son los del archivo). */
export interface MappingForm {
  date: string;
  description: string;
  /** `single`: una columna con signo. `split`: débito y crédito por separado. */
  mode: "single" | "split";
  amount: string;
  debit: string;
  credit: string;
  reference: string;
  balance: string;
  dateFormat: DateFormat | "";
  decimalSep: "." | ",";
  thousandsSep: "" | "." | "," | " ";
  headerRow: string;
  /** Solo tarjetas: la columna con las cuotas de cada compra (`""`: una cuota). */
  installments: string;
}

export const EMPTY_MAPPING: MappingForm = { date: "", description: "", mode: "single", amount: "", debit: "", credit: "", reference: "", balance: "", dateFormat: "", decimalSep: ",", thousandsSep: ".", headerRow: "0", installments: "" };

/** Título de `headers` que coincide (sin mayúsculas) con el sugerido; `""` si no hay. */
function inHeaders(headers: readonly string[], wanted: string | undefined): string {
  if (!wanted) return "";
  return headers.find((h) => h === wanted) ?? headers.find((h) => h.trim().toLowerCase() === wanted.trim().toLowerCase()) ?? "";
}

/** Punto de partida del formulario: el mapeo vigente, o la propuesta del servidor. Nunca se adivina la fecha: la confirma la persona. */
export function initialMapping(headers: readonly string[], current: ImportMapping | null, suggested: Record<string, string> | null): MappingForm {
  if (current) {
    const split = !current.amount && (Boolean(current.debit) || Boolean(current.credit));
    return {
      date: inHeaders(headers, current.date),
      description: inHeaders(headers, current.description),
      mode: split ? "split" : "single",
      amount: inHeaders(headers, current.amount),
      debit: inHeaders(headers, current.debit),
      credit: inHeaders(headers, current.credit),
      reference: inHeaders(headers, current.reference),
      balance: inHeaders(headers, current.balance),
      dateFormat: (DATE_FORMATS as readonly string[]).includes(current.date_format) ? (current.date_format as DateFormat) : "",
      decimalSep: current.decimal_sep === "." ? "." : ",",
      thousandsSep: (current.thousands_sep as MappingForm["thousandsSep"] | undefined) ?? ".",
      headerRow: String(current.header_row ?? 0),
      installments: inHeaders(headers, current.installments),
    };
  }
  const s = suggested ?? {};
  const split = !s.amount && (Boolean(s.debit) || Boolean(s.credit));
  return {
    ...EMPTY_MAPPING,
    date: inHeaders(headers, s.date),
    description: inHeaders(headers, s.description),
    mode: split ? "split" : "single",
    amount: inHeaders(headers, s.amount),
    debit: inHeaders(headers, s.debit),
    credit: inHeaders(headers, s.credit),
    reference: inHeaders(headers, s.reference),
    balance: inHeaders(headers, s.balance),
    installments: inHeaders(headers, s.installments),
    decimalSep: s.decimal_sep === "." ? "." : ",",
    thousandsSep: s.thousands_sep === "," ? "," : s.thousands_sep === " " ? " " : s.thousands_sep === "" ? "" : s.decimal_sep === "." ? "," : ".",
  };
}

export type MappingProblem = "date" | "amount" | "debit_credit" | "date_format" | "header_row" | "same_separator";

export function mappingProblems(form: MappingForm): MappingProblem[] {
  const out: MappingProblem[] = [];
  if (!form.date) out.push("date");
  if (form.mode === "single" && !form.amount) out.push("amount");
  if (form.mode === "split" && (!form.debit || !form.credit)) out.push("debit_credit");
  if (!form.dateFormat) out.push("date_format");
  if (!/^\d{1,2}$/.test(form.headerRow.trim()) || +form.headerRow.trim() > 50) out.push("header_row");
  if (form.thousandsSep !== "" && form.thousandsSep === form.decimalSep) out.push("same_separator");
  return out;
}

/** El cuerpo de `mapping` que espera la API, o `null` si el formulario tiene problemas. */
export function mappingToApi(form: MappingForm): ImportMapping | null {
  if (mappingProblems(form).length > 0 || form.dateFormat === "") return null;
  return {
    date: form.date,
    description: form.description,
    amount: form.mode === "single" ? form.amount : "",
    debit: form.mode === "split" ? form.debit : "",
    credit: form.mode === "split" ? form.credit : "",
    reference: form.reference,
    balance: form.balance,
    date_format: form.dateFormat,
    decimal_sep: form.decimalSep,
    thousands_sep: form.thousandsSep,
    header_row: +form.headerRow.trim(),
    installments: form.installments,
  };
}

/** Las clases de fila de una tarjeta (el servidor propone una por la descripción; la persona la cambia). */
export const CARD_KINDS = ["purchase", "advance", "interest", "fee", "insurance", "payment", "refund", "adjustment"] as const;
export type CardKind = (typeof CARD_KINDS)[number];
export type SignChoice = "auto" | "charges_negative" | "charges_positive";
export const SIGN_CHOICES: readonly SignChoice[] = ["auto", "charges_negative", "charges_positive"];
export const MAX_INSTALLMENTS = 48;
/** «Pago desde una cuenta que no llevo»: el valor que el servidor espera en `counter_account`. */
export const UNREGISTERED = "unregistered";

/** Lo que la persona cambió de una fila de tarjeta; viaja en `edits` y el servidor lo aplica al recalcular la vista previa. */
export interface RowEdit {
  kind?: CardKind;
  installments?: number;
  counterAccount?: string;
}

/** Las clases que caben con el signo de la fila (el servidor ya la trae con el cargo negativo): un cargo no es un pago. */
export function kindsForAmount(amount: string): CardKind[] {
  return amount.startsWith("-") ? ["purchase", "advance", "interest", "fee", "insurance", "adjustment"] : ["payment", "refund", "adjustment"];
}

/** Lo que impide importar una fila hasta que la persona decida (la acción por defecto es omitirla). */
export const BLOCKING_ISSUES: ReadonlySet<string> = new Set(["payment_source_required", "possible_payment_in_account", "advance_account_required", "refund_without_original", "exceeds_card_balance"]);

export function isBlocked(row: Pick<ImportPreviewRow, "issue">): boolean {
  return BLOCKING_ISSUES.has(row.issue);
}

/** Aplica un cambio a una fila; un cambio vacío la saca de las ediciones. */
export function withEdit(edits: ReadonlyMap<number, RowEdit>, row: number, patch: RowEdit): Map<number, RowEdit> {
  const next = new Map(edits);
  const before: RowEdit = { ...next.get(row) };
  if (patch.kind !== undefined && patch.kind !== before.kind) {
    delete before.counterAccount; // la cuenta y las cuotas dependen de la clase: al cambiarla se vuelve a decidir
    delete before.installments;
  }
  const merged: RowEdit = { ...before, ...patch };
  if (merged.kind === undefined && merged.installments === undefined && merged.counterAccount === undefined) next.delete(row);
  else next.set(row, merged);
  return next;
}

/** El cuerpo `edits` que espera la API, o `null` si no hay cambios. */
export function editsBody(edits: ReadonlyMap<number, RowEdit>): Record<string, { kind?: CardKind; installments?: number; counter_account?: string }> | null {
  if (edits.size === 0) return null;
  return Object.fromEntries(
    [...edits].map(([row, e]) => [String(row), { ...(e.kind ? { kind: e.kind } : {}), ...(e.installments ? { installments: e.installments } : {}), ...(e.counterAccount ? { counter_account: e.counterAccount } : {}) }]),
  );
}

export interface UploadInput {
  file: File;
  accountId: string;
  mapping: ImportMapping | null;
  overrides?: Record<string, "import" | "skip">;
  saveMapping?: boolean;
  /** Solo tarjetas: cómo viene el signo de los valores y lo que la persona cambió de cada fila. */
  sign?: SignChoice;
  edits?: ReadonlyMap<number, RowEdit>;
}

/** El multipart de `POST imports/preview` y `POST imports`. El archivo se lee solo para enviarlo: no se guarda en ningún lado. */
export function buildUpload(input: UploadInput): FormData {
  const form = new FormData();
  form.set("file", input.file);
  form.set("account_id", input.accountId);
  if (input.mapping) form.set("mapping", JSON.stringify(input.mapping));
  if (input.overrides && Object.keys(input.overrides).length > 0) form.set("overrides", JSON.stringify(input.overrides));
  if (input.saveMapping !== undefined) form.set("save_mapping", input.saveMapping ? "true" : "false");
  if (input.sign && input.sign !== "auto") form.set("sign", input.sign);
  const edits = editsBody(input.edits ?? new Map());
  if (edits) form.set("edits", JSON.stringify(edits));
  return form;
}

/** La huella de una intención de importar (para la `Idempotency-Key`): identifica el archivo sin leerlo ni guardarlo. */
export function uploadFingerprint(input: UploadInput): unknown {
  return { name: input.file.name, size: input.file.size, modified: input.file.lastModified, account: input.accountId, mapping: input.mapping, overrides: input.overrides ?? {}, save: input.saveMapping ?? null, sign: input.sign ?? "auto", edits: editsBody(input.edits ?? new Map()) };
}

/** La acción efectiva de una fila: lo que decidió la persona, o la de por defecto. */
export function effectiveAction(row: Pick<ImportPreviewRow, "number" | "action">, choices: ReadonlyMap<number, "import" | "skip">): ImportAction {
  return choices.get(row.number) ?? row.action;
}

/** Marcar o desmarcar una fila. Un duplicado exacto no se puede importar nunca. */
export function toggleRow(row: Pick<ImportPreviewRow, "number" | "action" | "match">, include: boolean, choices: ReadonlyMap<number, "import" | "skip">): Map<number, "import" | "skip"> {
  const next = new Map(choices);
  if (row.match === "duplicate") return next;
  if (include) {
    // Volver al valor por defecto si ya incluía; si lo omitía por defecto (posible duplicado), pedir importarla.
    if (row.action === "skip") next.set(row.number, "import");
    else next.delete(row.number);
  } else if (row.action === "skip") {
    next.delete(row.number);
  } else {
    next.set(row.number, "skip");
  }
  return next;
}

/** Solo las decisiones que cambian algo respecto de lo que propone el servidor. */
export function overridesBody(choices: ReadonlyMap<number, "import" | "skip">): Record<string, "import" | "skip"> {
  return Object.fromEntries([...choices].map(([row, action]) => [String(row), action]));
}

export interface Tally {
  import: number;
  confirm: number;
  link: number;
  skip: number;
}

export function tally(rows: readonly ImportPreviewRow[], choices: ReadonlyMap<number, "import" | "skip">): Tally {
  const out: Tally = { import: 0, confirm: 0, link: 0, skip: 0 };
  for (const row of rows) out[effectiveAction(row, choices)] += 1;
  return out;
}

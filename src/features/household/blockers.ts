import { SPENDABLE_KINDS } from "../finance/helpers";

/**
 * Por qué el servidor no deja pasar una cuenta al hogar (o sacarla): los códigos de `409`/`403` de `accounts/{id}/share` y de
 * `…/unshare`, y qué hacer en cada caso. Lógica pura; los textos viven en el diccionario.
 */

export type InUseKind = "reconciliations" | "recurrences" | "budgets" | "goals" | "imports" | "other";

const IN_USE_ORDER: readonly InUseKind[] = ["reconciliations", "recurrences", "budgets", "goals", "imports", "other"];

/** `account_in_use` trae en `detail` los módulos personales que apuntan a la cuenta (`app.modelo`, separados por coma). */
export function inUseKinds(detail: unknown): InUseKind[] {
  if (typeof detail !== "string") return ["other"];
  const found = new Set<InUseKind>();
  for (const label of detail.toLowerCase().split(",")) {
    const text = label.trim();
    if (text === "") continue;
    if (/reconcil/.test(text)) found.add("reconciliations");
    else if (/recurr|occurrence/.test(text)) found.add("recurrences");
    else if (/budget/.test(text)) found.add("budgets");
    else if (/goal/.test(text)) found.add("goals");
    else if (/import/.test(text)) found.add("imports");
    else found.add("other");
  }
  return found.size === 0 ? ["other"] : IN_USE_ORDER.filter((kind) => found.has(kind));
}

export type MoveBlockerCode =
  | "pending_entries"
  | "linked_transfers"
  | "reconciled_entries"
  | "account_in_use"
  | "account_not_movable"
  | "not_your_shared_account"
  | "household_read_only"
  | "entry_only_on_account"
  | "ledger_not_balanced";

const CODES: ReadonlySet<string> = new Set<MoveBlockerCode>([
  "pending_entries",
  "linked_transfers",
  "reconciled_entries",
  "account_in_use",
  "account_not_movable",
  "not_your_shared_account",
  "household_read_only",
  "entry_only_on_account",
  "ledger_not_balanced",
]);

export interface MoveBlocker {
  code: MoveBlockerCode;
  /** Solo en `account_in_use`: qué módulos personales usan la cuenta. */
  kinds: InUseKind[];
}

/** El bloqueo que entiende la interfaz, o `null` si el fallo es otro (red, sesión…) y toca el texto genérico. */
export function moveBlocker(failure: { code: string; data: unknown }): MoveBlocker | null {
  if (!CODES.has(failure.code)) return null;
  const code = failure.code as MoveBlockerCode;
  const detail = typeof failure.data === "object" && failure.data !== null ? (failure.data as { detail?: unknown }).detail : undefined;
  return { code, kinds: code === "account_in_use" ? inUseKinds(detail) : [] };
}

const MOVABLE_KINDS: readonly string[] = SPENDABLE_KINDS;

/** ¿Una cuenta puede ofrecerse para pasar al hogar? Solo bancos y efectivo, sin padre y que no sean del sistema (el servidor revisa lo demás). */
export function shareable(account: { kind: string; system_key: string; parent_id: string | null; type: string }): boolean {
  return account.type === "asset" && account.system_key === "" && account.parent_id === null && MOVABLE_KINDS.includes(account.kind);
}

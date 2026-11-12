import type { components } from "@/api/schema.gen";
import { SPENDABLE_KINDS } from "../finance/helpers";

/**
 * Por qué el servidor no deja pasar una cuenta al hogar (o sacarla): los códigos de `409`/`403` de `accounts/{id}/share` y de
 * `…/unshare`, y qué hacer en cada caso. Lógica pura; los textos viven en el diccionario. El detalle sale de `blockers: [{kind, count}]`
 * del propio `409` (legible por máquina): no se interpreta ningún texto.
 */

export type BlockerKind =
  | "reconciliation"
  | "recurrence"
  | "budget"
  | "goal"
  | "import"
  | "credit"
  | "asset"
  | "category"
  | "pending_entry"
  | "linked_transfer"
  | "reconciled_entry"
  | "system_account"
  | "not_asset_account"
  | "parent_account"
  | "child_account"
  | "other";

const KINDS: ReadonlySet<string> = new Set<BlockerKind>([
  "reconciliation",
  "recurrence",
  "budget",
  "goal",
  "import",
  "credit",
  "asset",
  "category",
  "pending_entry",
  "linked_transfer",
  "reconciled_entry",
  "system_account",
  "not_asset_account",
  "parent_account",
  "child_account",
  "other",
]);

export interface BlockerItem {
  kind: BlockerKind;
  count: number;
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
  /** Lo que lo impide, tal como lo dice `blockers` (vacío si el servidor no lo trae: entonces se explica el `code`). */
  items: BlockerItem[];
}

type Blocker = components["schemas"]["FmsBlocker"];

/** Los `blockers` del cuerpo del error: un tipo desconocido cae en `other`; lo que no es una lista válida se ignora. */
export function blockerItems(data: unknown): BlockerItem[] {
  const raw = typeof data === "object" && data !== null ? (data as { blockers?: unknown }).blockers : undefined;
  if (!Array.isArray(raw)) return [];
  const items: BlockerItem[] = [];
  for (const entry of raw as Partial<Blocker>[]) {
    if (typeof entry !== "object" || entry === null || typeof entry.kind !== "string") continue;
    const kind: BlockerKind = KINDS.has(entry.kind) ? (entry.kind as BlockerKind) : "other";
    const count = typeof entry.count === "number" && Number.isFinite(entry.count) ? entry.count : 0;
    const same = items.find((item) => item.kind === kind);
    if (same) same.count += count;
    else items.push({ kind, count });
  }
  return items;
}

/** El bloqueo que entiende la interfaz, o `null` si el fallo es otro (red, sesión…) y toca el texto genérico. */
export function moveBlocker(failure: { code: string; data: unknown }): MoveBlocker | null {
  if (!CODES.has(failure.code)) return null;
  return { code: failure.code as MoveBlockerCode, items: blockerItems(failure.data) };
}

const MOVABLE_KINDS: readonly string[] = SPENDABLE_KINDS;

/** ¿Una cuenta puede ofrecerse para pasar al hogar? Solo bancos y efectivo, sin padre y que no sean del sistema (el servidor revisa lo demás). */
export function shareable(account: { kind: string; system_key: string; parent_id: string | null; type: string }): boolean {
  return account.type === "asset" && account.system_key === "" && account.parent_id === null && MOVABLE_KINDS.includes(account.kind);
}

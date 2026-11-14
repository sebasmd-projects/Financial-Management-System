/** Cuentas de la conciliación (sin React): marcado y diferencia en centavos exactos, sobre cadenas decimales. */
import type { Candidate, Reconciliation } from "@/api/models";
import { addAmounts, compareAmounts, negateAmount } from "@/lib/money";

/** «Marcado en FMS» = lo ya conciliado + el efecto de cada movimiento marcado (igual que el servidor). */
export function markedBalance(reconciled: string, candidates: readonly Candidate[], selected: ReadonlySet<string>): string {
  return addAmounts(reconciled, ...candidates.filter((c) => selected.has(c.entry_id)).map((c) => c.effect));
}

/** Extracto − marcado. Con cero se puede conciliar. */
export function differenceOf(statement: string, marked: string): string {
  return addAmounts(statement, negateAmount(marked));
}

export function canReconcile(difference: string, selectedCount: number): boolean {
  return selectedCount > 0 && compareAmounts(difference, "0") === 0;
}

/** El saldo del extracto que escribió la persona (siempre positivo) con su casilla «negativo» → la cadena para la API. */
export function signedStatementBalance(normalized: string | null, negative: boolean): string | null {
  if (normalized === null) return null;
  return negative && compareAmounts(normalized, "0") !== 0 ? negateAmount(normalized) : normalized;
}

/** Solo se reabre la ÚLTIMA conciliación cerrada de la cuenta (la de mayor corte; en empate, la más reciente en cerrarse). Una «descuadrada»
 * (se eliminó un movimiento conciliado) cuenta como cerrada: se reabre para volver a conciliar. */
export function reopenable(list: readonly Reconciliation[]): Reconciliation | null {
  const closed = list.filter((r) => r.status === "closed" || r.status === "unbalanced");
  if (closed.length === 0) return null;
  return closed.reduce((best, r) => (r.cutoff > best.cutoff || (r.cutoff === best.cutoff && r.closed_at > best.closed_at) ? r : best));
}

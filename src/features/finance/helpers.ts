/**
 * Lógica pura de las pantallas financieras (sin React): agrupar cuentas, firmar montos, agrupar por día, frases de efecto.
 * Todo el dinero pasa por `@/lib/money` (BigInt sobre texto): nunca `Number`.
 */
import type { Account, Movement } from "@/api/models";
import { absAmount, addAmounts, compareAmounts, negateAmount } from "@/lib/money";

/** `fill("Quedan {balance}", { balance: "$1" })`. Lo que no esté en `vars` se deja tal cual. */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? vars[name] : whole));
}

export const SPENDABLE_KINDS = ["savings", "checking", "cash", "wallet", "pocket", "fund"] as const;
const BANK_KINDS = new Set(["savings", "checking", "wallet", "pocket", "fund"]);

export type AccountGroup = "bancos" | "efectivo" | "credito" | "prestamo" | "otro";

export function accountGroup(account: Pick<Account, "kind">): AccountGroup {
  if (BANK_KINDS.has(account.kind)) return "bancos";
  if (account.kind === "cash") return "efectivo";
  if (account.kind === "credit_card") return "credito";
  if (account.kind === "loan") return "prestamo";
  return "otro";
}

/** Cuentas de las que puede salir o entrar plata en un movimiento: las de activo y las tarjetas de crédito, sin cerrar. */
export function movementAccounts(accounts: readonly Account[]): Account[] {
  return accounts.filter((a) => a.status !== "closed" && (accountGroup(a) === "bancos" || accountGroup(a) === "efectivo" || a.kind === "credit_card"));
}

/** Cuentas propias que sirven de origen o destino de una transferencia (sin préstamos). */
export function transferAccounts(accounts: readonly Account[]): Account[] {
  return movementAccounts(accounts);
}

/** El monto con su signo para una lista: egreso negativo, ingreso positivo, transferencia sin signo. */
export function signedAmount(movement: Pick<Movement, "type" | "amount">): { value: string; sign: "auto" | "always" } {
  const magnitude = absAmount(movement.amount);
  if (movement.type === "expense") return { value: negateAmount(magnitude), sign: "auto" };
  if (movement.type === "income") return { value: magnitude, sign: "always" };
  return { value: magnitude, sign: "auto" };
}

/** Lo que el movimiento aporta al neto del día: ingresos suman, egresos restan; transferencias, pendientes y anulados no cuentan. */
export function netContribution(movement: Pick<Movement, "type" | "amount" | "status" | "voided">): string {
  if (movement.voided || movement.status === "pendiente" || movement.status === "anulado" || movement.type === "transfer") return "0.00";
  const magnitude = absAmount(movement.amount);
  return movement.type === "expense" ? negateAmount(magnitude) : addAmounts(magnitude);
}

export interface DayGroup<T> {
  date: string;
  items: T[];
}

/** Agrupa, conservando el orden de llegada (el servidor ya ordena del más reciente al más antiguo). */
export function groupByDate<T extends { date: string }>(items: readonly T[]): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.date) last.items.push(item);
    else groups.push({ date: item.date, items: [item] });
  }
  return groups;
}

export function dayNet(items: readonly Pick<Movement, "type" | "amount" | "status" | "voided">[]): string {
  return addAmounts("0", ...items.map(netContribution));
}

/** «en 6 días», «hoy», «hace 2 días» con las plantillas del idioma. */
export function relativeDays(days: number, t: { today: string; tomorrow: string; inDays: string; ago1: string; agoDays: string }): string {
  if (days === 0) return t.today;
  if (days === 1) return t.tomorrow;
  if (days > 1) return fill(t.inDays, { n: String(days) });
  return days === -1 ? t.ago1 : fill(t.agoDays, { n: String(-days) });
}

export interface EffectInput {
  type: "income" | "expense" | "transfer";
  pending: boolean;
  account: Pick<Account, "name" | "kind" | "posted_balance"> | null;
  toAccount: Pick<Account, "name" | "kind"> | null;
  /** Monto ya validado (cadena decimal) o `null` si aún no hay. */
  amount: string | null;
}

export interface EffectTexts {
  pending: string;
  expenseAccount: string;
  expenseAccountNoBalance: string;
  expenseCard: string;
  income: string;
  transferToCard: string;
  transferBetween: string;
}

/** La frase de efecto del diseño (§3.2): en palabras, lo que pasa con la plata. Sin débitos ni créditos. */
export function effectPhrase(input: EffectInput, t: EffectTexts, formatMoney: (value: string) => string): string | null {
  if (input.pending) return t.pending;
  const { account, toAccount, amount } = input;
  if (!account) return null;
  if (input.type === "expense") {
    if (account.kind === "credit_card") return fill(t.expenseCard, { account: account.name });
    if (amount) return fill(t.expenseAccount, { account: account.name, balance: formatMoney(addAmounts(account.posted_balance, negateAmount(amount))) });
    return fill(t.expenseAccountNoBalance, { account: account.name });
  }
  if (input.type === "income") return fill(t.income, { account: account.name });
  if (!toAccount) return null;
  if (toAccount.kind === "credit_card") return fill(t.transferToCard, { card: toAccount.name, account: account.name });
  return fill(t.transferBetween, { from: account.name, to: toAccount.name });
}

/** ¿`a` queda por debajo de cero tras restarle `amount`? (aviso no bloqueante de saldo insuficiente). */
export function wouldOverdraw(account: Pick<Account, "kind" | "posted_balance">, amount: string): boolean {
  if (account.kind === "credit_card") return false;
  return compareAmounts(addAmounts(account.posted_balance, negateAmount(amount)), "0") < 0;
}

/** Los N valores más frecuentes de una lista (empate: el primero en aparecer, que es el más reciente). */
export function topByFrequency<T>(items: readonly T[], key: (item: T) => string | null, limit: number): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([k, n], index) => ({ k, n, index }))
    .sort((a, b) => b.n - a.n || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.k);
}

/** El día de hoy en un periodo `AAAA-MM` o `actual`: el periodo de una ruta (`/extractos/[periodo]`). */
export function isPeriodParam(value: string | undefined): value is string {
  return value !== undefined && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

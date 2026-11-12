import type { components } from "@core/api/schema.gen";
import { todayBogota } from "@core/dates";
import { es } from "@/i18n/es";
import type { QuickType } from "./store";

type S = components["schemas"];
export type Account = S["Account"];
export type Category = S["Category"];
export type Movement = S["Movement"];
export type Warning = S["Warning"];

const SPENDABLE = new Set(["savings", "checking", "cash", "wallet", "pocket", "fund", "credit_card"]);

/** Las cuentas donde se puede registrar un gasto o un ingreso: bancos, efectivo, billeteras y tarjetas, sin las cerradas. */
export function movementAccounts(accounts: readonly Account[]): Account[] {
  return accounts.filter((account) => account.status !== "closed" && SPENDABLE.has(account.kind));
}

/** Los valores que más se repiten (empate: el más reciente, porque la lista llega ordenada del más nuevo al más viejo). */
export function topByFrequency<T>(items: readonly T[], pick: (item: T) => string | null, limit: number): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = pick(item);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

/** La cuenta por defecto: la del último movimiento si sirve; si no, la primera. */
export function defaultAccount(usable: readonly Account[], recent: readonly Movement[]): string | null {
  const last = recent.find((m) => !m.voided && m.type !== "transfer")?.account.id;
  return usable.find((account) => account.id === last)?.id ?? usable[0]?.id ?? null;
}

export function effectPhrase(type: QuickType, account: Pick<Account, "name" | "kind"> | null): string | null {
  if (!account) return null;
  if (type === "income") return es.quick.effectIncome(account.name);
  return account.kind === "credit_card" ? es.quick.effectCard(account.name) : es.quick.effectExpense(account.name);
}

export interface FormValues {
  type: QuickType;
  amount: string;
  accountId: string;
  categoryId: string | null;
  description: string;
}

/** El cuerpo de `POST movements`: el monto va aquí, nunca en la URL. La fecha es la de hoy en Bogotá. */
export function movementBody(values: FormValues, today: string = todayBogota()): Record<string, unknown> {
  const description = values.description.trim();
  return {
    type: values.type,
    amount: values.amount,
    date: today,
    status: "confirmed",
    account_id: values.accountId,
    ...(values.categoryId ? { category_id: values.categoryId } : {}),
    ...(description ? { description } : {}),
  };
}

export function warningText(warning: Warning): string {
  return es.quick.warnings[warning.code] ?? es.quick.warnings.generic;
}

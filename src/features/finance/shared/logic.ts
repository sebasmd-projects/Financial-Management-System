/**
 * Lógica pura de las compras compartidas (FMS-3a, corte 3.4; diseño §3.14). El servidor reparte y asienta; aquí se calcula la VISTA
 * PREVIA con las mismas reglas (`domain/finance/sharing.py`): lo de los demás hacia abajo al centavo, lo que sobra es de quien pagó
 * y `mía + Σ partes == total` exacto. Todo sobre centavos con `BigInt`: nunca `Number` con dinero.
 */
import type { SharedMode } from "@/api/models";
import { normalizeAmountInput, parsePositiveAmount } from "@/lib/amount-input";

export const MAX_PEOPLE = 20;
export const SHARED_MODES: readonly SharedMode[] = ["equal", "percent", "amount"];

export interface PersonDraft {
  counterpartyId: string;
  /** `percent`: el porcentaje de la persona; `amount`: su monto; `equal`: se ignora. */
  value: string;
}

export type SplitProblem = "total" | "people" | "duplicate" | "value" | "percentages" | "exceeds" | "tooSmall";

export interface SplitPreview {
  mine: string;
  shares: string[];
}

const cents = (amount: string): bigint => {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
};
const text = (value: bigint): string => `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;

/** Un porcentaje escrito (`25`, `33,5`) → entero escalado a 4 decimales (`250000n`), o `null`. 0 y más de 100 no valen. */
function percentScaled(raw: string): bigint | null {
  const match = /^(\d{1,3})(?:[.,](\d{1,4}))?$/.exec(raw.trim());
  if (!match) return null;
  const scaled = BigInt(match[1]) * 10_000n + BigInt((match[2] ?? "").padEnd(4, "0"));
  return scaled > 0n && scaled <= 1_000_000n ? scaled : null;
}

/**
 * El reparto que verá la persona antes de guardar, o el primer problema. `equal`: partes iguales entre quien pagó y las personas;
 * `percent`: cada persona su porcentaje (suman como mucho 100); `amount`: cada persona su monto (suman como mucho el total).
 */
export function previewSplit(totalText: string, mode: SharedMode, people: readonly PersonDraft[]): { ok: true; split: SplitPreview } | { ok: false; problem: SplitProblem } {
  const totalValue = parsePositiveAmount(totalText);
  if (totalValue === null) return { ok: false, problem: "total" };
  if (people.length < 1 || people.length > MAX_PEOPLE) return { ok: false, problem: "people" };
  if (new Set(people.map((p) => p.counterpartyId)).size !== people.length || people.some((p) => p.counterpartyId === "")) return { ok: false, problem: "duplicate" };
  const total = cents(totalValue);
  let shares: bigint[];
  if (mode === "equal") {
    const each = total / BigInt(people.length + 1);
    shares = people.map(() => each);
  } else if (mode === "percent") {
    const pcts: bigint[] = [];
    for (const person of people) {
      const scaled = percentScaled(person.value);
      if (scaled === null) return { ok: false, problem: "value" };
      pcts.push(scaled);
    }
    if (pcts.reduce((sum, p) => sum + p, 0n) > 1_000_000n) return { ok: false, problem: "percentages" };
    shares = pcts.map((p) => (total * p) / 1_000_000n);
  } else {
    shares = [];
    for (const person of people) {
      const amount = normalizeAmountInput(person.value);
      if (amount === null) return { ok: false, problem: "value" };
      shares.push(cents(amount));
    }
    if (shares.reduce((sum, s) => sum + s, 0n) > total) return { ok: false, problem: "exceeds" };
  }
  if (shares.some((s) => s <= 0n)) return { ok: false, problem: "tooSmall" };
  const others = shares.reduce((sum, s) => sum + s, 0n);
  return { ok: true, split: { mine: text(total - others), shares: shares.map(text) } };
}

/**
 * El cuerpo de `POST shared/purchases`. `equal` no manda valores; `percent` manda el porcentaje en puntos (`"25"`) y `amount` el
 * monto con hasta 2 decimales. Sin cuenta o con un reparto inválido no hay cuerpo.
 */
export function purchaseBody(input: { accountId: string; categoryId: string; total: string; date: string; mode: SharedMode; people: readonly PersonDraft[]; description: string }): { ok: true; body: object } | { ok: false; problem: SplitProblem | "account" | "date" } {
  const split = previewSplit(input.total, input.mode, input.people);
  if (!split.ok) return split;
  if (input.accountId === "") return { ok: false, problem: "account" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, problem: "date" };
  const people = input.people.map((p) => {
    if (input.mode === "equal") return { counterparty_id: p.counterpartyId };
    if (input.mode === "percent") return { counterparty_id: p.counterpartyId, value: percentValue(p.value) };
    return { counterparty_id: p.counterpartyId, value: normalizeAmountInput(p.value)! };
  });
  return {
    ok: true,
    body: {
      account_id: input.accountId,
      amount: parsePositiveAmount(input.total)!,
      date: input.date,
      mode: input.mode,
      people,
      ...(input.categoryId ? { category_id: input.categoryId } : {}),
      ...(input.description.trim() ? { description: input.description.trim() } : {}),
    },
  };
}

/** `"33,5"` → `"33.5"`; sin ceros de relleno. */
function percentValue(raw: string): string {
  const match = /^(\d{1,3})(?:[.,](\d{1,4}))?$/.exec(raw.trim())!;
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  return fraction ? `${match[1].replace(/^0+(?=\d)/, "")}.${fraction}` : match[1].replace(/^0+(?=\d)/, "") || "0";
}

/** El monto de un saldo de persona, ya en positivo: «Laura te debe» o «le debes a Andrés» (los dos pueden existir a la vez). */
export function balanceSides(person: { owed_to_me: string; i_owe: string }): { owed: boolean; owe: boolean } {
  return { owed: !/^0*(\.0*)?$/.test(person.owed_to_me), owe: !/^0*(\.0*)?$/.test(person.i_owe) };
}

/** Un abono parcial: vacío = saldar todo; con monto, positivo con hasta 2 decimales. `undefined` = el texto no vale. */
export function settleAmount(raw: string): string | null | undefined {
  if (raw.trim() === "") return null;
  return parsePositiveAmount(raw) ?? undefined;
}

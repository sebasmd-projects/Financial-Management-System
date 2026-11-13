/**
 * «Extractos» (línea de tiempo de tarjetas): la lógica pura que comparten la web y la app. Sin React, sin red y sin `Number` para
 * dinero: los montos son cadenas decimales y se comparan con `core/money`. El servidor ya calcula todo (cerrados y proyectados);
 * aquí solo se ELIGE qué mostrar: el mes, la tarjeta, la altura de cada barra y qué se manda a «Abonar».
 */
import type { components } from "./api/schema.gen";
import { addAmounts, compareAmounts, isZeroAmount, percentOfTotal } from "./money";

type S = components["schemas"];
export type Timeline = S["Timeline"];
export type TimelineMonth = S["TimelineMonth"];
export type TimelineCard = S["TimelineCard"];
export type TimelineLine = S["TimelineLine"];

/** Qué mide la altura de las barras (y qué se abona en un mes futuro). */
export type AmountMode = "minimum" | "total";

const PERIOD = /^\d{4}-(?:0[1-9]|1[0-2])$/;

/** `?mes=2026-12` → `"2026-12"`; cualquier otra cosa → `null` (la URL solo lleva el mes, nunca un monto). */
export function parseMonthParam(raw: string | null | undefined): string | null {
  return raw && PERIOD.test(raw) ? raw : null;
}

const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** `"2026-12"` → `Diciembre 2026` / `December 2026` (para el lector de pantalla y las barras). */
export function monthName(period: string, locale: "es" | "en"): string {
  if (!PERIOD.test(period)) throw new RangeError("Periodo inválido: se espera AAAA-MM");
  const index = +period.slice(5) - 1;
  return `${(locale === "en" ? MONTHS_EN : MONTHS_ES)[index]} ${period.slice(0, 4)}`;
}

/** `"2026-12"` → `Diciembre de 2026` (es) / `December 2026` (en): el texto de la ficha del selector. */
export function monthTitle(period: string, locale: "es" | "en"): string {
  const name = monthName(period, locale);
  return locale === "en" ? name : name.replace(" ", " de ");
}

/** Tres letras del mes para el pie de la barra: `DIC` / `DEC`. */
export function monthShort(period: string, locale: "es" | "en"): string {
  return monthName(period, locale).slice(0, 3).toUpperCase();
}

/** ¿El corte ya pasó? (`hoy` incluido: el extracto de hoy ya está cerrado). Fechas de negocio `AAAA-MM-DD`: se comparan como texto. */
export function isClosedCutoff(cutoff: string, today: string): boolean {
  return cutoff <= today;
}

export interface MonthView {
  month: string;
  cutoff: string | null;
  due_date: string | null;
  /** Todos los cortes del mes ya pasaron: son extractos reales. */
  closed: boolean;
  /** Proyectado o con algún interés sin cargar: se muestra «estimado». */
  estimated: boolean;
  rate_assumed: boolean;
  rate_outdated: boolean;
  total_due: string;
  minimum_due: string;
  paid_so_far: string;
  lines: readonly TimelineLine[];
  cards: readonly TimelineCard[];
}

/** El mes visto para todas las tarjetas (`cardId = null`) o para una. `null` si esa tarjeta no tiene extracto ese mes. */
export function monthView(month: TimelineMonth, cardId: string | null, today: string): MonthView | null {
  if (cardId === null) {
    return {
      month: month.month,
      cutoff: month.cutoff,
      due_date: month.due_date,
      closed: month.cards.length > 0 && month.cards.every((card) => isClosedCutoff(card.cutoff, today)),
      estimated: month.estimated,
      rate_assumed: month.rate_assumed || month.cards.some((card) => card.rate_assumed),
      rate_outdated: month.rate_outdated || month.cards.some((card) => card.rate_outdated),
      total_due: month.total_due,
      minimum_due: month.minimum_due,
      paid_so_far: month.paid_so_far,
      lines: month.lines,
      cards: month.cards,
    };
  }
  const card = month.cards.find((entry) => entry.card_id === cardId);
  if (!card) return null;
  return {
    month: month.month,
    cutoff: card.cutoff,
    due_date: card.due_date,
    closed: isClosedCutoff(card.cutoff, today),
    estimated: card.estimated,
    rate_assumed: card.rate_assumed,
    rate_outdated: card.rate_outdated,
    total_due: card.total_due,
    minimum_due: card.minimum_due,
    paid_so_far: card.paid_so_far,
    lines: month.lines.filter((line) => line.card_id === cardId),
    cards: [card],
  };
}

/** Los meses del tablero, en orden, para la tarjeta elegida (sin los meses en que no tiene extracto). */
export function monthViews(timeline: Timeline, cardId: string | null, today: string): MonthView[] {
  const views: MonthView[] = [];
  for (const month of timeline.months) {
    const view = monthView(month, cardId, today);
    if (view) views.push(view);
  }
  return views.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}

/** Las tarjetas que aparecen en la línea de tiempo (para la pestaña «Por tarjeta»), en orden de aparición. */
export function timelineCards(timeline: Timeline): { card_id: string; card_label: string }[] {
  const seen = new Map<string, string>();
  for (const month of timeline.months) for (const card of month.cards) if (!seen.has(card.card_id)) seen.set(card.card_id, card.card_label);
  return [...seen].map(([card_id, card_label]) => ({ card_id, card_label }));
}

/**
 * El mes que se abre al entrar: el primero cuyo pago aún no vence (el que toca pagar o el que viene); si todos vencieron, el último.
 * Un mes cuyo vencimiento depende de la tarjeta (`due_date` nulo) usa su corte.
 */
export function defaultMonth(views: readonly MonthView[], today: string): string | null {
  if (views.length === 0) return null;
  const next = views.find((view) => (view.due_date ?? view.cutoff ?? `${view.month}-31`) >= today);
  return (next ?? views[views.length - 1]).month;
}

export interface Bar {
  month: string;
  /** Lo que mide la barra (mínimo o total del mes). */
  value: string;
  /** Alto relativo (2 a 100): nunca invisible, aunque el mes sea 0. */
  percent: number;
  estimated: boolean;
  closed: boolean;
}

/** Una barra por mes. La más alta mide 100; el resto, proporcional (sobre centavos, con BigInt). */
export function bars(views: readonly MonthView[], mode: AmountMode): Bar[] {
  const value = (view: MonthView) => (mode === "minimum" ? view.minimum_due : view.total_due);
  let max = "0";
  for (const view of views) if (compareAmounts(value(view), max) > 0) max = value(view);
  return views.map((view) => ({
    month: view.month,
    value: value(view),
    percent: Math.max(2, percentOfTotal(value(view), max)),
    estimated: view.estimated,
    closed: view.closed,
  }));
}

/** Para cada tarjeta, su último extracto cerrado (el que cubren `kind: minimum` y `kind: total` de `POST cards/{id}/payments`). */
export function lastClosedByCard(timeline: Timeline, today: string): Map<string, string> {
  const last = new Map<string, string>();
  for (const month of timeline.months) {
    for (const card of month.cards) {
      if (!isClosedCutoff(card.cutoff, today)) continue;
      const current = last.get(card.card_id);
      if (current === undefined || month.month > current) last.set(card.card_id, month.month);
    }
  }
  return last;
}

export type PayPlan =
  /** El último extracto cerrado: el servidor sabe cuánto falta (`minimum` / `total`). */
  | { kind: "minimum" | "total"; amount: null }
  /** Un mes futuro (proyectado): `kind: amount` con lo que muestra la pantalla. */
  | { kind: "amount"; amount: string };

/**
 * Qué se manda a «Abonar» para el extracto de una tarjeta. `null` si no hay nada que abonar: un cerrado que no es el último (ya
 * venció y el pago se hace sobre el último), o un monto en cero.
 */
export function payPlan(card: TimelineCard, month: string, lastClosed: ReadonlyMap<string, string>, today: string, mode: AmountMode): PayPlan | null {
  const amount = mode === "minimum" ? card.minimum_due : card.total_due;
  if (isZeroAmount(amount)) return null;
  if (isClosedCutoff(card.cutoff, today)) return lastClosed.get(card.card_id) === month ? { kind: mode, amount: null } : null;
  return { kind: "amount", amount };
}

export interface PayTarget {
  card_id: string;
  card_label: string;
  plan: PayPlan;
}

/** Las tarjetas de un mes que se pueden abonar (todas, o la elegida). */
export function payTargets(view: MonthView, lastClosed: ReadonlyMap<string, string>, today: string, mode: AmountMode): PayTarget[] {
  const targets: PayTarget[] = [];
  for (const card of view.cards) {
    const plan = payPlan(card, view.month, lastClosed, today, mode);
    if (plan) targets.push({ card_id: card.card_id, card_label: card.card_label, plan });
  }
  return targets;
}

/** Las líneas de un mes por fecha (la cuota se factura en el corte; la compra conserva su `purchase_date` aparte). */
export function sortedLines(lines: readonly TimelineLine[]): TimelineLine[] {
  return [...lines].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Una línea baja la deuda (pagos y devoluciones): se muestra con signo menos. */
export function reducesDebt(line: TimelineLine): boolean {
  return line.kind === "payment";
}

/** La suma de los pagos hechos hasta hoy sobre los extractos de una vista, por si el mes no trae `paid_so_far`. */
export function paidTotal(view: MonthView): string {
  return addAmounts("0", ...view.cards.map((card) => card.paid_so_far));
}

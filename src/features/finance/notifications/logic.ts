/** Lógica pura de avisos (sin React). */
import type { Notification } from "@/api/models";
import type { Target } from "../summary/logic";

export const GROUP_ORDER = ["today", "this_week", "earlier"] as const;

export function groupNotifications(items: readonly Notification[]): { group: (typeof GROUP_ORDER)[number]; items: Notification[] }[] {
  return GROUP_ORDER.map((group) => ({ group, items: items.filter((n) => n.group === group) })).filter((g) => g.items.length > 0);
}

/** «Marcar pagado» es el pago de la ocurrencia a la que apunta el aviso; una tarjeta lleva a pagar la tarjeta. Sin objeto, nada. */
export function paymentTarget(n: Pick<Notification, "object_kind" | "object_id">): Target | null {
  if (!n.object_id) return null;
  if (n.object_kind === "occurrence") return { route: "pagos-fijo-pagar", params: [n.object_id] };
  if (n.object_kind === "card") return { route: "tarjeta-pagar", params: [n.object_id] };
  return null;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isTime(text: string): boolean {
  return TIME.test(text);
}

/** `"21:00:00"` → `"21:00"` (lo que un campo de hora entiende y la API acepta). */
export function timeInput(value: string): string {
  return /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : value;
}

/** Días de anticipación escritos por la persona (`"5, 1"`) → lista; `null` si algo no es un entero de 0 a 60 o son más de 6. */
export function parseOffsets(text: string): number[] | null {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  if (parts.length > 6) return null;
  const out: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,2}$/.test(part)) return null;
    const value = +part;
    if (value > 60) return null;
    if (!out.includes(value)) out.push(value);
  }
  return out.sort((a, b) => b - a);
}

export function offsetsText(offsets: readonly number[]): string {
  return offsets.join(", ");
}

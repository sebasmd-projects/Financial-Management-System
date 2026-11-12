import type { components } from "@core/api/schema.gen";

type S = components["schemas"];
export type Notification = S["Notification"];
export type NotificationList = S["NotificationList"];

export const GROUP_ORDER = ["today", "this_week", "earlier"] as const;

export function groupNotifications(items: readonly Notification[]): { group: (typeof GROUP_ORDER)[number]; items: Notification[] }[] {
  return GROUP_ORDER.map((group) => ({ group, items: items.filter((n) => n.group === group) })).filter((g) => g.items.length > 0);
}

/**
 * Qué se puede hacer con el pago al que apunta un aviso: una ocurrencia (gasto fijo) se marca pagada aquí (lo que falta); tarjetas y
 * cuotas de préstamo se pagan en la web por ahora; sin objeto, nada.
 */
export function payAction(n: Pick<Notification, "object_kind" | "object_id">): "mark_paid" | "web" | null {
  if (!n.object_id) return null;
  if (n.object_kind === "occurrence") return "mark_paid";
  if (n.object_kind === "card" || n.object_kind === "loan_installment") return "web";
  return null;
}

/** El contador de la campana: «9+» lo pone el cliente. */
export function bellCount(unread: number): string {
  return unread > 9 ? "9+" : String(unread);
}

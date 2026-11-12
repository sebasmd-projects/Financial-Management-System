/**
 * Un aviso push lleva SOLO ids (`type`, `notification_id`, `object_kind`, `object_id`; el texto y los montos nunca viajan salvo
 * que la persona lo haya pedido en el servidor). La app no navega a la `path` del aviso: lee los ids, valida su forma y elige una
 * ruta literal propia. Los ids se quedan en memoria (`pending.ts`), no en la ruta.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_KIND = /^[a-z_]{1,20}$/;

export interface OpenTarget {
  notificationId: string;
  objectKind: string | null;
  objectId: string | null;
}

export function parsePushData(data: unknown): OpenTarget | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record.type !== "notification") return null;
  const notificationId = record.notification_id;
  if (typeof notificationId !== "string" || !UUID.test(notificationId)) return null;
  const kind = record.object_kind;
  const objectId = record.object_id;
  const hasObject = typeof kind === "string" && OBJECT_KIND.test(kind) && typeof objectId === "string" && UUID.test(objectId);
  return { notificationId: notificationId.toLowerCase(), objectKind: hasObject ? kind : null, objectId: hasObject ? objectId.toLowerCase() : null };
}

/** A dónde lleva cualquier aviso: al centro de avisos (ruta literal, sin parámetros). */
export const NOTIFICATION_ROUTE = "/notifications" as const;

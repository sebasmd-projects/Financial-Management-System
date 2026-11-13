/**
 * Rutas de la API y su cadena de consulta. Regla del propietario: NADA de montos en URLs, registros ni analítica. `query()` rechaza
 * las claves que llevan montos; los filtros con montos van en el cuerpo de `POST movements/search`.
 */
const FORBIDDEN_QUERY_KEYS = /amount|balance|total|price|value/i;

export type QueryValue = string | number | boolean | null | undefined;

export function query(fields: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN_QUERY_KEYS.test(key)) throw new Error(`Montos fuera de la URL: «${key}»`);
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const paths = {
  dashboard: (period?: string) => `/dashboard${query({ period })}`,
  summaryBoth: (householdId: string, period?: string) => `/summary${query({ scope: "both", household_id: householdId, period })}`,
  households: "/households",
  accounts: `/accounts${query({ page_size: 100 })}`,
  categories: `/categories${query({ page_size: 200, archived: false })}`,
  cardsTimeline: `/cards/statements/timeline${query({ months_back: 6 })}`,
  movements: "/movements",
  movementsSearch: "/movements/search",
  recentMovements: `/movements${query({ page_size: 30 })}`,
  notifications: (unread: boolean) => `/notifications${query({ unread: unread ? true : undefined })}`,
  notificationsRead: "/notifications/read",
  notificationSnooze: (id: string) => `/notifications/${encodeURIComponent(id)}/snooze`,
  occurrencePay: (id: string) => `/occurrences/${encodeURIComponent(id)}/pay`,
  notificationPrefs: "/notification-prefs",
  pushFcm: "/push/endpoints/fcm",
  pushEndpoints: "/push/endpoints",
  pushEndpoint: (id: string) => `/push/endpoints/${encodeURIComponent(id)}`,
} as const;

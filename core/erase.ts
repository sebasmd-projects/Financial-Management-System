/**
 * «Borrar todos mis datos de Finanzas» (propietario, 2026-11-15), sin nada de plataforma: lo comparten la web y la app.
 *
 * Distinto de eliminar un elemento (papelera, 30 días) y de borrar la cuenta del sitio: aquí se destruyen **todas** las filas financieras y la
 * llave de datos, **de inmediato y sin vuelta atrás**; la cuenta del sitio (chat, textos legales) se queda y la próxima visita pide activar
 * Finanzas de nuevo, con una llave nueva. El servidor exige reautenticación reciente y la frase escrita (`confirm`); aquí está la lógica pura del
 * diálogo y el cliente de las dos rutas. Solo recuentos: nunca un monto, ni en la URL ni en el estado.
 */
import type { ApiResult, RequestOptions } from "./api/client";
import type { components } from "./api/schema.gen";

type S = components["schemas"];

export type ErasePreview = S["FmsErasePreview"];
export type EraseHousehold = S["FmsEraseHousehold"];
export type EraseResult = S["FmsEraseResponse"];

/** Las frases que el servidor acepta (la de la vista previa manda; esto es el respaldo mientras carga). */
export const ERASE_PHRASES = { es: "BORRAR MIS FINANZAS", en: "DELETE MY FINANCES" } as const;

export const erasePaths = {
  preview: "/me/erase/preview",
  erase: "/me/erase",
} as const;

/** La exportación de la cuenta del sitio (incluye lo financiero descifrado). Pide reautenticación reciente (401 de allauth). */
export const ACCOUNT_EXPORT_PATH = "/_allauth/cv/v1/me/export";

/** Lo mínimo que se pide al cliente de la API: el de la web y el de la app lo cumplen. */
export interface EraseClient {
  get<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>>;
}

/** Quita mayúsculas y espacios de más: lo mismo que hace el servidor. */
export function normalizePhrase(text: string): string {
  return text.trim().replace(/\s+/g, " ").toUpperCase();
}

export function phraseMatches(typed: string, phrase: string): boolean {
  return normalizePhrase(typed) === normalizePhrase(phrase);
}

/** La frase que se le muestra a la persona: la del servidor para su idioma, o el respaldo. */
export function phraseFor(locale: "es" | "en", preview: Pick<ErasePreview, "phrases"> | null | undefined): string {
  return preview?.phrases?.[locale] ?? ERASE_PHRASES[locale];
}

/** Los tipos que se listan, en este orden. */
export const COUNT_ORDER = ["accounts", "movements", "cards", "loans", "debts", "rules", "connections"] as const;
export type CountKey = (typeof COUNT_ORDER)[number];

export interface CountRow {
  key: CountKey;
  count: number;
}

/** Los tipos con algo que borrar (sin ceros), en orden estable. */
export function countRows(preview: Pick<ErasePreview, "counts">): CountRow[] {
  return COUNT_ORDER.map((key) => ({ key, count: preview.counts[key] ?? 0 })).filter((row) => row.count > 0);
}

/** ¿Hay algo que borrar? (cuenta lo vigente, la papelera y los hogares). */
export function hasAnything(preview: Pick<ErasePreview, "counts" | "in_trash" | "households_affected">): boolean {
  return countRows(preview).length > 0 || preview.in_trash > 0 || preview.households_affected > 0;
}

/** Los hogares agrupados por lo que pasa con cada uno. */
export function householdGroups(preview: Pick<ErasePreview, "households">): { leave: EraseHousehold[]; delete: EraseHousehold[]; blocked: EraseHousehold[] } {
  const out = { leave: [] as EraseHousehold[], delete: [] as EraseHousehold[], blocked: [] as EraseHousehold[] };
  for (const household of preview.households) out[household.action].push(household);
  return out;
}

/** Cuentas que quedan en los hogares de los que se sale: son del hogar, no se las lleva (se avisa). */
export function sharedAccountsLeft(preview: Pick<ErasePreview, "households">): number {
  return householdGroups(preview).leave.reduce((total, household) => total + household.accounts, 0);
}

/** El botón de borrar: no hay hogar que lo impida y la frase coincide. */
export function canErase(preview: Pick<ErasePreview, "blocked" | "phrases"> | null | undefined, typed: string, locale: "es" | "en"): boolean {
  return preview != null && !preview.blocked && phraseMatches(typed, phraseFor(locale, preview));
}

/** El cuerpo de `POST me/erase`. */
export function eraseBody(typed: string): { confirm: string } {
  return { confirm: typed.trim() };
}

/** Tras borrar, activar tiene que esperar unos segundos (otro proceso del servidor aún recuerda la llave vieja). */
export function isCoolingDown(code: string): boolean {
  return code === "erase_cooling_down";
}

export function eraseApi(client: EraseClient) {
  return {
    preview: (options?: RequestOptions): Promise<ApiResult<ErasePreview>> => client.get<ErasePreview>(erasePaths.preview, { ...options, unscoped: true }),
    erase: (typed: string, idempotencyKey: string, options?: RequestOptions): Promise<ApiResult<EraseResult>> =>
      client.post<EraseResult>(erasePaths.erase, eraseBody(typed), { ...options, idempotencyKey, unscoped: true }),
  };
}

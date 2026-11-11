/**
 * Idiomas. Hoy solo `es` (es-CO); la estructura queda lista para `en` como en el CV: un diccionario por idioma con el
 * MISMO tipo (si falta una clave, `tsc` falla). La ruta no lleva prefijo de idioma (`/finanzas/movimientos`): el idioma
 * saldrá de la preferencia de la cuenta cuando la API la exponga (FMS-1).
 */
export const locales = ["es", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "es";

/** Etiqueta BCP 47 para `<html lang>`. */
export const htmlLang: Record<Locale, string> = { es: "es-CO", en: "en" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

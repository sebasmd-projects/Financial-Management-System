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

/**
 * El idioma que se sirve a una petición sin idioma en la URL (`/finanzas`, `/finance`) por `Accept-Language`:
 * cualquier variante de español (`es`, `es-CO`...) → `es`; CUALQUIER OTRO idioma o ninguno → `en`.
 * Con varios, manda el de mayor `q` entre `es` y `en` (los que hay); un idioma sin traducción no cuenta.
 */
export function negotiateLocale(header: string | null | undefined): Locale {
  const candidates = (header ?? "")
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(p)?.[1]).find(Boolean);
      const weight = q === undefined ? 1 : +q;
      return { primary: tag.trim().toLowerCase().split("-")[0], weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((c) => (c.primary === "es" || c.primary === "en") && c.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  return candidates[0]?.primary === "es" ? "es" : "en";
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

import { rootPath } from "@/config/paths";
import type { Locale } from "@/i18n/config";
import { locales } from "@/i18n/config";
import { fmsHref, matchRoute } from "./routes";

/**
 * Una ruta relativa escrita en el idioma `from` (`/pagos/fijos`), llevada a la URL completa de `to`
 * (`/en/finance/payments/fixed`). Si no está en ese idioma pero sí en el otro (`/finanzas/transactions`), también
 * se entiende. Lo que no está en la tabla va a la raíz de `to`.
 */
export function alternatePathFromRoot(from: Locale, rest: string, to: Locale): string {
  for (const locale of [from, ...locales.filter((l) => l !== from)]) {
    const match = matchRoute(locale, rest);
    if (match) return fmsHref(to, match.route.id, match.params);
  }
  return rootPath(to);
}

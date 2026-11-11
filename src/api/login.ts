import { cvPath, rootPath } from "@/config/paths";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";

/**
 * Una ruta interna del mismo origen: empieza por una sola `/`, sin `//`, `\` ni caracteres de control (defensa contra
 * una redirección abierta si el backend, o quien lo suplante, mandara una URL absoluta o `//otro.sitio`).
 */
export function safeInternalPath(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}

/** El idioma de una URL de la app (`/en/finance/...` → `en`); el de respaldo si no lleva uno conocido. */
export function localeFromPath(pathname: string): Locale {
  const first = pathname.split("/").filter(Boolean)[0];
  return isLocale(first) ? first : defaultLocale;
}

/**
 * A dónde se vuelve tras iniciar sesión: la página actual de la app, solo la ruta (sin consulta ni fragmento) y solo si
 * es de la app en ese idioma; si no, la raíz de la app. Nunca una URL de otro sitio.
 */
export function safeNext(locale: Locale, pathname: string): string {
  const root = rootPath(locale);
  const path = safeInternalPath(pathname.split(/[?#]/)[0], root);
  // Ni `.` ni `..` (también codificados): `/es/finanzas/../../x` sale de la app al normalizarse.
  if (/(^|\/)(\.|%2e){1,2}(\/|$)/i.test(path)) return root;
  return path === root || path.startsWith(`${root}/`) ? path : root;
}

/** `/<idioma>/account/login?next=<ruta actual de la app>` (el inicio de sesión del CV). */
export function loginRedirectUrl(locale: Locale, pathname: string): string {
  return `${cvPath(locale, "account/login")}?next=${encodeURIComponent(safeNext(locale, pathname))}`;
}

/** Lo mismo para «Crear cuenta». */
export function signupUrl(locale: Locale, pathname: string): string {
  return `${cvPath(locale, "account/signup")}?next=${encodeURIComponent(safeNext(locale, pathname))}`;
}

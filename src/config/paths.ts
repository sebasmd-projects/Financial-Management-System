import type { Locale } from "@/i18n/config";

/**
 * Dónde vive la app. NO hay `basePath`: las rutas llevan el idioma y un primer segmento traducido, como las del CV
 * (`/es/finanzas/...`, `/en/finance/...`), y nginx las enruta a este contenedor.
 */
export const ROOT_SLUG: Record<Locale, string> = { es: "finanzas", en: "finance" };

/** La raíz de la app en un idioma: `/es/finanzas`. Es también la página de aterrizaje pública. */
export function rootPath(locale: Locale): string {
  return `/${locale}/${ROOT_SLUG[locale]}`;
}

/**
 * Los recursos de Next (`_next/static`) se sirven bajo `/_fms/` para no chocar con los del CV, que están en el mismo
 * origen. Lo enruta nginx a este contenedor, y la app también contesta (`next.config.ts`, reescritura).
 */
export const ASSET_PREFIX = "/_fms";
export const HEALTH_PATH = `${ASSET_PREFIX}/healthz`;

/** La API privada del FMS, en el mismo origen (la enruta nginx a Django). */
export const FMS_API = "/api/fms/v1";
/** El token CSRF de Django para el navegador (cookie HttpOnly en producción), el mismo del CV. */
export const CSRF_URL = "/_allauth/cv/v1/csrf";

/** Las páginas de cuenta del CV (otra aplicación, mismo origen): inicio de sesión, registro, términos, privacidad. */
export function cvPath(locale: Locale, page: "account/login" | "account/signup" | "terms" | "privacy"): string {
  return `/${locale}/${page}`;
}

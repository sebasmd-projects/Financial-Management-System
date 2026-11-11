/** El prefijo donde nginx publica la app (mismo origen que el CV). Se fija al construir en `next.config.ts`. */
export const BASE_PATH = "/finanzas";

/** La API privada del FMS, en el mismo origen (la enruta nginx a Django). */
export const FMS_API = "/api/fms/v1";
/** El token CSRF de Django para el navegador (cookie HttpOnly en producción), el mismo del CV. */
export const CSRF_URL = "/_allauth/cv/v1/csrf";

/** Antepone el prefijo a una ruta propia para los lugares que NO pasan por `next/link` (`<a>` a recursos, `location`). */
export function withBase(path: string): string {
  return `${BASE_PATH}${path === "/" ? "" : path}`;
}

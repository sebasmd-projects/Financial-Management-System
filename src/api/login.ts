import { BASE_PATH } from "@/config/paths";

/** El inicio de sesión del CV si el backend no manda `login_url` (un 401 sin cuerpo). */
export const DEFAULT_LOGIN_URL = "/es/account/login";
/** Adónde vuelve la persona tras iniciar sesión: la app, nunca una ruta con datos. */
export const LOGIN_NEXT = BASE_PATH;

/**
 * Una ruta interna del mismo origen: empieza por una sola `/`, sin `//`, `\` ni caracteres de control (defensa contra
 * una redirección abierta si el backend, o quien lo suplante, mandara una URL absoluta o `//otro.sitio`).
 */
export function safeInternalPath(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}

/** `/es/account/login?next=/finanzas` (conserva una consulta que ya tuviera). */
export function loginRedirectUrl(loginUrl: unknown, next: string = LOGIN_NEXT): string {
  const base = safeInternalPath(loginUrl, DEFAULT_LOGIN_URL);
  const url = new URL(base, "https://placeholder.invalid");
  url.searchParams.set("next", next);
  return `${url.pathname}${url.search}${url.hash}`;
}

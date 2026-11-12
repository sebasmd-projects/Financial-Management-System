/**
 * Enlaces profundos (`finanzas://…`): lista blanca de rutas SIN datos. Lo que llega de fuera se reduce a una ruta literal conocida;
 * la consulta (`?monto=…`), el fragmento y cualquier parámetro se descartan, así un enlace no puede precargar un monto ni un id.
 * Una ruta desconocida, otro esquema o algo que no se entiende van a la raíz (`/`), que decide según el estado de la sesión.
 */
export const DEEP_LINK_ROUTES = ["/", "/home", "/movements", "/notifications", "/quick-add"] as const;
export type DeepLinkRoute = (typeof DEEP_LINK_ROUTES)[number];

const ALLOWED: ReadonlySet<string> = new Set(DEEP_LINK_ROUTES);
const SCHEME = "finanzas";

export function sanitizeDeepLink(input: string): DeepLinkRoute {
  if (typeof input !== "string" || input.length > 2048) return "/";
  let rest = input.trim();
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(rest);
  if (scheme) {
    if (scheme[1].toLowerCase() !== SCHEME) return "/";
    rest = rest.slice(scheme[0].length);
    // En `finanzas://home` lo que sigue al esquema ya es la ruta (sin host).
    rest = `/${rest}`;
  }
  const end = rest.search(/[?#]/);
  const path = (end === -1 ? rest : rest.slice(0, end)).replace(/\/{2,}/g, "/");
  const normalized = path.length > 1 ? path.replace(/\/$/, "") : path;
  return ALLOWED.has(normalized) ? (normalized as DeepLinkRoute) : "/";
}

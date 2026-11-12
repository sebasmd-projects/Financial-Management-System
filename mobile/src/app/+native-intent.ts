import { sanitizeDeepLink } from "@/nav/deeplink";

/**
 * Expo Router llama aquí con cada enlace que abre la app (`finanzas://…`) antes de navegar. Solo pasan las rutas de la lista blanca
 * y sin parámetros (`src/nav/deeplink.ts`): ni un monto ni un id viajan por un enlace.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return sanitizeDeepLink(path);
}

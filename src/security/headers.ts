/**
 * Cabeceras de seguridad de las páginas del FMS. Aquí para poder probarlas sin levantar Next.
 *
 * CSP con nonce (guía de CSP de Next 16, «Adding a nonce with Proxy»), igual que el CV: Next lee el nonce de la CSP de la
 * *petición* y lo aplica a sus scripts; por eso el árbol de páginas es dinámico (`connection()` en el layout raíz).
 * Sin `unsafe-inline` en scripts y sin terceros: fuentes e imágenes del propio origen.
 */

/** Un nonce nuevo por petición: 16 bytes aleatorios en base64. */
export function createNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
}

export function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    // `unsafe-eval` solo en desarrollo: React lo usa para reconstruir trazas del servidor.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // En desarrollo, el HMR inyecta estilos sin nonce.
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    // Los atributos `style=""` (p. ej. el ancho de una barra de progreso) no los cubre un nonce. Solo atributos: un
    // `<style>` inyectado sigue necesitando nonce.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // La API del FMS y el CSRF son del mismo origen. Ningún tercero.
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return directives.join("; ");
}

/**
 * Las que no dependen de la petición. `next.config.ts` las pone a TODO y `proxy.ts` a cada página.
 *
 * `Referrer-Policy: same-origin`: ni una URL del FMS sale a otro sitio. `Strict-Transport-Security` es del borde (nginx).
 * `Permissions-Policy` mínima: nada de lo que usa la app pide estas funciones.
 */
export const STATIC_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Referrer-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  // Los navegadores modernos usan `frame-ancestors 'none'` de la CSP; esta es para los antiguos.
  "X-Frame-Options": "DENY",
};

/**
 * Toda página del FMS es privada: lo que muestra sale de una sesión. Ni se guarda (ni en el navegador, ni en un
 * intermediario, ni en la caché de ida y vuelta), ni se indexa.
 */
export const PRIVATE_PAGE_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
};

/**
 * La página de aterrizaje pública (`/es/finanzas`, `/en/finance`): se indexa y NO es `no-store`. Su HTML no depende de
 * quién pregunta (no lee cookies ni sesión; lo de cada persona se pinta en el navegador tras preguntar a `/me`).
 * Como la CSP lleva un nonce por petición, ningún intermediario debe guardarla ni compartirla: `private, no-cache`
 * (el navegador puede conservarla y reutilizarla —sirve a la caché de ida y vuelta— pero la revalida).
 */
export const PUBLIC_LANDING_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "private, no-cache",
};

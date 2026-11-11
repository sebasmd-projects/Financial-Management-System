import { NextResponse, type NextRequest } from "next/server";
import { ROOT_SLUG } from "@/config/paths";
import { negotiateLocale, type Locale } from "@/i18n/config";
import { alternatePathFromRoot } from "@/nav/legacy";
import { buildContentSecurityPolicy, createNonce, PRIVATE_PAGE_HEADERS, PUBLIC_LANDING_HEADERS, STATIC_SECURITY_HEADERS } from "@/security/headers";
import { parseFmsPath } from "@/nav/routes";
import { siteOrigin } from "@/seo/site";

// Por petición:
//  1. `/finanzas` y `/finance` (sin idioma): 301 al idioma que dice `Accept-Language` (`es*` → español; cualquier otro o
//     ninguno → inglés), conservando la ruta equivalente. `Vary: Accept-Language`.
//  2. Páginas `/<idioma>/<raíz>/...`: nonce de CSP + cabeceras de seguridad + `no-store` (la app es privada). La página de
//     aterrizaje es pública: se indexa y no lleva `no-store`.
// Los recursos (`/_fms/_next/...`) y la salud (`/_fms/healthz`) no pasan por aquí.

/**
 * La app no tiene Server Actions ni rutas de escritura propias (las escrituras van del navegador a Django): un `POST`
 * a una página no tiene a quién llegar y Next contestaría 500. Es un 405 limpio.
 */
export function rejectedMethod(method: string): NextResponse | null {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;
  return new NextResponse(null, { status: 405, headers: { Allow: "GET, HEAD, OPTIONS", "Cache-Control": "no-store" } });
}

/** `/finanzas/pagos?x=1` → `/es/finanzas/pagos?x=1`; la raíz y lo desconocido → la raíz del idioma. `null` si no es una ruta sin idioma. */
export function legacyRedirectTarget(pathname: string, search: string, acceptLanguage: string | null): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0];
  if (first !== ROOT_SLUG.es && first !== ROOT_SLUG.en) return null;
  const locale: Locale = negotiateLocale(acceptLanguage);
  const target = alternatePathFromRoot(first === ROOT_SLUG.es ? "es" : "en", `/${segments.slice(1).join("/")}`, locale);
  return `${target}${search}`;
}

export function proxy(request: NextRequest) {
  const rejected = rejectedMethod(request.method);
  if (rejected) return rejected;

  const { pathname, search } = request.nextUrl;
  const redirect = legacyRedirectTarget(pathname, search, request.headers.get("accept-language"));
  if (redirect) {
    // Con `SITE_URL` el destino es el origen público (detrás de nginx el host de la petición podría ser el interno del
    // contenedor); sin ella (desarrollo, e2e), el de la petición.
    const origin = process.env.SITE_URL ? siteOrigin() : request.nextUrl.origin;
    const response = NextResponse.redirect(new URL(redirect, origin), 301);
    response.headers.set("Vary", "Accept-Language");
    response.headers.set("Cache-Control", "private, no-cache");
    return response;
  }

  const nonce = createNonce();
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "development");

  // Next lee el nonce de la CSP de la petición al renderizar; `x-nonce` es para el script del tema.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("Content-Security-Policy", csp);
  const isLanding = parseFmsPath(pathname)?.isLanding === true;
  for (const [name, value] of Object.entries({ ...STATIC_SECURITY_HEADERS, ...(isLanding ? PUBLIC_LANDING_HEADERS : PRIVATE_PAGE_HEADERS) })) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  matcher: [
    // Rutas sin idioma (redirección): también sin el prefetch, nadie las prefetchea.
    "/finanzas",
    "/finanzas/:path*",
    "/finance",
    "/finance/:path*",
    {
      // Las páginas de la app. Los prefetch no necesitan CSP (guía de CSP de Next).
      source: "/:locale(es|en)/:root(finanzas|finance)/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

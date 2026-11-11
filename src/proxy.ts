import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy, createNonce, PRIVATE_PAGE_HEADERS, STATIC_SECURITY_HEADERS } from "@/security/headers";

// Por petición: nonce de CSP + cabeceras de seguridad + `no-store`. Next quita `basePath` antes de comparar el
// `matcher` y `nextUrl.pathname`: aquí las rutas son las de dentro de `/finanzas`.

/**
 * La app no tiene Server Actions ni rutas de escritura propias (las escrituras van del navegador a Django): un `POST`
 * a una página no tiene a quién llegar y Next contestaría 500. Es un 405 limpio.
 */
export function rejectedMethod(method: string): NextResponse | null {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;
  return new NextResponse(null, { status: 405, headers: { Allow: "GET, HEAD, OPTIONS", "Cache-Control": "no-store" } });
}

export function proxy(request: NextRequest) {
  const rejected = rejectedMethod(request.method);
  if (rejected) return rejected;

  const nonce = createNonce();
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "development");

  // Next lee el nonce de la CSP de la petición al renderizar; `x-nonce` es para el script del tema.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("Content-Security-Policy", csp);
  for (const [name, value] of Object.entries({ ...STATIC_SECURITY_HEADERS, ...PRIVATE_PAGE_HEADERS })) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  matcher: [
    // La raíz de la app (`/finanzas`): con `basePath` el patrón de abajo no la alcanza.
    "/",
    {
      // Todo menos los estáticos, el favicon y la salud del contenedor (`/healthz` no es una página); los prefetch no
      // necesitan CSP (guía de CSP de Next).
      source: "/((?!healthz|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

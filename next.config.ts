import type { NextConfig } from "next";
import { ASSET_PREFIX } from "./src/config/paths";
import { STATIC_SECURITY_HEADERS } from "./src/security/headers";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Sin `basePath`: las páginas son `/es/finanzas/...` y `/en/finance/...` (el idioma va en la ruta, como en el CV), que nginx
  // enruta a este contenedor. Los recursos de Next salen de `/_fms/_next/...` para no chocar con los del CV (mismo origen):
  // `assetPrefix` lo pone en el HTML y la reescritura de abajo hace que Next los sirva con ese prefijo.
  assetPrefix: ASSET_PREFIX,
  // La imagen de producción sirve `.next/standalone/server.js` (Dockerfile).
  output: "standalone",
  poweredByHeader: false,
  // Las cabeceras que no dependen de la petición, a TODO (también a `_next/static`, que el matcher del proxy deja fuera).
  // La CSP con nonce y `Cache-Control: no-store` de las páginas las pone `src/proxy.ts`.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: Object.entries(STATIC_SECURITY_HEADERS).map(([key, value]) => ({ key, value })),
      },
    ];
  },
  async rewrites() {
    const backend = process.env.FMS_BACKEND_PROXY_URL?.trim().replace(/\/$/, "");
    return {
      beforeFiles: [
        // Los recursos y la salud del contenedor, bajo el prefijo de la app. nginx puede enrutar `/_fms/` aquí tal cual.
        { source: `${ASSET_PREFIX}/_next/:path*`, destination: "/_next/:path*" },
        { source: `${ASSET_PREFIX}/healthz`, destination: "/healthz" },
        // El mapa del sitio y las reglas de robots del FMS: fragmentos que el CV incluye en los suyos (README).
        { source: `${ASSET_PREFIX}/sitemap.xml`, destination: "/fms-sitemap" },
        { source: `${ASSET_PREFIX}/robots.txt`, destination: "/fms-robots" },
      ],
      // SOLO desarrollo local: en producción nginx enruta `/api/fms/` y `/_allauth/` a Django y Next no los ve. Con la
      // variable, `next dev` los reenvía al backend del CV para que el navegador siga hablando con un solo origen.
      // Sin la variable no hay reescritura: un nginx mal configurado no queda tapado por Next.
      afterFiles: backend
        ? [
            { source: "/api/fms/:path*", destination: `${backend}/api/fms/:path*` },
            { source: "/_allauth/:path*", destination: `${backend}/_allauth/:path*` },
          ]
        : [],
      fallback: [],
    };
  },
};

export default nextConfig;

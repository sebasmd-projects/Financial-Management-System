import type { NextConfig } from "next";
import { BASE_PATH } from "./src/config/paths";
import { STATIC_SECURITY_HEADERS } from "./src/security/headers";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // La app cuelga de `https://<dominio>/finanzas` detrás de nginx, en el mismo origen que el CV (misma cookie de sesión).
  // nginx NO quita el prefijo: Next lo conoce. Se fija al construir (queda dentro de los paquetes del cliente).
  basePath: BASE_PATH,
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
  // SOLO desarrollo local: en producción nginx enruta `/api/fms/` y `/_allauth/` a Django y Next no los ve. Con la
  // variable, `next dev` los reenvía al backend del CV para que el navegador siga hablando con un solo origen.
  // Sin la variable no hay reescritura: un nginx mal configurado no queda tapado por Next.
  // `basePath: false`: las rutas del API son del origen, no de `/finanzas`.
  async rewrites() {
    const backend = process.env.FMS_BACKEND_PROXY_URL?.trim().replace(/\/$/, "");
    if (!backend) return [];
    return [
      { source: "/api/fms/:path*", destination: `${backend}/api/fms/:path*`, basePath: false as const },
      { source: "/_allauth/:path*", destination: `${backend}/_allauth/:path*`, basePath: false as const },
    ];
  },
};

export default nextConfig;

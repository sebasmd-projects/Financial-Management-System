import { buildSitemap, siteOrigin } from "@/seo/site";

// Se sirve como `/_fms/sitemap.xml` (reescritura de `next.config.ts`). Solo las páginas de aterrizaje: el resto de la app es
// privada y `noindex`. El CV lo incluye en su `sitemap.xml` (README).
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(buildSitemap(siteOrigin()), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

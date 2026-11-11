import { buildRobots, siteOrigin } from "@/seo/site";

// Se sirve como `/_fms/robots.txt`: las reglas del FMS que el CV añade a su `robots.txt` (README).
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(buildRobots(siteOrigin()), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

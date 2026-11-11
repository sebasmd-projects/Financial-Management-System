// Salud del contenedor (HEALTHCHECK del Dockerfile): vivo = Next contesta. No toca la API ni la sesión.
// Se sirve en `/healthz` y, por la reescritura de `next.config.ts`, en `/_fms/healthz` (la que usa el HEALTHCHECK).
export const dynamic = "force-static";

export function GET() {
  return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

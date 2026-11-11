// Salud del contenedor (HEALTHCHECK del Dockerfile): vivo = Next contesta. No toca la API ni la sesión.
// Con `basePath` se sirve en `/finanzas/healthz`.
export const dynamic = "force-static";

export function GET() {
  return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

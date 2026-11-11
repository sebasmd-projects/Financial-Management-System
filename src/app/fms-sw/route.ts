import { SERVICE_WORKER_SOURCE } from "@/features/finance/notifications/sw-source";

// Se sirve como `/_fms/sw.js` (reescritura en `next.config.ts`). Solo muestra avisos Web Push; no guarda nada.
// `Service-Worker-Allowed: /` permite registrarlo con el alcance del idioma de la app (`/es/finanzas/`, `/en/finance/`): el
// script vive bajo `/_fms/`, y sin esta cabecera el navegador solo dejaría un alcance dentro de `/_fms/`. El alcance real lo
// fija quien registra (`push.ts`), no esta cabecera.
export const dynamic = "force-static";

export function GET() {
  return new Response(SERVICE_WORKER_SOURCE, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/",
      "Cache-Control": "no-cache",
    },
  });
}

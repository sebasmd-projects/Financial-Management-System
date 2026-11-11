/**
 * El código del service worker de FMS (se sirve como `/_fms/sw.js`, ver `app/fms-sw/route.ts`).
 *
 * Existe SOLO para mostrar avisos Web Push. Reglas del propietario (nada financiero en el navegador):
 *  - NO tiene manejador de `fetch`: no intercepta ni guarda ninguna respuesta de la API, y no usa Cache Storage, IndexedDB ni
 *    localStorage (esta prueba lo vigila: `sw-source.test.ts`).
 *  - La carga del push (título y texto, sin cifras salvo que la persona lo pidió) se muestra y se descarta: nunca se persiste.
 *  - Se registra con el alcance del idioma de la app (`/es/finanzas/` o `/en/finance/`), no con el de todo el sitio.
 */
export const SERVICE_WORKER_SOURCE = `"use strict";
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = {}; }
  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 80) : "Finanzas";
  const body = typeof data.body === "string" ? data.body.slice(0, 180) : "";
  event.waitUntil(self.registration.showNotification(title, { body }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const scope = self.registration.scope;
  const target = scope + (scope.indexOf("/es/") !== -1 ? "notificaciones" : "notifications");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.indexOf(scope) === 0 && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
`;

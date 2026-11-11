# e2e (humo de FMS-0)

Playwright contra la app construida (`next start` en el puerto 3100). **La API se simula en el navegador** con
`page.route` (datos sintéticos): no hace falta Django ni base de datos. Cubre la compuerta: sin sesión redirige al inicio
de sesión del CV con `?next=<la página actual>` (en `es` y en `en`), y en la raíz deja la página de aterrizaje; sin activar muestra la Activación (bloqueada hasta aceptar y con 2FA); un 403 de
la activación muestra su mensaje; con la cuenta activa aparece la cáscara y el Resumen en la misma URL.
`tests/seo.spec.ts` comprueba, solo por HTTP, los 301 de `/finanzas` y `/finance` por `Accept-Language`, `canonical` y `hreflang`,
las cabeceras (aterrizaje indexable y sin `no-store`; la app `noindex` y `no-store`), que el HTML público es idéntico con y
sin cookie de sesión, el sitemap, el robots, los recursos bajo `/_fms` y la salud.

```bash
npm run build                      # en la raíz
cd e2e && npm ci && npx playwright install chromium && npm test
# Sin descarga (Chromium ya instalado): PW_CHROMIUM=/ruta/a/chrome npm test
```

## Plan (lo que NO está todavía)

| Fase | Qué se añade |
|---|---|
| FMS-1 | Contra Django real (`/api/fms/v1/`): activar con una cuenta con 2FA, aislamiento entre dos usuarios (otro dueño recibe 404), alta de un movimiento con `Idempotency-Key` (reenviar no duplica), el Resumen sin scroll a 390 x 844 y 360 x 740 |
| FMS-1 | axe-core en cada pantalla (AA), teclado (Tab, `N`, `Ctrl+K`, `G` luego `R/M/P`) y foco tras navegar |
| FMS-1 | Comprobar las cabeceras (`Cache-Control: no-store`, CSP con nonce) contra el borde real (nginx) |
| Despliegue | Humo de producción en `https://<dominio>/_fms/healthz` (solo lectura; nada de datos reales) |

# FMS — Sistema de gestión financiera personal

Aplicación web (mobile first) de finanzas personales para Colombia, en `sebasmoralesd.com/es/finanzas` y `/en/finance`. El backend es el
del CV (`sebasmd-projects/cv-all-in-one-resume`, Django + PostgreSQL): mismo usuario, misma sesión, API privada
`/api/fms/v1/`. Este repositorio es el **frontend** (Next 16; React Native en una etapa posterior).

Léelo antes de tocar nada:

1. [`docs/owner-rules.md`](docs/owner-rules.md): decisiones y reglas técnicas del propietario (obligatorias).
2. [`docs/technical-plan.md`](docs/technical-plan.md): arquitectura, cifrado y fases.
3. [`docs/design-spec.md`](docs/design-spec.md): diseño de producto y pantallas, reglas de negocio y criterios de aceptación.

## Desarrollo local contra el backend del CV

El FMS es un Next 16 que sirve `/es/finanzas/...` y `/en/finance/...` (sin `basePath`: el idioma va en la ruta) en el **mismo origen** que el CV: comparte su cookie de sesión
(`__Host-cv_session`) y habla con `/api/fms/v1/` por `fetch` del mismo origen. Antes de tocar Next lee
`node_modules/next/dist/docs/` (esta versión cambia APIs).

```bash
npm ci
cp .env.example .env.local       # FMS_BACKEND_PROXY_URL=http://127.0.0.1:8000
npm run dev                      # http://localhost:3100/es/finanzas  (o /en/finance)
```

1. Levanta Django del CV (`sebasmd-projects/cv-all-in-one-resume`, carpeta `backend`) en `127.0.0.1:8000` con
   `config.settings.dev` y una cuenta con correo verificado y 2FA.
2. `FMS_BACKEND_PROXY_URL` hace que `next dev` reenvíe `/api/fms/*` y `/_allauth/*` al backend, para que el navegador siga
   hablando con un solo origen (en producción lo hace nginx; sin la variable no hay reescritura).
3. La sesión es la del CV: inicia sesión en el sitio del CV **en el mismo origen** (`localhost:3100` solo tiene la cookie si
   Django la emite para ese host; con cookies `__Host-` y HTTPS hace falta el nginx local). Sin backend, las pruebas y el
   e2e simulan `/api/fms/v1/me`.

### Comprobaciones

```bash
npm run lint && npx next typegen && npx tsc --noEmit && npm test && npm run build
cd e2e && npm ci && npm test     # humo de la compuerta con la API simulada (e2e/README.md)
```

### Seguridad del frontend (reglas que las pruebas vigilan)

* **Nada financiero en el navegador**: ni `localStorage`/`sessionStorage`/IndexedDB ni consola ni URLs. La única excepción
  es la preferencia de tema (`src/ui/theme/storage.ts`). ESLint y `src/guards.test.ts` lo exigen.
* **Dinero = cadenas decimales** tal como llegan; se opera con `BigInt` en `src/lib/money.ts`. Nunca `Number`/`parseFloat`.
* **CSP con nonce** por petición y cabeceras de seguridad (`src/proxy.ts`, `src/security/headers.ts`); `no-store` en todas las
  páginas; sin scripts ni fuentes de terceros (Sora e Inter autoalojadas).
* **La compuerta** (`src/features/session/store.ts`) pregunta a `/api/fms/v1/me` desde el navegador; el control de acceso real
  es de la API (sesión, MFA y dueño en cada petición).
* Los tipos de la API (`src/api/types.ts`) están escritos a mano; se sustituyen por los generados del `openapi-fms.yaml` en FMS-1.

### Rutas por idioma, SEO y nginx

Una sola tabla (`src/nav/routes.ts`) dice cómo se llama cada pantalla en cada idioma: `/es/finanzas/movimientos/egresos` ⇄
`/en/finance/transactions/expenses`. De ella salen los menús, el cambio de idioma (menú de la persona), `canonical` y
`hreflang` (`es`, `en` y `x-default` → inglés) de cada página.

| Ruta | Qué es |
|---|---|
| `/es/finanzas`, `/en/finance` | Página de aterrizaje **pública e indexable** (sin sesión); con la cuenta activa, el Resumen en la misma URL |
| `/es/finanzas/...`, `/en/finance/...` | La app: privada, `noindex`, `Cache-Control: no-store` |
| `/finanzas`, `/finance` (y subrutas) | 301 por `Accept-Language`: `es*` → `/es/finanzas`; cualquier otro idioma o ninguno → `/en/finance`. La ruta equivalente se conserva |
| `/_fms/_next/...` | Recursos de Next (`assetPrefix`), para no chocar con los del CV |
| `/_fms/healthz` | Salud del contenedor (`ok`) |
| `/_fms/sitemap.xml`, `/_fms/robots.txt` | Fragmentos del FMS (solo la aterrizaje) |
| `/_fms/sw.js` | Service worker de los avisos Web Push (solo muestra avisos; no guarda nada). Se registra con el alcance del idioma (`/es/finanzas/`, `/en/finance/`) |

**Lo que tiene que hacer nginx / el CV** (otro repositorio): enrutar a `fms-web:3100` los prefijos `^~ /es/finanzas`,
`^~ /en/finance`, `= /finanzas`, `^~ /finanzas/`, `= /finance`, `^~ /finance/` y `^~ /_fms/`; pasar `Host` y no cachear;
añadir `/_fms/sitemap.xml` al índice de `sitemap.xml` del CV y copiar las reglas de `/_fms/robots.txt` a su `robots.txt`;
y fijar `SITE_URL` (origen público, sin barra) en el servicio `fms-web`. Que el login y el registro del CV respeten `?next=`
(`/<idioma>/account/login?next=/<idioma>/finanzas/...`) es parte de su integración.

**La página pública no lleva datos de nadie.** `Landing` es un componente de servidor que solo recibe el idioma (no lee
cookies, cabeceras ni sesión): su HTML es el mismo para todo el mundo, y una prueba e2e lo compara con y sin cookie de sesión.
Lo personal se decide en el navegador: tras hidratar pregunta a `/api/fms/v1/me` y, si la cuenta está activa, cambia la
página por el Resumen. Por eso puede indexarse y llevar `Cache-Control: private, no-cache` (no `no-store`). Como la CSP lleva
un nonce por petición, no es estática ni compartible por una caché: `private`.

### Imagen

`Dockerfile` en la raíz (standalone, usuario `node`, puerto 3100, `HEALTHCHECK` a `/_fms/healthz`). La construye el
despliegue del CV. **No se ha construido en este entorno** (sin Docker): lo comprobado es `npm run build` (produce
`.next/standalone/server.js`, probado a mano con `node server.js` en el puerto 3101) y `src/dockerfile.test.ts`.

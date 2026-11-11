# FMS — Sistema de gestión financiera personal

Aplicación web (mobile first) de finanzas personales para Colombia, en `sebasmoralesd.com/finanzas`. El backend es el
del CV (`sebasmd-projects/cv-all-in-one-resume`, Django + PostgreSQL): mismo usuario, misma sesión, API privada
`/api/fms/v1/`. Este repositorio es el **frontend** (Next 16; React Native en una etapa posterior).

Léelo antes de tocar nada:

1. [`docs/owner-rules.md`](docs/owner-rules.md): decisiones y reglas técnicas del propietario (obligatorias).
2. [`docs/technical-plan.md`](docs/technical-plan.md): arquitectura, cifrado y fases.
3. [`docs/design-spec.md`](docs/design-spec.md): diseño de producto y pantallas, reglas de negocio y criterios de aceptación.

## Desarrollo local contra el backend del CV

El FMS es un Next 16 que cuelga de `/finanzas` (`basePath`) en el **mismo origen** que el CV: comparte su cookie de sesión
(`__Host-cv_session`) y habla con `/api/fms/v1/` por `fetch` del mismo origen. Antes de tocar Next lee
`node_modules/next/dist/docs/` (esta versión cambia APIs).

```bash
npm ci
cp .env.example .env.local       # FMS_BACKEND_PROXY_URL=http://127.0.0.1:8000
npm run dev                      # http://localhost:3100/finanzas
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

### Imagen

`Dockerfile` en la raíz (standalone, usuario `node`, puerto 3100, `HEALTHCHECK` a `/finanzas/healthz`). La construye el
despliegue del CV. **No se ha construido en este entorno** (sin Docker): lo comprobado es `npm run build` (produce
`.next/standalone/server.js`, probado a mano con `node server.js` en el puerto 3101) y `src/dockerfile.test.ts`.

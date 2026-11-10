# FMS — plan técnico (Opus, 2026-11-10)

Fuentes: `design-spec.md` (Fable), `owner-rules.md` (decisiones y reglas del propietario). Este plan manda sobre la
arquitectura; el diseño manda sobre pantallas y reglas de negocio.

## 1. Decisiones de arquitectura

| Tema | Decisión |
|---|---|
| Backend | **El mismo Django del CV** (`cv-all-in-one-resume/backend`). Apps nuevas `apps/finance_*`; motor de cálculo en Python puro en `domain/finance/` (sin Django; contrato de `import-linter`, como `domain/`) |
| Usuarios y sesión | La misma base, el mismo allauth y la misma cookie `__Host-cv_session`. El FMS vive en **`sebasmoralesd.com/finanzas`**: misma cookie, sin tocar su seguridad |
| Frontend | Repo **`Financial-Management-System`**: Next 16 (el mismo stack del front del CV), `basePath: "/finanzas"`, mobile first. React Native (Expo) en una segunda etapa, sobre la misma API |
| API | DRF privada en **`/api/fms/v1/`**: sesión + CSRF; OpenAPI → tipos TypeScript en el repo del FMS (CI falla si se desalinean, como en el CV) |
| Borde | nginx: `location ^~ /finanzas` → contenedor `fms-web` (Next, puerto interno); `/api/fms/` → `api`. Rutas en `cv-locations.conf.template` + tabla de `test_nginx.py`; `check_attack_terms` |
| Despliegue | El `compose.yaml` del CV gana el servicio `fms-web`. La imagen se construye desde el repo del FMS (`build-local.sh` / `ship.sh` aprenden un segundo origen). Un solo `deploy.sh`: respaldo, migraciones, salud |
| Acceso | Cualquier cuenta **Activa con correo verificado** (visitante, recruiter, staff) puede activar el FMS. Gratis, sin suscripciones. **MFA obligatorio para activar y usar el FMS** (regla 7) |
| Activación | En el login del CV, casilla «Ir también a Finanzas» (marcada): la primera vez pide aceptar términos y privacidad del FMS, exige MFA y crea `FinanceProfile` + su llave. Luego lleva a `/finanzas` |
| Aislamiento | Todo modelo del FMS lleva `owner`; un único `QuerySet` base filtra por `request.user` y una prueba recorre **todos** los endpoints con dos usuarios. El admin de Django **no** muestra contenido financiero (solo conteos por usuario, sin descifrar) |
| Cifrado | Por usuario en el servidor (decisión del propietario). Ver §2 |
| Notificaciones | Etapa web: **Web Push (VAPID)** + en la aplicación + correo; Expo push en la etapa React Native. El texto del push no lleva montos salvo que el usuario lo active |
| Tareas | Celery (ya existe): generación de recurrencias, reinicio mensual (día 1, America/Bogota), evaluación de reglas, avisos. Todas idempotentes |
| Legal | Borrador de privacidad y términos (flujo F9-13): datos financieros, cifrado, retención, borrado. Lo aprueba el propietario antes de abrir el FMS |

## 2. Cifrado (envelope por usuario)

- **Llave maestra (KEK)**: `FMS_MASTER_KEY` en `/srv/cv/.env` (la genera `make-env.sh`). Va al gestor de contraseñas y a
  los respaldos fuera del VPS, nunca al repo. Distinta de `SECRET_KEY`. Admite rotación (versión de llave en cada fila).
- **Llave de datos (DEK)** por usuario: 256 bits aleatorios, guardada **envuelta** por la KEK en `FinanceProfile`.
- **AES-256-GCM** (`cryptography`), con el id del usuario y el nombre del campo como datos asociados: una fila copiada a
  otro usuario o a otro campo no descifra.
- **Se cifra**: montos, descripciones, contrapartes, notas, nombres y números de cuentas y tarjetas, nombres de
  categorías, etiquetas, metas y presupuestos, y los comprobantes adjuntos.
- **No se cifra** (hace falta para filtrar y programar): ids, `owner`, fechas, estado, tipo, periodicidad, ids de
  categoría y cuenta, versión de llave.
- **Consecuencias honestas**:
  1. Los montos cifrados no se suman en SQL: los saldos y agregados se calculan en Python sobre las filas del usuario
     (volumen personal; se mide en las pruebas de carga).
  2. La regla 1 se cumple como `Decimal` de punta a punta (dominio, API como cadena). La base guarda el `Decimal`
     cifrado, no un `DecimalField`. La cuadratura de asientos la garantiza el dominio dentro de `transaction.atomic`,
     más un verificador periódico, porque la base no puede comprobarla con un `CHECK`.
  3. Para detectar duplicados e idempotencia: HMAC con una llave derivada del usuario, sin texto en claro.
  4. Borrar la cuenta = borrar la DEK (*crypto-shredding*) + borrar filas. Los respaldos viejos quedan ilegibles para
     ese usuario.
  5. Quien tenga root en el VPS **y** la KEK puede descifrar. Se documenta así en la política de privacidad.

## 3. Reglas técnicas → cómo se cumplen

| # | Regla del propietario | Cumplimiento |
|---|---|---|
| 1 | Decimal, nunca float | `Decimal` en dominio, serializers con cadenas, `ruff` prohíbe `float(` en `domain/finance` y `apps/finance_*`; prueba que lo verifica |
| 2 | Motor separado | `domain/finance/` (tasas, amortización, recurrencias, festivos, Ledger, proyecciones) sin Django; vistas → servicios → dominio |
| 3 | Trazabilidad | Registro de auditoría por cambio (quién, cuándo, antes y después, cifrado); nada se borra |
| 4 | Atomicidad | Todo servicio contable en `transaction.atomic` + `select_for_update` sobre el periodo o la cuenta |
| 5 | Conciliados | Inmutables: corregir = asiento de ajuste auditable; prueba que intenta editar uno |
| 6 | Fechas | Fechas de negocio = `DateField`; instantes en UTC; el «hoy» y los vencimientos en America/Bogota; festivos de Colombia en el dominio (ley Emiliani + Pascua) con tabla de excepciones |
| 7 | Seguridad | MFA, cifrado §2, aislamiento por `owner`, permisos por endpoint, límites de tasa, sin contenido en el admin |
| 8 | Pruebas | Cobertura de `domain/finance` ≥ 95 %; pruebas de propiedades (Hypothesis) para cuadratura y reconstrucción de saldos; los ejemplos del diseño (24 % EA = 1,8088 % EM; cuota $723.048; interés $75.969…) como casos fijos |
| 9 | Idempotencia | `Idempotency-Key` obligatorio al crear movimientos; clave natural (recurrencia + fecha) al generar pendientes |
| 10 | Saldos derivados | Saldo = suma de asientos; caché por cuenta con verificador nocturno que alerta si difiere; conciliación contra extracto |

## 4. Fases

| Fase | Repo | Alcance | Hecho cuando |
|---|---|---|---|
| **FMS-0 Cimientos** | ambos | Repo FMS: Next 16 + basePath, lint, tsc, vitest y CI. CV: apps vacías, `domain/finance` con Ledger y tasas, `FinanceProfile`, cifrado, activación con MFA, casilla en el login, nginx `/finanzas` y `/api/fms`, `fms-web` en compose, borrador legal | `/finanzas` sirve la app con la sesión del CV; activar crea la DEK; otro usuario recibe 404; el admin no ve contenido; e2e de activación |
| **FMS-1 v1** | ambos | Cortes 1.1–1.10 del diseño | Sus criterios de aceptación, más las reglas de §3 con prueba |
| **FMS-2 v2** | ambos | Cortes 2.1–2.8 | Ídem |
| **FMS-3 v3** | ambos | Cortes 3.1–3.6 | Ídem |
| **FMS-4 Móvil** | FMS | React Native (Expo) sobre la misma API, Expo push | Paridad del Resumen y del alta rápida |

Cada fase llega como PR(s) a `master` en el CV y a `main` en el FMS, con pruebas acotadas (regla del propietario: sin
suites completas e2e salvo el humo y lo del módulo). Ejecución: Sonnet; revisión y merge: Opus; tareas simples: Haiku.

## 5. Riesgos y dependencias

- **Rendimiento con montos cifrados**: se mide en FMS-1 con 10 años de datos sintéticos (unos 30.000 movimientos). Si el
  Resumen tarda más de 300 ms, se añade un caché de saldos cifrado por usuario.
- **Pérdida de la KEK = pérdida de todos los datos del FMS**: va en el procedimiento de respaldos fuera del VPS (pendiente
  C3), antes de abrir el FMS a otros usuarios.
- **Web Push en iPhone**: solo con la web instalada en la pantalla de inicio (iOS 16.4+). Hasta la etapa nativa, en iPhone
  hay correo y avisos en la aplicación.
- **Dependencias nuevas** (≥ 2 semanas publicadas): `cryptography` (seguramente ya está, vía allauth), `hypothesis` (pruebas),
  `pywebpush` (avisos), una librería xlsx (v2).

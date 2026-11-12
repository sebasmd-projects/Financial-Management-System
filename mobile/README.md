# FMS móvil: app Android «Finanzas» (FMS-4)

React Native con **Expo SDK 58** (React Native 0.88, Expo Router). Habla con la **misma API** que la web (`/api/fms/v1/`) y con el cliente `app` de
allauth (`/_allauth/app/v1/`) del backend del CV. Paquete `com.sebasmoralesd.finanzas`. Android primero.

**Distribución**: un **APK firmado de descarga directa**. Sin tiendas, sin EAS, sin cuenta de Expo y sin el servicio de push de Expo. Se compila en
tu máquina con `expo prebuild` + Gradle (más abajo). Las notificaciones (siguiente entrega) irán por FCM directo.

Estado de esta entrega: base (`core/` compartido con la web), esqueleto, y sesión + bloqueo (entrar con contraseña y código, «Recordarme», activar el
FMS y el segundo factor, dispositivos, reautenticación, bloqueo biométrico). **Todavía no hay** Resumen, alta rápida, movimientos ni notificaciones.

## Reglas que no se rompen (las vigilan `eslint.config.mjs` y `guards.test.ts`)

* **Nada financiero en disco.** Lo único que se guarda es el **token de sesión**, en `expo-secure-store` (Keystore de Android) con
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, y **solo si se marca «Recordarme»**. Todo lo demás vive en memoria y se borra al bloquear o cerrar sesión. Sin
  AsyncStorage, MMKV, SQLite, `expo-file-system`, portapapeles, ni analítica o reporte de fallos. Android `allowBackup: false`.
* **Un módulo por API sensible**: el llavero solo en `src/auth/token-store.ts`, la biometría solo en `src/lock/biometric.ts`, la captura de
  pantalla solo en `src/lock/privacy-shield.tsx`, las peticiones solo por `src/api/http.ts`.
* **Dinero = cadenas decimales** y `BigInt` (`core/money.ts`, compartido con la web). Nunca `Number`, `parseFloat`, `toFixed` ni `Intl.NumberFormat`.
* **Sin montos en rutas ni enlaces profundos**: las rutas no llevan parámetros (`src/auth/routes.ts`).
* **Una `Idempotency-Key` por intención** de la persona, con `expo-crypto` (`src/api/ids.ts`).
* Bogotá es **UTC−5 fijo** en `core/dates.ts` (Hermes no siempre trae datos de zonas horarias).

## Sesión y bloqueo

| Qué | Cómo |
|---|---|
| Entrar | `POST auth/login` (correo o usuario + contraseña). Si falta el segundo factor: `auth/2fa/authenticate` (visitantes) o `auth/staff/otp` (personal), con TOTP o código de recuperación |
| «Recordarme» | Manda `X-Remember-Me: 1` (el servidor renueva la sesión al usarla) **y** guarda el token en el llavero. Sin marcarlo, el token solo está en memoria: al cerrar la app hay que entrar de nuevo |
| Dispositivo | Cada petición de entrada declara `X-Device-Platform`, `X-Device-Model` (modelo, no el nombre que le pusiste al teléfono) y `X-App-Version`; el servidor lo lista en «Dispositivos» |
| Activar el FMS | Pantalla `setup`: activar un TOTP si la cuenta no tiene (`account/authenticators/totp`; se muestra la clave y un enlace `otpauth://`, más los códigos de recuperación), aceptar términos y privacidad (`POST /activation`). El personal activa su segundo factor por consola, no desde la app |
| Bloqueo | Huella, rostro o PIN del teléfono al **abrir en frío** y tras **60 s en segundo plano** (`src/lock/policy.ts`). Sin ningún bloqueo de pantalla en el teléfono, la app no se usa. Con «Recordarme», el token ni siquiera se lee del llavero hasta que desbloqueas |
| Privacidad | `FLAG_SECURE` en toda la app (sin capturas, grabación ni miniatura en recientes) y un velo opaco cuando la app no está en primer plano |
| Reautenticación | El FMS contesta `403 reauthentication_required` (allauth: `401` con el flujo `reauthenticate`/`mfa_reauthenticate`): la app pide la contraseña o un código, llama a `auth/reauthenticate` o `auth/2fa/reauthenticate` y **repite la petición** una vez (con la misma `Idempotency-Key`) |
| Sesión terminada | `401 device_expired`, `device_revoked` o `invalid_token` del FMS, o `410` de allauth: se borra todo, se vuelve a la entrada y se dice por qué |
| Dispositivos | Lista, cerrar uno y «cerrar las demás» (con reautenticación). Cerrar el propio es cerrar sesión |

## Desarrollo

```bash
cd mobile && npm ci --ignore-scripts
npm run lint && npm run typecheck && npm test      # sin dispositivo
npx expo-doctor && npx expo export --platform android
```

Para probar en un emulador con el backend local (`http://10.0.2.2:8000` es el `localhost` de tu máquina; solo se admite `http` en depuración):

```bash
FMS_API_ORIGIN=http://10.0.2.2:8000 npx expo run:android      # necesita Android SDK y un emulador
```

`core/` (en la raíz del repositorio, fuera de `mobile/`) es código sin dependencias que comparten la web y la app: dinero, fechas y el cliente de la API.
Metro lo ve por `metro.config.js`; los tipos del contrato salen de `core/api/openapi-fms.yaml` (`npm run api:types` en la raíz).

## Compilar el APK firmado (en tu máquina)

Requisitos: Node 22, **JDK 17 o 21**, Android SDK (`ANDROID_HOME`; Gradle baja la plataforma y las build-tools que pida si aceptas las licencias con
`sdkmanager --licenses`). Gradle 9.4.1 lo baja el propio wrapper.

### 1. Crear la llave de firma (una sola vez)

```bash
mkdir -p ~/.fms-android
keytool -genkeypair -v -keystore ~/.fms-android/finanzas-release.jks -alias finanzas \
  -keyalg RSA -keysize 4096 -validity 10000
```

Guarda el `.jks` y sus dos contraseñas **fuera de este equipo también** (gestor de contraseñas y una copia sin conexión). Android solo actualiza una app instalada
si el APK nuevo está firmado con la **misma llave**; si la pierdes tendrás que desinstalar e instalar de nuevo (no se pierde ningún dato: todo está en el servidor).
**Nunca** la subas al repositorio (`.gitignore` ya excluye `*.jks`, `*.keystore` y `keystore.properties`).

Crea `mobile/keystore.properties` (también ignorado por git):

```properties
storeFile=/home/tu-usuario/.fms-android/finanzas-release.jks
storePassword=…
keyAlias=finanzas
keyPassword=…
```

El plugin `plugins/release-signing.js` hace que el release use esta llave y **se niega a compilar** si el archivo no existe (el valor por defecto de Expo sería
la llave de depuración, que cualquiera tiene).

### 2. Compilar

```bash
cd mobile
npm ci --ignore-scripts
# Opcional: otro origen del sitio. Por defecto https://sebasmoralesd.com (se fija al compilar, en app.config.ts).
# export FMS_API_ORIGIN=https://sebasmoralesd.com
npm run prebuild                       # expo prebuild --platform android --clean → genera android/ (no se versiona)
node scripts/check-prebuild.mjs        # el release va firmado con tu llave; allowBackup y permisos como se espera
cd android && ./gradlew assembleRelease
```

El APK queda en `mobile/android/app/build/outputs/apk/release/app-release.apk`. Compruébalo antes de repartirlo:

```bash
"$ANDROID_HOME"/build-tools/<versión>/apksigner verify --print-certs app-release.apk   # el SHA-256 del certificado debe ser el de TU llave
sha256sum app-release.apk                                                              # publícalo junto al enlace de descarga
```

Para actualizar: sube `android.versionCode` (y `version`) en `app.config.ts`, repite los pasos y firma con **la misma llave**. Instalar: abre el APK en el teléfono
(permite «instalar apps desconocidas» para tu navegador) o `adb install -r app-release.apk`.

### 3. `google-services.json` (solo para las notificaciones, siguiente entrega)

Las notificaciones usarán Firebase Cloud Messaging directo (`expo-notifications`, token nativo de FCM; sin servicio de push de Expo). Cuando lleguen:

1. En la consola de Firebase crea un proyecto y añade una app Android con el paquete **`com.sebasmoralesd.finanzas`**.
2. Descarga `google-services.json` y déjalo en **`mobile/google-services.json`** (ignorado por git), o apunta a otra ruta con `GOOGLE_SERVICES_JSON=/ruta/google-services.json`.
   `app.config.ts` lo incluye solo si existe. La cuenta de servicio del servidor es aparte (`DEPLOYMENT.md` §33 del CV).
3. Repite el `prebuild`.

Hoy no hace falta y la app no lo usa.

## Dependencias

* **SDK 58** (`expo 58.0.21`): la versión más reciente de Expo (SDK 58.0.0 salió el 2026-09-29) con un parche publicado hace al menos dos semanas. Regla del repositorio:
  toda dependencia, directa o transitiva, con **≥ 2 semanas** de publicada. Se consigue instalando con `npm install --before=<hoy − 14 días>` (los árboles ya van
  resueltos en `package-lock.json`).
* Versiones exactas (sin `^` ni `~`) y bloqueo versionado; **sin workspaces** (Expo fija su React y la web el suyo).
* `expo-doctor` compara con el parche más reciente de cada paquete; los que salieron hace menos de dos semanas están en `expo.install.exclude` de `package.json` para que no
  fallen. Al subir de parche, quítalos de esa lista a medida que cumplan las dos semanas.
* El `overrides.zod` repite el de la web (aviso de memoria de `zod < 4.6.6`); `npm audit --omit=dev --audit-level=high` corre en CI.

## Qué NO se ha podido comprobar

No hay dispositivo ni emulador en el entorno de desarrollo de esta entrega. Está comprobado con pruebas, `expo export` y `expo prebuild`; **no** se ha visto la app en
pantalla ni se ha compilado el APK con Gradle. Revisa a mano en un teléfono real: el aviso de huella al abrir, el bloqueo a los 60 s, que no se pueda capturar la pantalla
ni ver la miniatura en recientes, el aviso de reautenticación y que `usePreventScreenCapture` no choque con el diálogo de huella.

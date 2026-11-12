import type { ExpoConfig } from "expo/config";

/**
 * Configuración de la app Android «Finanzas» (FMS-4). Se distribuye como APK firmado de descarga directa: sin tiendas, sin EAS,
 * sin cuenta de Expo y sin actualizaciones por aire (OTA). Se compila en local con `expo prebuild` + Gradle (README.md).
 *
 *  - `FMS_API_ORIGIN`: origen HTTPS del sitio (por defecto el de producción); se fija al compilar. Para el emulador en desarrollo,
 *    `http://10.0.2.2:8000` (solo en builds de depuración: `src/config.ts` lo rechaza en release).
 *  - `GOOGLE_SERVICES_JSON`: ruta al `google-services.json` de Firebase (FCM). Solo se necesita al añadir las notificaciones.
 */
import { existsSync } from "node:fs";

const googleServices = process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json";

const config: ExpoConfig = {
  name: "Finanzas",
  slug: "finanzas",
  scheme: "finanzas",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  // Sin OTA: lo que corre es lo que se firmó y se instaló.
  updates: { enabled: false },
  runtimeVersion: { policy: "appVersion" },
  android: {
    package: "com.sebasmoralesd.finanzas",
    versionCode: 1,
    // Ningún dato de la app viaja a las copias de seguridad de Android ni a otro teléfono.
    allowBackup: false,
    // Solo lo que la app usa: red (INTERNET lo pone Android) y biometría. Nada de almacenamiento, superposición ni vibración.
    permissions: ["android.permission.USE_BIOMETRIC"],
    blockedPermissions: [
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.VIBRATE",
      "android.permission.USE_FINGERPRINT",
      "android.permission.RECORD_AUDIO",
    ],
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#2f3eb8" },
    ...(existsSync(googleServices) ? { googleServicesFile: googleServices } : {}),
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    ["expo-splash-screen", { image: "./assets/splash-icon.png", imageWidth: 160, backgroundColor: "#f6f5f1", dark: { backgroundColor: "#111318" } }],
    ["expo-local-authentication", { faceIDPermission: false }],
    ["expo-build-properties", { android: { usesCleartextTraffic: false, minSdkVersion: 26 } }],
  ],
  experiments: { typedRoutes: true },
  extra: { apiOrigin: process.env.FMS_API_ORIGIN ?? "https://sebasmoralesd.com" },
};

export default config;

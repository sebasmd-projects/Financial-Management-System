import { defineConfig, globalIgnores } from "eslint/config";
import expo from "eslint-config-expo/flat.js";

// Reglas del propietario (AGENTS.md del repositorio): nada financiero en disco, nada de consola, dinero sin Number. `guards.test.ts`
// repite las que importan sobre el TEXTO de los ficheros, por si alguien apaga el lint con un comentario.
const DISK = ["@react-native-async-storage/async-storage", "react-native-mmkv", "expo-sqlite", "expo-file-system", "expo-file-system/*", "expo-sharing", "expo-media-library", "expo-document-picker", "expo-image-picker", "react-native-fs", "realm", "@op-engineering/op-sqlite", "react-native-sqlite-storage", "@react-native-clipboard/clipboard", "expo-clipboard"];
const TELEMETRY = ["expo-updates", "@sentry/*", "sentry-expo", "@bugsnag/*", "@datadog/*", "firebase", "@react-native-firebase/*", "expo-firebase-analytics", "react-native-mixpanel", "mixpanel-react-native", "@amplitude/*", "posthog-react-native", "@segment/*", "expo-tracking-transparency", "react-native-code-push"];
const message = (what) => `${what}: la app no deja datos financieros en disco ni usa analítica o reportes de fallos (AGENTS.md).`;

export default defineConfig([
  ...expo,
  globalIgnores(["dist/**", "android/**", "ios/**", ".expo/**", "node_modules/**", "expo-env.d.ts"]),
  {
    files: ["src/**/*.{ts,tsx}", "app.config.ts"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-console": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [...DISK.map((name) => ({ name, message: message("Almacenamiento")})), ...TELEMETRY.map((name) => ({ name, message: message("Telemetría") }))],
          patterns: [{ group: ["@sentry/*", "@datadog/*", "@amplitude/*", "@segment/*", "@bugsnag/*", "@react-native-firebase/*"], message: message("Telemetría") }],
        },
      ],
      // Dinero: cadenas decimales y BigInt (core/money.ts). Ni Number, ni parseFloat, ni toFixed, ni Intl.NumberFormat.
      "no-restricted-globals": ["error", { name: "parseFloat", message: "Dinero: nunca parseFloat." }, { name: "localStorage", message: "Sin almacenamiento." }, { name: "sessionStorage", message: "Sin almacenamiento." }],
      "no-restricted-properties": ["error", { object: "Number", property: "parseFloat", message: "Dinero: nunca parseFloat." }, { object: "Number", property: "parseInt", message: "Dinero: usa BigInt o enteros validados." }],
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.name='Number']", message: "Dinero: BigInt o cadenas, nunca Number()." },
        { selector: "CallExpression[callee.property.name=/^(toFixed|toLocaleString)$/]", message: "Dinero: nunca toFixed/toLocaleString." },
        { selector: "MemberExpression[object.name='Intl'][property.name='NumberFormat']", message: "Dinero: formato propio (core/money.ts)." },
        { selector: "NewExpression[callee.object.name='Intl'][callee.property.name='NumberFormat']", message: "Dinero: formato propio (core/money.ts)." },
      ],
    },
  },
  {
    // Cada API sensible tiene UN módulo que la toca.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/auth/token-store.ts", "**/*.test.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { paths: [{ name: "expo-secure-store", message: "Solo src/auth/token-store.ts toca el llavero." }, ...DISK.map((name) => ({ name })), ...TELEMETRY.map((name) => ({ name }))] }] },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lock/biometric.ts", "src/auth/token-store.ts", "**/*.test.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { paths: [{ name: "expo-local-authentication", message: "Solo src/lock/biometric.ts." }, { name: "expo-secure-store", message: "Solo src/auth/token-store.ts." }, ...DISK.map((name) => ({ name })), ...TELEMETRY.map((name) => ({ name }))] }] },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lock/biometric.ts", "src/auth/token-store.ts", "src/lock/privacy-shield.tsx", "**/*.test.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { paths: [{ name: "expo-local-authentication", message: "Solo src/lock/biometric.ts." }, { name: "expo-secure-store", message: "Solo src/auth/token-store.ts." }, { name: "expo-screen-capture", message: "Solo src/lock/privacy-shield.tsx." }, ...DISK.map((name) => ({ name })), ...TELEMETRY.map((name) => ({ name }))] }] },
  },
]);

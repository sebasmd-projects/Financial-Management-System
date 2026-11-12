import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Datos financieros: nunca en almacenamiento del navegador ni en la consola (AGENTS.md). La única excepción es la
// preferencia de tema (`src/ui/theme/storage.ts`), sin datos del usuario. `src/guards.test.ts` repite la regla sobre
// el texto de los ficheros (por si alguien apaga el lint con un comentario).
const STORAGE = ["localStorage", "sessionStorage", "indexedDB", "caches"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "e2e/**", "mobile/**", "next-env.d.ts", "core/api/schema.gen.ts"]),
  {
    files: ["src/**/*.{ts,tsx}", "core/**/*.ts"],
    ignores: ["src/**/*.test.{ts,tsx}", "core/**/*.test.ts"],
    rules: {
      "no-restricted-globals": ["error", ...STORAGE.map((name) => ({ name, message: "Nada financiero en el navegador: solo el tema (src/ui/theme/storage.ts)." }))],
      "no-restricted-properties": [
        "error",
        ...STORAGE.map((property) => ({ object: "window", property, message: "Nada financiero en el navegador." })),
        ...STORAGE.map((property) => ({ object: "globalThis", property, message: "Nada financiero en el navegador." })),
      ],
      "no-console": "error",
    },
  },
  {
    // Dinero: cadenas decimales y BigInt. Ni `Number` ni `parseFloat` ni `Math` (redondeo) ni `Intl` (varía entre motores).
    files: ["core/money.ts"],
    rules: {
      "no-restricted-globals": ["error", { name: "Number", message: "Dinero: BigInt o cadenas, nunca Number." }, { name: "parseFloat", message: "Dinero: nunca parseFloat." }, { name: "parseInt", message: "Dinero: usa BigInt." }, { name: "Intl", message: "Dinero: formato propio, no Intl." }],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "round", message: "Dinero: redondeo propio sobre BigInt." },
        { object: "Math", property: "floor", message: "Dinero: redondeo propio sobre BigInt." },
        { object: "Number", property: "parseFloat", message: "Dinero: nunca parseFloat." },
      ],
      "no-restricted-syntax": ["error", { selector: "CallExpression[callee.property.name=/^(toFixed|toLocaleString)$/]", message: "Dinero: nunca toFixed/toLocaleString." }],
    },
  },
  {
    // `core/` lo comparten la web y la app: nada de React, Next, React Native ni Expo, ni del DOM de la web (`src/`).
    files: ["core/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ regex: "^(react|react-dom|next|react-native|expo|@react-native|@expo)(/|$)|^@/|src/", message: "core/ no depende de plataforma ni de la web." }] }],
    },
  },
  {
    files: ["src/ui/theme/storage.ts"],
    rules: { "no-restricted-globals": "off", "no-restricted-properties": "off" },
  },
]);

export default eslintConfig;

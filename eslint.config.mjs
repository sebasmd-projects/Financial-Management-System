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
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "e2e/**", "next-env.d.ts"]),
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
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
    files: ["src/lib/money.ts"],
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
    files: ["src/ui/theme/storage.ts"],
    rules: { "no-restricted-globals": "off", "no-restricted-properties": "off" },
  },
]);

export default eslintConfig;

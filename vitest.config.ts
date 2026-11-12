import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Lógica pura, cabeceras del proxy, cliente de la API y componentes renderizados a HTML (react-dom/server): entorno Node.
export default defineConfig({
  resolve: { alias: { "@": fromRoot("./src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "core/**/*.test.ts"],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});

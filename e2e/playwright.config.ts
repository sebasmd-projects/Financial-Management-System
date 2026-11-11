import { defineConfig, devices } from "@playwright/test";

// Humo de FMS-0: la compuerta (con la API SIMULADA en el navegador con `page.route`: no hace falta Django), las rutas por
// idioma, las redirecciones de `/finanzas` y `/finance`, `hreflang` y la página de aterrizaje. Necesita la app construida
// (`npm run build` en la raíz); el servidor es `next start` en el puerto 3100. Ver `e2e/README.md`.
const PORT = 3100;
// `PW_CHROMIUM`: un Chromium ya instalado (entornos sin descarga). Sin él, el que instala `npx playwright install chromium`.
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [{ name: "chromium", use: { ...devices["Pixel 7"], launchOptions: { executablePath } } }],
  webServer: {
    command: "npm --prefix .. run start",
    url: `http://127.0.0.1:${PORT}/_fms/healthz`,
    // Las URLs absolutas (canonical, hreflang, sitemap) salen de SITE_URL.
    env: { SITE_URL: `http://127.0.0.1:${PORT}` },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

import { expect, test, type Page } from "@playwright/test";

// La compuerta contra `/api/fms/v1/me` simulado, en los dos idiomas. Datos sintéticos.
const ME = {
  user: { id: 1, display_name: "Ana Prueba", email: "ana@example.test", email_verified: true },
  mfa_verified: true,
  finance_active: true,
  consent: { required_version: "2026-11-10", accepted_version: "2026-11-10" },
  mfa_setup_url: "/es/account/2fa",
  login_url: "/es/account/login",
};
const INACTIVE = { ...ME, finance_active: false, consent: { required_version: "2026-11-10", accepted_version: null } };

const LOCALES = [
  { locale: "es", root: "/es/finanzas", app: "/es/finanzas/pagos/fijos", login: "/es/account/login", summary: "Resumen financiero", activate: "Activa tus finanzas", activateBtn: "Activar Finanzas", signIn: "Iniciar sesión", hero: "Tus finanzas personales, claras y bajo tu control" },
  { locale: "en", root: "/en/finance", app: "/en/finance/payments/fixed", login: "/en/account/login", summary: "Financial summary", activate: "Activate your finances", activateBtn: "Activate Finances", signIn: "Sign in", hero: "Your personal finances, clear and under your control" },
] as const;

async function mockMe(page: Page, status: number, body: unknown) {
  await page.route("**/api/fms/v1/me", (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }));
}

for (const L of LOCALES) {
  test.describe(L.locale, () => {
    test("sin sesión, desde una página de la app: al login del CV con ?next=<esa página>", async ({ page }) => {
      await mockMe(page, 401, {});
      // El inicio de sesión es del CV (otra aplicación): aquí se simula su página.
      await page.route(`**${L.login}**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>login</title>" }));
      await page.goto(L.app);
      await page.waitForURL(new RegExp(`${L.login}\\?next=`));
      expect(new URL(page.url()).pathname).toBe(L.login);
      expect(new URL(page.url()).searchParams.get("next")).toBe(L.app);
    });

    test("sin sesión, en la raíz: se queda la página de aterrizaje (pública), sin redirigir", async ({ page }) => {
      await mockMe(page, 401, {});
      await page.goto(L.root);
      await expect(page.getByRole("heading", { level: 1, name: L.hero })).toBeVisible();
      await page.waitForTimeout(400);
      expect(new URL(page.url()).pathname).toBe(L.root);
      const signIn = page.getByRole("link", { name: L.signIn }).first();
      await expect(signIn).toHaveAttribute("href", `${L.login}?next=${encodeURIComponent(L.root)}`);
    });

    test("cuenta activa en la raíz: el Resumen en la misma URL, con la cáscara", async ({ page }) => {
      await mockMe(page, 200, ME);
      await page.goto(L.root);
      await expect(page.getByRole("heading", { level: 1, name: L.summary })).toBeVisible();
      await expect(page.getByRole("navigation", { name: L.locale === "es" ? "Navegación inferior" : "Bottom navigation" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: L.hero })).toHaveCount(0);
      expect(new URL(page.url()).pathname).toBe(L.root);
    });

    test("autenticada pero sin activar: Activación, bloqueada hasta aceptar", async ({ page }) => {
      await mockMe(page, 200, INACTIVE);
      await page.goto(L.root);
      await expect(page.getByRole("heading", { level: 1, name: L.activate })).toBeVisible();
      const submit = page.getByRole("button", { name: L.activateBtn });
      await expect(submit).toBeDisabled();
      await page.getByRole("checkbox").check();
      await expect(submit).toBeEnabled();
    });

    test("sin 2FA: botón a la configuración y no se puede activar", async ({ page }) => {
      await mockMe(page, 200, { ...INACTIVE, mfa_verified: false });
      await page.goto(L.root);
      await expect(page.getByRole("link", { name: L.locale === "es" ? "Configurar verificación en dos pasos" : "Set up two-step verification" })).toHaveAttribute("href", "/es/account/2fa");
      await page.getByRole("checkbox").check();
      await expect(page.getByRole("button", { name: L.activateBtn })).toBeDisabled();
    });

    test("activación: un 403 muestra su mensaje", async ({ page }) => {
      await mockMe(page, 200, INACTIVE);
      await page.route("**/_allauth/cv/v1/csrf", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ csrfToken: "tok" }) }));
      await page.route("**/api/fms/v1/activation", (route) => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "email_unverified" }) }));
      await page.goto(L.root);
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: L.activateBtn }).click();
      // (Next añade su propio role=alert para anunciar rutas: se apunta al párrafo del error.)
      await expect(page.locator("p[role=alert]")).toContainText(L.locale === "es" ? "correo todavía no está verificado" : "email is not verified yet");
    });
  });
}

test("activa: navegación en la barra inferior, enlace para saltar y cambio de idioma a la página equivalente", async ({ page }) => {
  await mockMe(page, 200, ME);
  await page.goto("/es/finanzas");
  await expect(page.getByRole("link", { name: "Saltar al contenido" })).toHaveAttribute("href", "#contenido");
  await page.getByRole("link", { name: "Pagos" }).first().click();
  await expect(page).toHaveURL(/\/es\/finanzas\/pagos$/);
  await page.goto("/es/finanzas/pagos/fijos");
  await page.getByRole("button", { name: "Menú de la cuenta" }).click();
  await page.getByRole("link", { name: /Idioma: English/ }).click();
  await expect(page).toHaveURL(/\/en\/finance\/payments\/fixed$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1, name: "Fixed expenses" })).toBeVisible();
  // …y de vuelta.
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("link", { name: /Language: Español/ }).click();
  await expect(page).toHaveURL(/\/es\/finanzas\/pagos\/fijos$/);
});

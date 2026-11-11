import { expect, test, type Page } from "@playwright/test";

// La compuerta contra `/api/fms/v1/me` simulado. Datos sintéticos.
const ME = {
  user: { id: 1, display_name: "Ana Prueba", email: "ana@example.test", email_verified: true },
  mfa_verified: true,
  finance_active: true,
  consent: { required_version: "2026-11-10", accepted_version: "2026-11-10" },
  mfa_setup_url: "/es/account/2fa",
  login_url: "/es/account/login",
};

async function mockMe(page: Page, status: number, body: unknown) {
  await page.route("**/api/fms/v1/me", (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }));
}

test("sin sesión: redirige al inicio de sesión del CV con ?next=/finanzas", async ({ page }) => {
  await mockMe(page, 401, {});
  // El inicio de sesión es del CV (otra aplicación): aquí se simula su página.
  await page.route("**/es/account/login**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>login</title>" }));
  await page.goto("/finanzas/movimientos");
  await page.waitForURL(/\/es\/account\/login\?next=%2Ffinanzas$/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/finanzas");
});

test("autenticada pero sin activar: Activación, con la activación bloqueada hasta aceptar", async ({ page }) => {
  await mockMe(page, 200, { ...ME, finance_active: false, consent: { required_version: "2026-11-10", accepted_version: null } });
  await page.goto("/finanzas");
  await expect(page.getByRole("heading", { level: 1, name: "Activa tus finanzas" })).toBeVisible();
  const submit = page.getByRole("button", { name: "Activar Finanzas" });
  await expect(submit).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(submit).toBeEnabled();
});

test("sin 2FA: botón a la configuración y no se puede activar", async ({ page }) => {
  await mockMe(page, 200, { ...ME, finance_active: false, mfa_verified: false, consent: { required_version: "2026-11-10", accepted_version: null } });
  await page.goto("/finanzas");
  await expect(page.getByRole("link", { name: "Configurar verificación en dos pasos" })).toHaveAttribute("href", "/es/account/2fa");
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: "Activar Finanzas" })).toBeDisabled();
});

test("activación: un 403 muestra su mensaje en español", async ({ page }) => {
  await mockMe(page, 200, { ...ME, finance_active: false, consent: { required_version: "2026-11-10", accepted_version: null } });
  await page.route("**/_allauth/cv/v1/csrf", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ csrfToken: "tok" }) }));
  await page.route("**/api/fms/v1/activation", (route) => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "email_unverified" }) }));
  await page.goto("/finanzas");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Activar Finanzas" }).click();
  // (Next añade su propio role=alert para anunciar rutas: se apunta al párrafo del error.)
  await expect(page.locator("p[role=alert]")).toContainText("correo todavía no está verificado");
});

test("activa: la cáscara con la navegación y el enlace para saltar al contenido", async ({ page }) => {
  await mockMe(page, 200, ME);
  await page.goto("/finanzas");
  await expect(page.getByRole("heading", { level: 1, name: "Resumen financiero" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navegación inferior" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Saltar al contenido" })).toHaveAttribute("href", "#contenido");
  await page.getByRole("link", { name: "Movimientos" }).first().click();
  await expect(page).toHaveURL(/\/finanzas\/movimientos$/);
  await expect(page.getByRole("heading", { level: 1, name: "Historial de movimientos" })).toBeVisible();
});

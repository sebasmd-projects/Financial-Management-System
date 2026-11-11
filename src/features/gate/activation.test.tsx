import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createApiClient } from "@/api/client";
import { en } from "@/i18n/dictionaries/en";
import { es } from "@/i18n/dictionaries/es";
import { I18nProvider } from "@/i18n/provider";
import { SessionProvider } from "@/features/session/provider";
import { createSessionStore } from "@/features/session/store";
import { ME } from "@/test/fixtures";
import { mockFetch } from "@/test/mock-fetch";
import { Activation } from "./activation";
import { activationBlocker, activationErrorMessage, canActivate, shouldReloadAfter, submitActivation } from "./activation-logic";

const store = createSessionStore({ get: async () => ({ ok: false as const, status: 0, code: "network", data: undefined }) });

function render(me: typeof ME, mode: "inactive" | "reconsent" | "mfa-only", locale: "es" | "en" = "es") {
  return renderToStaticMarkup(
    <I18nProvider locale={locale} dict={locale === "es" ? es : en}>
      <SessionProvider store={store}>
        <Activation me={me} mode={mode} />
      </SessionProvider>
    </I18nProvider>,
  );
}

const inactive = { ...ME, finance_active: false, consent: { required_version: "2026-11-10", accepted_version: null } };

describe("pantalla de Activación", () => {
  it("muestra términos y privacidad del CV, la versión, la casilla y explica el 2FA", () => {
    const html = render(inactive, "inactive");
    expect(html).toContain('href="/es/terms"');
    expect(html).toContain('href="/es/privacy"');
    expect(html).toContain("2026-11-10");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("Verificación en dos pasos (2FA)");
    expect(html).toContain("Activa tus finanzas");
    // Enlaces a otra aplicación: pestaña nueva, sin opener ni referrer.
    expect(html).toMatch(/href="\/es\/terms" target="_blank" rel="noopener noreferrer"/);
  });
  it("con 2FA verificado y sin marcar la casilla: el botón sigue deshabilitado y dice por qué", () => {
    const html = render(inactive, "inactive");
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""/);
    expect(html).toContain("Marca la casilla para aceptar.");
    expect(html).toContain("Verificación en dos pasos lista.");
    expect(html).not.toContain("Configurar verificación en dos pasos");
  });
  it("SIN 2FA: botón hacia mfa_setup_url, volver a comprobar y activar deshabilitado", () => {
    const html = render({ ...inactive, mfa_verified: false, mfa_setup_url: "/es/account/2fa" }, "inactive");
    expect(html).toContain('href="/es/account/2fa"');
    expect(html).toContain("Configurar verificación en dos pasos");
    expect(html).toContain("Ya la configuré");
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""/);
    expect(html).toContain("Primero completa la verificación en dos pasos.");
  });
  it("versión nueva de los términos y solo-2FA tienen su propio título", () => {
    expect(render({ ...ME, consent: { required_version: "2026-12-01", accepted_version: "2026-11-10" } }, "reconsent")).toContain("Actualizamos los términos");
    const mfaOnly = render({ ...ME, mfa_verified: false }, "mfa-only");
    expect(mfaOnly).toContain("Falta tu verificación en dos pasos");
    expect(mfaOnly).not.toContain('type="checkbox"');
    expect(mfaOnly).not.toContain('type="submit"');
  });
  it("en inglés: textos en inglés y términos y privacidad del CV en /en", () => {
    const html = render(inactive, "inactive", "en");
    expect(html).toContain("Activate your finances");
    expect(html).toContain('href="/en/terms"');
    expect(html).toContain('href="/en/privacy"');
    expect(html).toContain("Complete two-step verification first.".length ? "Terms" : "");
    expect(html).not.toContain("Activa tus finanzas");
  });
  it("main#contenido para el enlace «Saltar al contenido»", () => {
    expect(render(inactive, "inactive")).toMatch(/<main id="contenido" tabindex="-1"/);
  });
});

describe("reglas de activación", () => {
  const base = { mfaVerified: true, consent: true, submitting: false, needsConsent: true };
  it("solo con 2FA y casilla", () => {
    expect(canActivate(base)).toBe(true);
    expect(canActivate({ ...base, mfaVerified: false })).toBe(false);
    expect(canActivate({ ...base, consent: false })).toBe(false);
    expect(canActivate({ ...base, submitting: true })).toBe(false);
    expect(canActivate({ ...base, needsConsent: false })).toBe(false);
  });
  it("el motivo del bloqueo", () => {
    expect(activationBlocker({ ...base, mfaVerified: false }, es)).toBe(es.activation.needMfa);
    expect(activationBlocker({ ...base, consent: false }, es)).toBe(es.activation.needConsent);
    expect(activationBlocker(base, es)).toBeNull();
  });
  it("cada código 403 tiene un mensaje claro en español (y en inglés), distinto entre sí", () => {
    const codes = ["email_unverified", "mfa_required", "account_blocked", "consent_mismatch"];
    const messages = codes.map((code) => activationErrorMessage(code, es));
    expect(new Set(messages).size).toBe(4);
    expect(messages[0]).toContain("correo");
    expect(messages[1]).toContain("dos pasos");
    expect(messages[2]).toContain("bloqueada");
    expect(messages[3]).toContain("términos");
    expect(activationErrorMessage("mfa_required", en)).not.toBe(messages[1]);
    expect(activationErrorMessage("http_500", es)).toBe(es.activation.errors.generic);
    expect(activationErrorMessage("network", es)).toBe(es.activation.errors.network);
    expect(activationErrorMessage("lo-que-sea", es)).not.toContain("lo-que-sea");
  });
  it("tras estos fallos se vuelve a leer /me", () => {
    for (const code of ["mfa_required", "consent_mismatch", "email_unverified"]) expect(shouldReloadAfter(code)).toBe(true);
    for (const code of ["account_blocked", "network", "http_500"]) expect(shouldReloadAfter(code)).toBe(false);
  });
});

describe("POST /api/fms/v1/activation", () => {
  const run = async (reply: { status: number; json?: unknown }) => {
    const mock = mockFetch({ "POST /api/fms/v1/activation": reply });
    const client = createApiClient({ fetch: mock.fetch, readCookie: (n) => (n === "csrftoken" ? "tok" : null), onUnauthorized: () => {} });
    return { result: await submitActivation(client, "2026-11-10"), calls: mock.calls };
  };
  it("200 → ok, con la versión aceptada y CSRF", async () => {
    const { result, calls } = await run({ status: 200, json: {} });
    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ accept_version: "2026-11-10" });
    expect(calls[0].headers.get("X-CSRFToken")).toBe("tok");
  });
  it.each(["email_unverified", "mfa_required", "account_blocked", "consent_mismatch"])("403 %s → ese código, sin reintento", async (code) => {
    const { result, calls } = await run({ status: 403, json: { code } });
    expect(result).toEqual({ ok: false, code });
    expect(calls).toHaveLength(1);
  });
});

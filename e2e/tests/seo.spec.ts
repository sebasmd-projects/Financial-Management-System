import { expect, test } from "@playwright/test";

// Rutas por idioma, redirecciones, hreflang, cabeceras de la página de aterrizaje y de la app. Sin navegador: solo HTTP.
const ORIGIN = "http://127.0.0.1:3100"; // = SITE_URL de `playwright.config.ts`

const links = (html: string, rel: string) =>
  [...html.matchAll(new RegExp(`<link rel="${rel}"([^>]*)>`, "gi"))].map((m) => ({
    href: /href="([^"]*)"/.exec(m[1])?.[1],
    lang: /hreflang="([^"]*)"/i.exec(m[1])?.[1],
  }));
const noNonce = (html: string) => html.replace(/nonce="[^"]*"/g, 'nonce=""').replace(/'nonce-[^']*'/g, "'nonce-'").replace(/"nonce":"[^"]*"/g, '"nonce":""').replace(/nonce\\?"?:\\?"[^"\\]*\\?"/g, "nonce");

test.describe("/finanzas y /finance: 301 por Accept-Language", () => {
  const cases: [string, string | undefined, string][] = [
    ["/finanzas", "es-CO,es;q=0.9", "/es/finanzas"],
    ["/finance", "es", "/es/finanzas"],
    ["/finanzas", "en-US,en;q=0.9", "/en/finance"],
    ["/finanzas", "fr-FR,fr;q=0.9", "/en/finance"],
    ["/finance", "de", "/en/finance"],
    ["/finanzas", undefined, "/en/finance"],
    ["/finanzas/pagos/fijos", "en", "/en/finance/payments/fixed"],
    ["/finance/payments/fixed", "es", "/es/finanzas/pagos/fijos"],
    ["/finance/transactions/42/entries", "fr", "/en/finance/transactions/42/entries"],
  ];
  for (const [path, lang, target] of cases) {
    test(`${path} [${lang ?? "sin idioma"}] → ${target}`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0, headers: lang ? { "Accept-Language": lang } : { "Accept-Language": "" } });
      expect(response.status()).toBe(301);
      expect(new URL(response.headers().location, ORIGIN).pathname).toBe(target);
      expect(response.headers().vary).toContain("Accept-Language");
    });
  }
});

test.describe("hreflang y canonical", () => {
  const pages: [string, string, string][] = [
    ["/es/finanzas", `${ORIGIN}/es/finanzas`, `${ORIGIN}/en/finance`],
    ["/en/finance", `${ORIGIN}/en/finance`, `${ORIGIN}/es/finanzas`],
    ["/es/finanzas/pagos/fijos", `${ORIGIN}/es/finanzas/pagos/fijos`, `${ORIGIN}/en/finance/payments/fixed`],
    ["/en/finance/transactions/42/entries", `${ORIGIN}/en/finance/transactions/42/entries`, `${ORIGIN}/es/finanzas/movimientos/42/asientos`],
  ];
  for (const [path, canonical, other] of pages) {
    test(path, async ({ request }) => {
      const html = await (await request.get(path)).text();
      expect(links(html, "canonical").map((l) => l.href)).toEqual([canonical]);
      const alt = Object.fromEntries(links(html, "alternate").map((l) => [l.lang, l.href]));
      const isEs = path.startsWith("/es/");
      expect(alt.es).toBe(isEs ? canonical : other);
      expect(alt.en).toBe(isEs ? other : canonical);
      expect(alt["x-default"]).toBe(alt.en);
      expect(html).toContain(`<html lang="${isEs ? "es-CO" : "en"}"`);
    });
  }
});

test.describe("indexación y caché", () => {
  for (const path of ["/es/finanzas", "/en/finance"]) {
    test(`${path}: pública, indexable y sin no-store`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      const headers = response.headers();
      expect(headers["cache-control"]).not.toContain("no-store");
      expect(headers["x-robots-tag"]).toBeUndefined();
      expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
      expect(await response.text()).toContain('<meta name="robots" content="index, follow"/>');
    });
  }
  for (const path of ["/es/finanzas/pagos", "/en/finance/payments/fixed", "/es/finanzas/perfil"]) {
    test(`${path}: privada, noindex y no-store`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.headers()["cache-control"]).toContain("no-store");
      expect(response.headers()["x-robots-tag"]).toContain("noindex");
      expect(await response.text()).toMatch(/<meta name="robots" content="noindex, nofollow/);
    });
  }
  for (const path of ["/es/finanzas", "/en/finance"]) {
    test(`${path}: el HTML es el mismo con o sin cookies de sesión (ni un dato de la persona)`, async ({ request }) => {
      const anonymous = noNonce(await (await request.get(path)).text());
      const withSession = noNonce(
        await (await request.get(path, { headers: { Cookie: "__Host-cv_session=abc123; csrftoken=zzz", Authorization: "Bearer x", "X-Forwarded-User": "ana" } })).text(),
      );
      expect(withSession).toBe(anonymous);
      expect(anonymous).not.toMatch(/abc123|Ana Prueba/);
    });
  }
});

test("sitemap.xml y robots.txt: solo la página de aterrizaje", async ({ request }) => {
  const sitemap = await (await request.get("/_fms/sitemap.xml")).text();
  expect(sitemap.match(/<loc>[^<]+<\/loc>/g)).toEqual([`<loc>${ORIGIN}/es/finanzas</loc>`, `<loc>${ORIGIN}/en/finance</loc>`]);
  expect(sitemap).toContain('hreflang="x-default"');
  const robots = await (await request.get("/_fms/robots.txt")).text();
  expect(robots).toContain("Allow: /es/finanzas$");
  expect(robots).toContain("Disallow: /en/finance/");
});

test("recursos bajo /_fms y salud en /_fms/healthz", async ({ request }) => {
  const health = await request.get("/_fms/healthz");
  expect(health.status()).toBe(200);
  expect(await health.text()).toBe("ok");
  const html = await (await request.get("/en/finance")).text();
  const assets = [...html.matchAll(/(?:src|href)="(\/_fms\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
  expect(assets.length).toBeGreaterThan(2);
  expect(html).not.toMatch(/(?:src|href)="\/_next\//);
  for (const asset of assets.slice(0, 4)) expect((await request.get(asset)).status(), asset).toBe(200);
});

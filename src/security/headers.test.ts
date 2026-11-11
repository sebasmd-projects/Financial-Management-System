import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { config, legacyRedirectTarget, proxy } from "@/proxy";
import nextConfig from "../../next.config";
import { buildContentSecurityPolicy, createNonce, PRIVATE_PAGE_HEADERS, PUBLIC_LANDING_HEADERS, STATIC_SECURITY_HEADERS } from "./headers";

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values] as const;
    }),
  );
}

describe("CSP", () => {
  const d = directives(buildContentSecurityPolicy("abc", false));
  it("scripts solo del propio origen y con nonce; nunca unsafe-inline ni unsafe-eval en producción", () => {
    expect(d.get("script-src")).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'"]);
    expect(buildContentSecurityPolicy("abc", false)).not.toMatch(/unsafe-eval/);
    expect(d.get("script-src")).not.toContain("'unsafe-inline'");
    expect(d.get("style-src")).toEqual(["'self'", "'nonce-abc'"]);
  });
  it("unsafe-eval solo en desarrollo", () => {
    expect(buildContentSecurityPolicy("abc", true)).toContain("'unsafe-eval'");
  });
  it("nada de terceros: todo 'self'", () => {
    for (const name of ["default-src", "connect-src", "font-src", "form-action", "manifest-src", "worker-src"]) {
      expect(d.get(name), name).toEqual(["'self'"]);
    }
    expect(d.get("img-src")).toEqual(["'self'", "blob:", "data:"]);
    expect(buildContentSecurityPolicy("abc", false)).not.toMatch(/https?:|\*/);
  });
  it("no se puede incrustar ni cambiar la base; sin plugins", () => {
    expect(d.get("frame-ancestors")).toEqual(["'none'"]);
    expect(d.get("base-uri")).toEqual(["'none'"]);
    expect(d.get("object-src")).toEqual(["'none'"]);
  });
  it("el nonce es distinto en cada llamada y es base64", () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("cabeceras estáticas", () => {
  it("las exigidas", () => {
    expect(STATIC_SECURITY_HEADERS["Referrer-Policy"]).toBe("same-origin");
    expect(STATIC_SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(STATIC_SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(STATIC_SECURITY_HEADERS["Permissions-Policy"]).toMatch(/camera=\(\).*microphone=\(\).*geolocation=\(\)/);
  });
  it("Permissions-Policy no concede nada", () => {
    const policy = STATIC_SECURITY_HEADERS["Permissions-Policy"];
    for (const part of policy.split(",")) expect(part.trim()).toMatch(/^[a-z-]+=\(\)$/);
  });
  it("next.config las pone a todo, sin basePath, con los recursos en /_fms, salida standalone y sin X-Powered-By", async () => {
    expect(nextConfig.basePath).toBeUndefined();
    expect(nextConfig.assetPrefix).toBe("/_fms");
    expect(nextConfig.output).toBe("standalone");
    expect(nextConfig.poweredByHeader).toBe(false);
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    expect(Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]))).toEqual(STATIC_SECURITY_HEADERS);
  });
});

describe("next.config: reescrituras", () => {
  it("/_fms/_next, /_fms/healthz, el sitemap y el robots se sirven bajo el prefijo", async () => {
    const rewrites = (await nextConfig.rewrites!()) as { beforeFiles: { source: string; destination: string }[] };
    const map = Object.fromEntries(rewrites.beforeFiles.map((r) => [r.source, r.destination]));
    expect(map["/_fms/_next/:path*"]).toBe("/_next/:path*");
    expect(map["/_fms/healthz"]).toBe("/healthz");
    expect(map["/_fms/sitemap.xml"]).toBe("/fms-sitemap");
    expect(map["/_fms/robots.txt"]).toBe("/fms-robots");
    expect(map["/_fms/sw.js"]).toBe("/fms-sw");
  });
  it("sin FMS_BACKEND_PROXY_URL no hay reescritura hacia Django", async () => {
    const rewrites = (await nextConfig.rewrites!()) as { afterFiles: unknown[] };
    expect(rewrites.afterFiles).toEqual([]);
  });
});

describe("rutas sin idioma: 301 por Accept-Language", () => {
  const to = (path: string, lang: string | null, search = "") => legacyRedirectTarget(path, search, lang);
  it("es* → español; cualquier otro idioma o ninguno → inglés", () => {
    expect(to("/finanzas", "es-CO,es;q=0.9")).toBe("/es/finanzas");
    expect(to("/finanzas", "es")).toBe("/es/finanzas");
    expect(to("/finance", "es-AR")).toBe("/es/finanzas");
    expect(to("/finanzas", "en-US,en;q=0.9")).toBe("/en/finance");
    expect(to("/finanzas", "fr-FR")).toBe("/en/finance");
    expect(to("/finance", "de")).toBe("/en/finance");
    expect(to("/finanzas", null)).toBe("/en/finance");
    expect(to("/finance", "")).toBe("/en/finance");
  });
  it("las subrutas conservan su equivalencia (y la consulta)", () => {
    expect(to("/finanzas/pagos/fijos", "es")).toBe("/es/finanzas/pagos/fijos");
    expect(to("/finanzas/pagos/fijos", "en")).toBe("/en/finance/payments/fixed");
    expect(to("/finance/payments/fixed", "es")).toBe("/es/finanzas/pagos/fijos");
    expect(to("/finance/transactions/42/entries", "fr")).toBe("/en/finance/transactions/42/entries");
    expect(to("/finanzas/movimientos/egresos", "en", "?p=1")).toBe("/en/finance/transactions/expenses?p=1");
    expect(to("/finanzas/no-existe", "es")).toBe("/es/finanzas");
    expect(to("/finanzas/", "en")).toBe("/en/finance");
  });
  it("lo que no es /finanzas ni /finance no se redirige", () => {
    expect(to("/es/finanzas", "es")).toBeNull();
    expect(to("/en/finance/payments", "es")).toBeNull();
    expect(to("/finanzas-falsa", "es")).toBeNull();
    expect(to("/", "es")).toBeNull();
  });
  it("el proxy responde 301 con Vary y sin cookies; el destino lleva el origen de la petición, o SITE_URL si está", () => {
    const response = proxy(new NextRequest("http://0.0.0.0:3100/finanzas/pagos", { headers: { "accept-language": "en-GB" } }));
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("http://0.0.0.0:3100/en/finance/payments");
    vi.stubEnv("SITE_URL", "https://example.test");
    expect(proxy(new NextRequest("http://0.0.0.0:3100/finanzas/pagos", { headers: { "accept-language": "es" } })).headers.get("Location")).toBe("https://example.test/es/finanzas/pagos");
    vi.unstubAllEnvs();
    expect(response.headers.get("Vary")).toBe("Accept-Language");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(proxy(new NextRequest("http://x/finance")).headers.get("Location")).toBe("http://x/en/finance");
  });
});

describe("proxy", () => {
  const get = (path = "/es/finanzas/movimientos") => proxy(new NextRequest(`http://localhost:3100${path}`));

  it("una página de la app recibe CSP con nonce en respuesta y petición, no-store y las cabeceras de seguridad", () => {
    const response = get();
    const csp = response.headers.get("Content-Security-Policy") ?? "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(response.headers.get("Cache-Control")).toBe(PRIVATE_PAGE_HEADERS["Cache-Control"]);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(response.headers.get("Referrer-Policy")).toBe("same-origin");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Permissions-Policy")).toContain("camera=()");
    expect(response.headers.get("x-middleware-override-headers")).toContain("content-security-policy");
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
  });
  it("la página de aterrizaje (es y en) se indexa y NO es no-store, pero lleva la misma CSP con nonce", () => {
    for (const path of ["/es/finanzas", "/en/finance"]) {
      const response = get(path);
      expect(response.headers.get("Cache-Control"), path).toBe(PUBLIC_LANDING_HEADERS["Cache-Control"]);
      expect(response.headers.get("Cache-Control"), path).not.toContain("no-store");
      expect(response.headers.get("X-Robots-Tag"), path).toBeNull();
      expect(response.headers.get("Content-Security-Policy"), path).toContain("'nonce-");
      expect(response.headers.get("X-Frame-Options"), path).toBe("DENY");
    }
    // …y solo ella: cualquier otra pantalla, también en inglés, es privada.
    for (const path of ["/en/finance/payments", "/es/finanzas/perfil", "/en/finance/zzz"]) {
      expect(get(path).headers.get("Cache-Control"), path).toContain("no-store");
      expect(get(path).headers.get("X-Robots-Tag"), path).toContain("noindex");
    }
  });
  it("cada petición, un nonce distinto", () => {
    const nonce = () => /'nonce-([^']+)'/.exec(get().headers.get("Content-Security-Policy") ?? "")?.[1];
    expect(nonce()).not.toBe(nonce());
  });
  it("un POST (u otro método de escritura) a una página es un 405 limpio", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = proxy(new NextRequest("http://localhost:3100/es/finanzas/movimientos", { method }));
      expect(response.status, method).toBe(405);
      expect(response.headers.get("Allow")).toBe("GET, HEAD, OPTIONS");
    }
    expect(proxy(new NextRequest("http://localhost:3100/en/finance", { method: "HEAD" })).status).toBe(200);
  });
  it("el matcher cubre las páginas de la app y las rutas sin idioma; deja fuera healthz, recursos y todo lo del CV", () => {
    const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });
    for (const url of ["/es/finanzas", "/en/finance", "/es/finanzas/pagos/fijos/3/pagar", "/en/finance/transactions", "/finanzas", "/finance", "/finanzas/pagos", "/finance/payments/fixed"]) {
      expect(matches(url), url).toBe(true);
    }
    for (const url of ["/_fms/healthz", "/_fms/_next/static/chunks/a.js", "/_fms/sitemap.xml", "/healthz", "/es/account/login", "/en/portfolio", "/api/fms/v1/me", "/favicon.ico", "/"]) {
      expect(matches(url), url).toBe(false);
    }
  });
});

import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "@/proxy";
import nextConfig from "../../next.config";
import { buildContentSecurityPolicy, createNonce, PRIVATE_PAGE_HEADERS, STATIC_SECURITY_HEADERS } from "./headers";

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
  it("next.config las pone a todo, con basePath /finanzas, salida standalone y sin X-Powered-By", async () => {
    expect(nextConfig.basePath).toBe("/finanzas");
    expect(nextConfig.output).toBe("standalone");
    expect(nextConfig.poweredByHeader).toBe(false);
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    expect(Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]))).toEqual(STATIC_SECURITY_HEADERS);
  });
});

describe("proxy", () => {
  const get = (path = "/movimientos") => proxy(new NextRequest(`http://localhost:3100${path}`));

  it("una página recibe CSP con nonce en respuesta y petición, no-store y las cabeceras de seguridad", () => {
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
  it("cada petición, un nonce distinto", () => {
    const nonce = () => /'nonce-([^']+)'/.exec(get().headers.get("Content-Security-Policy") ?? "")?.[1];
    expect(nonce()).not.toBe(nonce());
  });
  it("un POST (u otro método de escritura) a una página es un 405 limpio", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = proxy(new NextRequest("http://localhost:3100/movimientos", { method }));
      expect(response.status, method).toBe(405);
      expect(response.headers.get("Allow")).toBe("GET, HEAD, OPTIONS");
    }
    expect(proxy(new NextRequest("http://localhost:3100/", { method: "HEAD" })).status).toBe(200);
  });
  it("el matcher cubre la raíz y las páginas, y deja fuera healthz y los estáticos", () => {
    const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });
    expect(matches("/")).toBe(true);
    expect(matches("/movimientos")).toBe(true);
    expect(matches("/pagos/fijos/3/pagar")).toBe(true);
    expect(matches("/healthz")).toBe(false);
    expect(matches("/_next/static/chunks/a.js")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);
  });
});

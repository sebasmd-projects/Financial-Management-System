import { redirectSystemPath } from "@/app/+native-intent";
import { DEEP_LINK_ROUTES, sanitizeDeepLink } from "./deeplink";

describe("enlaces profundos: lista blanca sin datos", () => {
  it("deja pasar las rutas conocidas", () => {
    for (const route of DEEP_LINK_ROUTES) expect(sanitizeDeepLink(route)).toBe(route);
    expect(sanitizeDeepLink("finanzas://notifications")).toBe("/notifications");
    expect(sanitizeDeepLink("finanzas:///movements/")).toBe("/movements");
  });
  it("descarta los parámetros (un enlace no puede precargar un monto)", () => {
    expect(sanitizeDeepLink("finanzas://quick-add?amount=180000&monto=1&type=expense")).toBe("/quick-add");
    expect(sanitizeDeepLink("/quick-add?amount=180000")).toBe("/quick-add");
    expect(sanitizeDeepLink("/movements?min_amount=5#frag")).toBe("/movements");
    expect(sanitizeDeepLink("finanzas://home?period=2026-11&amount=1")).toBe("/home");
  });
  it("lo desconocido o ajeno va a la raíz", () => {
    expect(sanitizeDeepLink("finanzas://devices")).toBe("/");
    expect(sanitizeDeepLink("/security")).toBe("/");
    expect(sanitizeDeepLink("/movements/123")).toBe("/");
    expect(sanitizeDeepLink("https://evil.example/home")).toBe("/");
    expect(sanitizeDeepLink("intent://home#Intent;scheme=finanzas;end")).toBe("/");
    expect(sanitizeDeepLink("javascript:alert(1)")).toBe("/");
    expect(sanitizeDeepLink("/home/../security")).toBe("/");
    expect(sanitizeDeepLink("")).toBe("/");
    expect(sanitizeDeepLink("x".repeat(5000))).toBe("/");
  });
  it("es lo que Expo Router llama con cada enlace del sistema", () => {
    expect(redirectSystemPath({ path: "finanzas://quick-add?amount=99", initial: true })).toBe("/quick-add");
    expect(redirectSystemPath({ path: "https://x.test/", initial: false })).toBe("/");
  });
});

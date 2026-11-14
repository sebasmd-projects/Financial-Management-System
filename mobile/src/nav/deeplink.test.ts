import { redirectSystemPath } from "@/app/+native-intent";
import { mailHostsFrom } from "@core/sync";
import { DEEP_LINK_ROUTES, sanitizeDeepLink, sanitizeMailLink } from "./deeplink";

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
  it("«Por revisar» se abre por enlace, sin ningún id ni monto", () => {
    expect(sanitizeDeepLink("finanzas://review")).toBe("/review");
    expect(sanitizeDeepLink("finanzas://review?event=0f8b&amount=180000")).toBe("/review");
    expect(sanitizeDeepLink("/review/0f8b")).toBe("/");
  });
  it("«Ir al correo» solo sale hacia HTTPS en un servidor de correo conocido", () => {
    expect(sanitizeMailLink({ provider: "gmail", url: "https://mail.google.com/mail/u/0/#search/rfc822msgid%3Aabc" })).toMatch(/^https:\/\/mail\.google\.com\//);
    expect(sanitizeMailLink({ provider: "outlook", url: "https://outlook.live.com/mail/0/" })).toBe("https://outlook.live.com/mail/0/");
    for (const url of ["javascript:alert(1)", "http://mail.google.com/", "https://mail.google.com.evil.test/", "intent://x#Intent;scheme=https;end", "finanzas://home", "https://user:pw@mail.google.com/", "", null]) expect(sanitizeMailLink({ provider: "gmail", url })).toBeNull();
    expect(sanitizeMailLink(null)).toBeNull();
  });
  it("los hosts los da el servidor (`sync/catalog`) y, si no llegan, la lista incorporada; sigue siendo solo https", () => {
    const hosts = mailHostsFrom({ mail_link_hosts: { gmail: ["mail.google.com"], outlook: ["outlook.live.com", "outlook.office.com"], other: [] } });
    expect(sanitizeMailLink({ provider: "outlook", url: "https://outlook.office.com/mail/" }, hosts)).toBe("https://outlook.office.com/mail/");
    expect(sanitizeMailLink({ provider: "outlook", url: "https://outlook.office.com/mail/" }, mailHostsFrom(undefined))).toBeNull();
    expect(sanitizeMailLink({ provider: "outlook", url: "http://outlook.office.com/mail/" }, hosts)).toBeNull();
    expect(sanitizeMailLink({ provider: "gmail", url: "https://mail.google.com/mail/u/0/" }, mailHostsFrom({ mail_link_hosts: null as never }))).toBe("https://mail.google.com/mail/u/0/");
  });
  it("es lo que Expo Router llama con cada enlace del sistema", () => {
    expect(redirectSystemPath({ path: "finanzas://quick-add?amount=99", initial: true })).toBe("/quick-add");
    expect(redirectSystemPath({ path: "https://x.test/", initial: false })).toBe("/");
  });
});

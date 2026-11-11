// @vitest-environment happy-dom
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { I18nProvider } from "@/i18n/provider";
import { mockFetch } from "@/test/mock-fetch";
import { PrefsPanel } from "./prefs-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PREFS = { quiet_start: "21:00:00", quiet_end: "07:00:00", email_enabled: false, push_enabled: false, show_amounts_outside_app: false, push_available: true, vapid_public_key: "AQID" };
let host: HTMLDivElement;
let root: Root;
const wait = (ms = 20) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

const subscription = { endpoint: "https://push.example/abc", toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "P", auth: "A" } }), unsubscribe: vi.fn(async () => true) };

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  document.cookie = "csrftoken=tok-test";
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

function stubBrowser(permission: "granted" | "denied") {
  const register = vi.fn(async (_url: string, _options: { scope: string }) => ({ pushManager: { getSubscription: async () => null, subscribe: vi.fn(async () => subscription) } }));
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register, ready: Promise.resolve({}), getRegistration: async () => undefined } });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { permission: "default", requestPermission: async () => permission });
  return register;
}

function mount(routes: Record<string, { status: number; json?: unknown }>) {
  const mock = mockFetch({ "GET /api/fms/v1/notification-prefs": { status: 200, json: PREFS }, ...routes });
  vi.stubGlobal("fetch", mock.fetch);
  root = createRoot(host);
  act(() => root.render(<I18nProvider locale="es" dict={es}><PrefsPanel /></I18nProvider>));
  return mock;
}

describe("activar los avisos del navegador", () => {
  it("registra el service worker con el alcance del idioma y manda al servidor solo el endpoint y las claves", async () => {
    const register = stubBrowser("granted");
    const mock = mount({ "POST /api/fms/v1/push-subscription": { status: 201 }, "PATCH /api/fms/v1/notification-prefs": { status: 200, json: { ...PREFS, push_enabled: true } } });
    await wait();
    const toggle = [...host.querySelectorAll<HTMLInputElement>("input[type=checkbox]")].find((c) => c.parentElement?.textContent?.includes("en este navegador"))!;
    await act(async () => toggle.click());
    await wait();
    expect(register).toHaveBeenCalledWith("/_fms/sw.js", { scope: "/es/finanzas/" });
    const post = mock.calls.find((c) => c.url === "/api/fms/v1/push-subscription")!;
    expect(post.body).toEqual({ endpoint: "https://push.example/abc", p256dh: "P", auth: "A" });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(mock.calls.find((c) => c.method === "PATCH")!.body).toEqual({ push_enabled: true });
    expect(host.textContent).toContain("Avisos del navegador activados");
  });

  it("si el navegador niega el permiso, no se manda nada al servidor y se explica", async () => {
    stubBrowser("denied");
    const mock = mount({});
    await wait();
    const toggle = [...host.querySelectorAll<HTMLInputElement>("input[type=checkbox]")].find((c) => c.parentElement?.textContent?.includes("en este navegador"))!;
    await act(async () => toggle.click());
    await wait();
    expect(mock.calls.some((c) => c.method === "POST" || c.method === "PATCH")).toBe(false);
    expect(host.textContent).toContain("bloqueó los avisos");
  });
});

// @vitest-environment happy-dom
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { I18nProvider } from "@/i18n/provider";
import { mockFetch } from "@/test/mock-fetch";
import { NotificationsScreen } from "./notifications-screen";
import { RulesScreen } from "./rules-screen";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas/notificaciones" }));

const N = (id: string, extra: object = {}) => ({ id, rule_key: "fixed_due", severity: "warning", title: `Aviso ${id}`, body: "Arriendo: paga $800.000 antes del 15/11.", object_kind: "occurrence", object_id: "occ-1", due_date: "2026-11-15", visible_at: "2026-11-11T13:00:00Z", is_read: false, group: "today", ...extra });
const LIST = { unread: 2, results: [N("n1"), N("n2", { group: "earlier", is_read: true, object_kind: "", object_id: null })] };
const PREFS = { quiet_start: "21:00:00", quiet_end: "07:00:00", email_enabled: false, push_enabled: false, show_amounts_outside_app: false, push_available: false, vapid_public_key: "" };

let host: HTMLDivElement;
let root: Root;
const wait = (ms = 20) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
function setValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => { setter.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
function mount(ui: React.ReactNode, routes: Record<string, { status: number; json?: unknown }>) {
  const mock = mockFetch(routes);
  vi.stubGlobal("fetch", mock.fetch);
  document.cookie = "csrftoken=tok-test";
  root = createRoot(host);
  act(() => root.render(<I18nProvider locale="es" dict={es}>{ui}</I18nProvider>));
  return mock;
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("notificaciones", () => {
  it("lista agrupada con el contador, sin leer marcadas y «Marcar pagado» que lleva al pago de la ocurrencia", async () => {
    mount(<NotificationsScreen />, { "GET /api/fms/v1/notifications": { status: 200, json: LIST }, "GET /api/fms/v1/notification-prefs": { status: 200, json: PREFS } });
    await wait();
    const text = host.textContent!;
    expect(text).toContain("2 sin leer");
    expect(text).toContain("Hoy");
    expect(text).toContain("Anteriores");
    expect(text).toContain("Aviso n1");
    expect(host.querySelectorAll(".notice--unread")).toHaveLength(1);
    const pay = [...host.querySelectorAll("a")].find((a) => a.textContent?.startsWith("Marcar pagado"));
    expect(pay?.getAttribute("href")).toBe("/es/finanzas/pagos/fijos/occ-1/pagar");
    // 13:00 UTC = 08:00 en Bogotá.
    expect(text).toContain("11/11/2026 08:00");
  });

  it("marcar leído y marcar todo envían Idempotency-Key y recargan la lista", async () => {
    const mock = mount(<NotificationsScreen />, {
      "GET /api/fms/v1/notifications": { status: 200, json: LIST },
      "GET /api/fms/v1/notification-prefs": { status: 200, json: PREFS },
      "POST /api/fms/v1/notifications/read": { status: 200, json: { updated: 1 } },
    });
    await wait();
    const one = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith("Marcar leído"))!;
    await act(async () => one.click());
    await wait();
    const first = mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/notifications/read"))!;
    expect(first.body).toEqual({ ids: ["n1"] });
    expect(first.headers.get("Idempotency-Key")).toBeTruthy();
    const all = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes("Marcar todo como leído"))!;
    await act(async () => all.click());
    await wait();
    const second = mock.calls.filter((c) => c.method === "POST" && c.url.endsWith("/notifications/read"))[1];
    expect(second.body).toEqual({});
    expect(mock.calls.filter((c) => c.method === "GET" && c.url === "/api/fms/v1/notifications").length).toBeGreaterThanOrEqual(3);
  });

  it("posponer llama al endpoint del aviso y lo dice", async () => {
    const mock = mount(<NotificationsScreen />, {
      "GET /api/fms/v1/notifications": { status: 200, json: LIST },
      "GET /api/fms/v1/notification-prefs": { status: 200, json: PREFS },
      "POST /api/fms/v1/notifications/n1/snooze": { status: 200, json: N("n1") },
    });
    await wait();
    const snooze = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith("Posponer"))!;
    await act(async () => snooze.click());
    await wait();
    expect(mock.calls.some((c) => c.method === "POST" && c.url === "/api/fms/v1/notifications/n1/snooze")).toBe(true);
    expect(host.textContent).toContain("Pospuesto");
  });

  it("filtrar por sin leer pide ?unread=true; sin avisos, estado vacío", async () => {
    const mock = mount(<NotificationsScreen />, {
      "GET /api/fms/v1/notifications": { status: 200, json: { unread: 0, results: [] } },
      "GET /api/fms/v1/notifications?unread=true": { status: 200, json: { unread: 0, results: [] } },
      "GET /api/fms/v1/notification-prefs": { status: 200, json: PREFS },
    });
    await wait();
    expect(host.textContent).toContain("Sin notificaciones");
    const radio = [...host.querySelectorAll<HTMLInputElement>("input[type=radio]")].find((r) => r.parentElement?.textContent === "Sin leer")!;
    await act(async () => radio.click());
    await wait();
    expect(mock.calls.some((c) => c.url === "/api/fms/v1/notifications?unread=true")).toBe(true);
    expect(host.textContent).toContain("No tienes avisos sin leer");
  });
});

describe("preferencias de avisos", () => {
  it("sin VAPID en el servidor no hay opción de avisos del navegador", async () => {
    mount(<NotificationsScreen />, { "GET /api/fms/v1/notifications": { status: 200, json: LIST }, "GET /api/fms/v1/notification-prefs": { status: 200, json: PREFS } });
    await wait();
    expect(host.textContent).toContain("Recibir avisos por correo");
    expect(host.textContent).not.toContain("Recibir avisos en este navegador");
  });

  it("con VAPID la opción aparece; en un navegador sin soporte lo dice y todo sigue dentro de la app", async () => {
    mount(<NotificationsScreen />, { "GET /api/fms/v1/notifications": { status: 200, json: LIST }, "GET /api/fms/v1/notification-prefs": { status: 200, json: { ...PREFS, push_available: true, vapid_public_key: "AQID" } } });
    await wait();
    expect(host.textContent).toContain("Recibir avisos en este navegador");
    expect(host.textContent).toContain("no admite avisos push");
  });

  it("guarda horas de silencio y «mostrar montos» (apagado por defecto) con Idempotency-Key; una hora inválida no se envía", async () => {
    const mock = mount(<NotificationsScreen />, {
      "GET /api/fms/v1/notifications": { status: 200, json: LIST },
      "GET /api/fms/v1/notification-prefs": { status: 200, json: PREFS },
      "PATCH /api/fms/v1/notification-prefs": { status: 200, json: { ...PREFS, show_amounts_outside_app: true } },
    });
    await wait();
    const amounts = [...host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].find((c) => c.parentElement?.textContent?.includes("Mostrar montos en el correo"))!;
    expect(amounts.checked).toBe(false);
    act(() => amounts.click());
    const times = host.querySelectorAll<HTMLInputElement>('input[type=time]');
    expect(times[0].value).toBe("21:00");
    setValue(times[0], "22:30");
    const form = [...host.querySelectorAll("form")].find((f) => f.textContent?.includes("Horas de silencio"))!;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await wait();
    const patch = mock.calls.find((c) => c.method === "PATCH")!;
    expect(patch.body).toEqual({ email_enabled: false, show_amounts_outside_app: true, quiet_start: "22:30", quiet_end: "07:00" });
    expect(patch.headers.get("Idempotency-Key")).toBeTruthy();
    expect(host.textContent).toContain("Preferencias guardadas");

    setValue(times[1], "25:00");
    const before = mock.calls.filter((c) => c.method === "PATCH").length;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(mock.calls.filter((c) => c.method === "PATCH").length).toBe(before);
    expect(host.textContent).toContain("Una hora válida");
  });
});

describe("reglas de avisos", () => {
  it("edita días, hora y canales; la app siempre está; envía el cuerpo con las reglas y Idempotency-Key", async () => {
    const rules = [{ key: "card_payment", enabled: true, offsets: [5, 1], send_time: "08:00:00", channels: ["app", "push"] }, { key: "overdue", enabled: true, offsets: [1, 3], send_time: "08:00:00", channels: ["app"] }];
    const mock = mount(<RulesScreen />, { "GET /api/fms/v1/notification-rules": { status: 200, json: rules }, "PATCH /api/fms/v1/notification-rules": { status: 200, json: rules } });
    await wait();
    expect(host.textContent).toContain("Pago de tarjeta");
    expect(host.textContent).toContain("Días de atraso");
    const inputs = host.querySelectorAll<HTMLInputElement>("input.input");
    expect(inputs[0].value).toBe("5, 1");
    setValue(inputs[0], "7, 2");
    const email = host.querySelectorAll<HTMLInputElement>('fieldset fieldset input[type=checkbox]:not(:disabled)')[0];
    act(() => email.click());
    await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await wait();
    const patch = mock.calls.find((c) => c.method === "PATCH")!;
    expect((patch.body as { rules: unknown[] }).rules[0]).toEqual({ key: "card_payment", enabled: true, offsets: [7, 2], send_time: "08:00", channels: ["app", "email", "push"] });
    expect(patch.headers.get("Idempotency-Key")).toBeTruthy();
    expect(host.textContent).toContain("Reglas guardadas");
  });
});

// @vitest-environment happy-dom
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { I18nProvider } from "@/i18n/provider";
import { mockFetch } from "@/test/mock-fetch";
import { RecurrenceForm } from "./recurrence-form";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas" }));

const ACCOUNTS = { count: 1, page: 1, page_size: 100, results: [{ id: "acc-1", name: "Ahorros", kind: "savings", status: "active", posted_balance: "5000000.00" }] };
const EMPTY = { count: 0, page: 1, page_size: 200, results: [] };

let host: HTMLDivElement;
let root: Root;
const wait = (ms = 20) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
function byLabel(text: string): HTMLInputElement | HTMLSelectElement {
  const label = [...host.querySelectorAll("label")].find((l) => l.textContent?.trim().startsWith(text));
  if (!label) throw new Error(`Sin campo «${text}»`);
  return host.querySelector<HTMLInputElement>(`#${CSS.escape(label.htmlFor)}`)!;
}
function check(legend: string, month: string) {
  const fieldset = [...host.querySelectorAll("fieldset")].find((f) => f.querySelector("legend")?.textContent === legend)!;
  const label = [...fieldset.querySelectorAll("label")].find((l) => l.textContent === month)!;
  act(() => label.querySelector("input")!.click());
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  document.cookie = "csrftoken=tok-test";
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("nueva recurrencia con meses, pausas y ventanas de pago", () => {
  it("envía months, skip_months, skip_ranges y las ventanas, con Idempotency-Key y el descuento como porcentaje en puntos", async () => {
    const mock = mockFetch({
      "GET /api/fms/v1/accounts?page_size=100": { status: 200, json: ACCOUNTS },
      "GET /api/fms/v1/categories?page_size=200&archived=false": { status: 200, json: EMPTY },
      "POST /api/fms/v1/recurrences/preview": { status: 200, json: { dates: [] } },
      "POST /api/fms/v1/recurrences": { status: 201, json: { id: "rec-9" } },
    });
    vi.stubGlobal("fetch", mock.fetch);
    root = createRoot(host);
    act(() => root.render(<I18nProvider locale="es" dict={es}><RecurrenceForm /></I18nProvider>));
    await wait();

    setValue(byLabel("Nombre") as HTMLInputElement, "Matrícula");
    setValue(byLabel("Monto esperado") as HTMLInputElement, "2.400.000");
    setValue(byLabel("Frecuencia") as HTMLSelectElement, "annual");
    check("Solo en estos meses (opcional)", "Febrero");
    check("Solo en estos meses (opcional)", "Agosto");
    check("Meses sin ocurrencias cada año", "Diciembre");
    setValue(byLabel("Días antes del vencimiento") as HTMLInputElement, "15");
    setValue(byLabel("Descuento (%)") as HTMLInputElement, "10");
    act(() => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes("Agregar un rango"))!.click());
    const dates = host.querySelectorAll<HTMLInputElement>(".fin-range input[type=date]");
    setValue(dates[0], "2026-12-20");
    setValue(dates[1], "2027-01-10");
    const lateKind = [...host.querySelectorAll<HTMLInputElement>('input[type=radio]')].find((r) => r.parentElement?.textContent === "Interés de mora diario")!;
    act(() => lateKind.click());

    await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await wait();
    const post = mock.calls.find((c) => c.method === "POST" && c.url === "/api/fms/v1/recurrences")!;
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(post.body).toMatchObject({
      name: "Matrícula",
      expected_amount: "2400000",
      frequency: "annual",
      months: [2, 8],
      skip_months: [12],
      skip_ranges: [{ start: "2026-12-20", end: "2027-01-10" }],
      early_days_before: 15,
      early_kind: "percent",
      early_value: "10",
      late_kind: "daily",
      late_rate_key: "LATE_INTEREST_EA",
    });
    expect(post.body).not.toHaveProperty("month");
    expect(host.textContent).toContain("Recurrencia creada");
  });

  it("un rango de pausa al revés avisa y no se envía nada", async () => {
    const mock = mockFetch({
      "GET /api/fms/v1/accounts?page_size=100": { status: 200, json: ACCOUNTS },
      "GET /api/fms/v1/categories?page_size=200&archived=false": { status: 200, json: EMPTY },
      "POST /api/fms/v1/recurrences/preview": { status: 200, json: { dates: [] } },
    });
    vi.stubGlobal("fetch", mock.fetch);
    root = createRoot(host);
    act(() => root.render(<I18nProvider locale="es" dict={es}><RecurrenceForm /></I18nProvider>));
    await wait();
    setValue(byLabel("Nombre") as HTMLInputElement, "Transporte");
    setValue(byLabel("Monto esperado") as HTMLInputElement, "100000");
    act(() => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes("Agregar un rango"))!.click());
    const dates = host.querySelectorAll<HTMLInputElement>(".fin-range input[type=date]");
    setValue(dates[0], "2026-12-20");
    setValue(dates[1], "2026-12-01");
    expect(host.textContent).toContain("no puede ser anterior");
    await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(mock.calls.some((c) => c.method === "POST" && c.url === "/api/fms/v1/recurrences")).toBe(false);
  });
});

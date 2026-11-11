// @vitest-environment happy-dom
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { es } from "@/i18n/dictionaries/es";
import { I18nProvider } from "@/i18n/provider";
import { todayBogota } from "@/lib/dates";
import { mockFetch } from "@/test/mock-fetch";
import { OccurrencePay } from "./occurrence-pay";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas" }));

const today = todayBogota();
const OCCURRENCE = { id: "occ-1", recurrence_id: "rec-1", name: "Predial", kind: "fixed_expense", estimated: false, period: today.slice(0, 7), due_date: today, adjusted_date: today, moved: false, status: "open", overdue: false, expected: "1000000.00", paid: "0.00", pending: "1000000.00", percent: 0, movement_id: null, skip_reason: null, installment: 0, parent_id: null, early_deadline: null, payment_state: "regular", amount_due: "1000000.00" };
const ACCOUNTS = { count: 1, page: 1, page_size: 100, results: [{ id: "acc-1", name: "Ahorros", kind: "savings", status: "active", posted_balance: "5000000.00" }] };

let host: HTMLDivElement;
let root: Root;
const wait = (ms = 20) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
function mount(dict = es, locale: "es" | "en" = "es") {
  root = createRoot(host);
  act(() => root.render(<I18nProvider locale={locale} dict={dict}><OccurrencePay id="occ-1" /></I18nProvider>));
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

describe("pagar una ocurrencia con ventanas de pago", () => {
  it("muestra el estado y el desglose del cálculo del servidor (descuento por pronto pago), sin montos en la URL", async () => {
    const mock = mockFetch({
      "GET /api/fms/v1/occurrences/occ-1": { status: 200, json: { ...OCCURRENCE, payment_state: "early", early_deadline: today, amount_due: "900000.00" } },
      "GET /api/fms/v1/accounts?page_size=100": { status: 200, json: ACCOUNTS },
      [`GET /api/fms/v1/occurrences/occ-1/quote?on=${today}`]: { status: 200, json: { on: today, state: "early", principal: "1000000.00", discount: "100000.00", surcharge: "0.00", total: "900000.00", days_late: 0, early_deadline: today, due: today } },
    });
    vi.stubGlobal("fetch", mock.fetch);
    mount();
    await wait();
    const panel = host.querySelector(".fin-quote")!;
    expect(panel.textContent).toContain("Pronto pago");
    expect(panel.textContent).toContain("Descuento por pronto pago");
    expect(panel.textContent).toContain("−$100.000");
    expect(panel.textContent).toContain("Total a pagar");
    expect(panel.textContent).toContain("$900.000");
    for (const call of mock.calls) expect(call.url).not.toMatch(/900000|1000000/);
  });

  it("un pago tardío muestra el recargo y los días de atraso", async () => {
    const mock = mockFetch({
      "GET /api/fms/v1/occurrences/occ-1": { status: 200, json: { ...OCCURRENCE, overdue: true, payment_state: "late", amount_due: "1030000.00" } },
      "GET /api/fms/v1/accounts?page_size=100": { status: 200, json: ACCOUNTS },
      [`GET /api/fms/v1/occurrences/occ-1/quote?on=${today}`]: { status: 200, json: { on: today, state: "late", principal: "1000000.00", discount: "0.00", surcharge: "30000.00", total: "1030000.00", days_late: 12, early_deadline: null, due: today } },
    });
    vi.stubGlobal("fetch", mock.fetch);
    mount();
    await wait();
    const panel = host.querySelector(".fin-quote")!;
    expect(panel.textContent).toContain("Tardío");
    expect(panel.textContent).toContain("+$30.000");
    expect(panel.textContent).toContain("12 días de atraso");
  });

  it("sin tasa de mora con vigencia: lo dice claro, lleva a Parámetros y no inventa un total (es y en)", async () => {
    for (const [dict, locale, title, linkPart] of [[es, "es", "Falta registrar la tasa de mora", "/es/finanzas/configuracion/parametros?clave=LATE_INTEREST_EA"], [en, "en", "The late-payment rate is missing", "/en/finance/settings/parameters?clave=LATE_INTEREST_EA"]] as const) {
      const mock = mockFetch({
        "GET /api/fms/v1/occurrences/occ-1": { status: 200, json: { ...OCCURRENCE, overdue: true, payment_state: "late", amount_due: null } },
        "GET /api/fms/v1/accounts?page_size=100": { status: 200, json: ACCOUNTS },
        [`GET /api/fms/v1/occurrences/occ-1/quote?on=${today}`]: { status: 422, json: { code: "late_rate_missing" } },
      });
      vi.stubGlobal("fetch", mock.fetch);
      mount(dict, locale);
      await wait();
      expect(host.textContent).toContain(title);
      expect(host.querySelector(`a[href="${linkPart}"]`)).not.toBeNull();
      expect(host.querySelector(".fin-quote")).toBeNull();
      act(() => root.unmount());
    }
    root = createRoot(host);
  });

  it("si el pago responde late_rate_missing, el mismo aviso aparece junto al botón", async () => {
    const mock = mockFetch({
      "GET /api/fms/v1/occurrences/occ-1": { status: 200, json: { ...OCCURRENCE, payment_state: "regular" } },
      "GET /api/fms/v1/accounts?page_size=100": { status: 200, json: ACCOUNTS },
      [`GET /api/fms/v1/occurrences/occ-1/quote?on=${today}`]: { status: 200, json: { on: today, state: "regular", principal: "1000000.00", discount: "0.00", surcharge: "0.00", total: "1000000.00", days_late: 0, early_deadline: null, due: today } },
      "POST /api/fms/v1/occurrences/occ-1/pay": { status: 422, json: { code: "late_rate_missing" } },
    });
    vi.stubGlobal("fetch", mock.fetch);
    mount();
    await wait();
    const form = host.querySelector("form")!;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await wait();
    expect(host.textContent).toContain("Falta registrar la tasa de mora");
    const pay = mock.calls.find((c) => c.method === "POST")!;
    expect(pay.headers.get("Idempotency-Key")).toBeTruthy();
    expect(pay.body).toMatchObject({ mode: "remaining", account_id: "acc-1" });
  });

  it("una obligación dividida dice que se paga por cuotas y ofrece deshacer", async () => {
    const mock = mockFetch({
      "GET /api/fms/v1/occurrences/occ-1": { status: 200, json: { ...OCCURRENCE, status: "split", payment_state: null, amount_due: null } },
      "GET /api/fms/v1/accounts?page_size=100": { status: 200, json: ACCOUNTS },
    });
    vi.stubGlobal("fetch", mock.fetch);
    mount();
    await wait();
    expect(host.textContent).toContain("se dividió en cuotas");
    expect(host.textContent).toContain("Deshacer la división");
    expect(host.querySelector("form")).toBeNull();
  });
});

// @vitest-environment happy-dom
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Card } from "@/api/models";
import { es } from "@/i18n/dictionaries/es";
import { I18nProvider } from "@/i18n/provider";
import { mockFetch } from "@/test/mock-fetch";
import { PurchasePanel } from "./card-purchase";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CARD = { id: "card-1", account_id: "acc-card", name: "Visa", last4: "1234", issuer: null, status: "active", limit: "5000000.00", used: "0.00", available: "5000000.00", utilization_percent: 0, cut_day: 30, pay_day: 16, next_cutoff: "2026-11-30", next_payment_date: "2026-12-16", rate: "0.24", rate_convention: "EA", installment_system: "constant_capital", handling_fee: "0.00", min_payment_rate: "0.05" } as unknown as Card;
const SIMULATION = {
  purchase_value: "1200000.00",
  installments: 6,
  first_payment: "221705.00",
  total_interest: "75969.00",
  total_real_cost: "1275969.00",
  monthly_rate_percent: "1.8088",
  rows: [{ number: 1, billing_cutoff: "2026-11-30", due_date: "2026-12-16", capital: "200000.00", interest: "21705.00", payment: "221705.00" }],
  available_after: "3800000.00",
  exceeds_limit: false,
};

let host: HTMLDivElement;
let root: Root;
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
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

describe("compra a cuotas con tarjeta", () => {
  it("la simulación muestra el costo real GRANDE y el valor de la compra pequeño, con capital e interés en columnas separadas", async () => {
    const mock = mockFetch({
      "GET /api/fms/v1/categories?page_size=200&archived=false&kind=expense": { status: 200, json: { count: 0, page: 1, page_size: 200, results: [] } },
      "GET /api/fms/v1/accounts?page_size=100": { status: 200, json: { count: 0, page: 1, page_size: 100, results: [] } },
      "POST /api/fms/v1/cards/card-1/simulate": { status: 200, json: SIMULATION },
    });
    vi.stubGlobal("fetch", mock.fetch);
    root = createRoot(host);
    act(() => root.render(<I18nProvider locale="es" dict={es}><PurchasePanel card={CARD} /></I18nProvider>));
    const inputs = host.querySelectorAll<HTMLInputElement>("input.input");
    type(inputs[0], "1.200.000");
    type(inputs[1], "6");
    await wait(450);
    const total = host.querySelector(".spent__total")!;
    const purchase = host.querySelector(".spent__purchase")!;
    expect(total.textContent).toContain("$1.275.969");
    expect(purchase.textContent).toContain("$1.200.000");
    expect(host.textContent).toContain("6 cuotas; la primera de");
    expect(host.querySelector("details th")?.textContent).toBeTruthy();
    const sim = mock.calls.find((c) => c.url.endsWith("/simulate"))!;
    expect(sim.body).toMatchObject({ amount: "1200000", installments: 6 });
    expect(sim.url).not.toMatch(/1200000/);
  });
});

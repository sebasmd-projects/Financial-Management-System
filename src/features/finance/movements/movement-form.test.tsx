// @vitest-environment happy-dom
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { es } from "@/i18n/dictionaries/es";
import { I18nProvider } from "@/i18n/provider";
import { mockFetch, type MockReply } from "@/test/mock-fetch";
import { MovementForm } from "./movement-form";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/es/finanzas/movimientos/nuevo",
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ACCOUNT = { id: "a-1", type: "asset", kind: "savings", system_key: "", name: "Ahorros Bancolombia", last4: null, institution: null, parent_id: null, currency: "COP", gmf_exempt: false, liquid: true, enforce_funds: false, status: "active", posted_balance: "3420000.00", projected_balance: "3420000.00" };
const CATEGORY = { id: "c-1", name: "Combustible", kind: "expense", parent_id: null, path: ["Transporte", "Combustible"], account_id: "x", default_nature: "variable", default_classification: "necessary", archived: false };
const RECENT = { id: "m-1", type: "expense", origin: "manual", status: "confirmado", voided: false, date: "2026-11-09", amount: "180000.00", currency: "COP", description: null, notes: null, counterparty: { id: "p-1", name: "Terpel" }, category: { id: "c-1", name: "Combustible", path: ["Transporte", "Combustible"] }, nature: "variable", classification: "necessary", tags: [], cost_center: null, payment_method: null, account: { id: "a-1", name: "Ahorros Bancolombia" }, to_account: null, refund_of_id: null, gmf: null, entry_id: "e", entry_number: 1, attachments: 0, installment_plan: null };
const page = (results: unknown[]) => ({ status: 200, json: { count: results.length, page: 1, page_size: 100, results } });

let host: HTMLDivElement;
let root: Root;

async function settle() {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function mount(routes: Record<string, MockReply>, locale: "es" | "en" = "es") {
  const mock = mockFetch({
    "GET /api/fms/v1/accounts?page_size=100": page([ACCOUNT]),
    "GET /api/fms/v1/categories?page_size=200&archived=false": page([CATEGORY]),
    "GET /api/fms/v1/tags?page_size=200": page([]),
    "GET /api/fms/v1/payment-methods": { status: 200, json: [] },
    "GET /api/fms/v1/movements?page_size=30": page([RECENT]),
    ...routes,
  });
  vi.stubGlobal("fetch", mock.fetch);
  root = createRoot(host);
  act(() => root.render(<I18nProvider locale={locale} dict={locale === "es" ? es : en}><MovementForm /></I18nProvider>));
  return mock;
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const click = (element: Element | null | undefined) => act(() => { (element as HTMLElement).click(); });
const saveButton = () => [...host.querySelectorAll("button")].find((b) => b.type === "submit")!;
const posts = (mock: ReturnType<typeof mockFetch>) => mock.calls.filter((call) => call.method === "POST");

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

describe("alta rápida de movimientos", () => {
  it("«Guardar» está inactivo mientras no haya un monto válido", async () => {
    mount({});
    await settle();
    expect(saveButton().disabled).toBe(true);
    type(host.querySelector<HTMLInputElement>("input.input--amount")!, "0");
    expect(saveButton().disabled).toBe(true);
    type(host.querySelector<HTMLInputElement>("input.input--amount")!, "180.000");
    expect(saveButton().disabled).toBe(false);
    expect(host.textContent).toContain("$180.000");
    expect(host.textContent).toContain("Sale de Ahorros Bancolombia. Quedan $3.240.000.");
  });

  it("2 toques: un reciente rellena todo y «Guardar» envía el movimiento con su Idempotency-Key y sin montos en la URL", async () => {
    const mock = mount({ "POST /api/fms/v1/movements": { status: 201, json: { ...RECENT, id: "m-2" } } });
    await settle();
    const chip = [...host.querySelectorAll("button.chip")].find((b) => b.textContent?.includes("Terpel"));
    expect(chip, "ficha reciente").toBeTruthy();
    click(chip); // toque 1
    click(saveButton()); // toque 2
    await settle();
    const [post] = posts(mock);
    expect(post.body).toMatchObject({ type: "expense", amount: "180000", account_id: "a-1", category_id: "c-1", counterparty: "Terpel", nature: "variable", classification: "necessary", status: "confirmed" });
    expect(post.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(post.headers.get("X-CSRFToken")).toBe("tok-test");
    expect(mock.calls.every((call) => !/amount|180000/.test(call.url))).toBe(true);
    expect(host.textContent).toContain("Movimiento guardado.");
  });

  it("un fallo de red se reintenta con LA MISMA clave; lo siguiente ya es otra intención", async () => {
    let attempt = 0;
    const mock = mount({ "POST /api/fms/v1/movements": () => (++attempt === 1 ? { status: 503, json: { code: "unavailable" } } : { status: 201, json: { ...RECENT, id: `m-${attempt}` } }) });
    await settle();
    type(host.querySelector<HTMLInputElement>("input.input--amount")!, "50000");
    click(saveButton());
    await settle();
    expect(host.textContent).toContain(es.fin.errors.generic);
    click(saveButton());
    await settle();
    expect(host.textContent).toContain("Movimiento guardado.");
    type(host.querySelector<HTMLInputElement>("input.input--amount")!, "60000");
    click(saveButton());
    await settle();
    const keys = posts(mock).map((call) => call.headers.get("Idempotency-Key"));
    expect(keys).toHaveLength(3);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("si la persona cambia el monto tras un fallo, es otra intención y la clave cambia", async () => {
    const mock = mount({ "POST /api/fms/v1/movements": { status: 500, json: {} } });
    await settle();
    const amount = () => host.querySelector<HTMLInputElement>("input.input--amount")!;
    type(amount(), "10000");
    click(saveButton());
    await settle();
    type(amount(), "20000");
    click(saveButton());
    await settle();
    const keys = posts(mock).map((call) => call.headers.get("Idempotency-Key"));
    expect(new Set(keys).size).toBe(2);
  });

  it("más de 2 decimales: se avisa en el campo al escribir y también si el servidor responde too_many_decimals", async () => {
    mount({ "POST /api/fms/v1/movements": { status: 400, json: { code: "too_many_decimals", detail: "amount" } } });
    await settle();
    const amount = () => host.querySelector<HTMLInputElement>("input.input--amount")!;
    type(amount(), "1,2345");
    expect(host.querySelector(".field__error")?.textContent).toBe(es.fin.errors.too_many_decimals);
    expect(saveButton().disabled).toBe(true);
    type(amount(), "12,50");
    expect(host.querySelector(".field__error")).toBeNull();
    click(saveButton());
    await settle();
    expect(host.querySelector(".field__error")?.textContent).toBe(es.fin.errors.too_many_decimals);
    expect(host.querySelectorAll('[role="alert"]')).toHaveLength(0);
  });

  it("en inglés el formulario y sus mensajes salen en inglés", async () => {
    mount({}, "en");
    await settle();
    expect(host.textContent).toContain("New transaction");
    expect(host.textContent).toContain("Recent: tap one and save");
  });

  it("no escribe nada en el almacenamiento del navegador", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const mock = mount({ "POST /api/fms/v1/movements": { status: 201, json: { ...RECENT, id: "m-9" } } });
    await settle();
    type(host.querySelector<HTMLInputElement>("input.input--amount")!, "12345");
    click(saveButton());
    await settle();
    expect(posts(mock)).toHaveLength(1);
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

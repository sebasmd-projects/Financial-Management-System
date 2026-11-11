// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { MovementForm } from "../movements/movement-form";
import { CurrenciesScreen } from "./currencies-screen";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/es/finanzas/configuracion/monedas",
}));

const page = (results: unknown[]) => ({ status: 200, json: { count: results.length, page: 1, page_size: 100, results } });
const USD = { code: "USD", decimals: 2, latest_rate: { rate: "3912.4", on: "2026-11-10", source: "TRM del Banco de la República" } };
const EUR = { code: "EUR", decimals: 2, latest_rate: null };
const RATE = { id: "r-1", currency: "USD", on: "2026-11-10", rate: "3912.4", source: "TRM del Banco de la República" };
const ACCOUNT = { id: "a-1", type: "asset", kind: "savings", system_key: "", name: "Ahorros", last4: null, institution: null, parent_id: null, currency: "COP", gmf_exempt: false, liquid: true, enforce_funds: false, status: "active", posted_balance: "3420000.00", projected_balance: "3420000.00" };

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
});

describe("monedas y tasas (config)", () => {
  const routes = {
    "GET /api/fms/v1/currencies": { status: 200, json: [USD, EUR] },
    "GET /api/fms/v1/exchange-rates?page_size=100&currency=USD": page([RATE]),
    "GET /api/fms/v1/exchange-rates?page_size=100&currency=EUR": page([]),
  };

  it("lista las tasas con fecha y fuente, y un estado vacío honesto para la moneda sin tasas", async () => {
    view = await mountScreen(<CurrenciesScreen />, routes);
    expect(view.visible()).toContain("1 USD = $3.912,4");
    expect(view.visible()).toContain("10/11/2026");
    expect(view.visible()).toContain("TRM del Banco de la República");
    click(byText(view.host, "label", "EUR").querySelector("input"));
    await wait();
    expect(view.visible()).toContain("Aún no hay tasas de EUR");
    expect(view.visible()).toContain("Sin tasa registrada");
  });

  it("agregar una tasa exige la fuente, repite la lectura de la tasa y manda Idempotency-Key", async () => {
    view = await mountScreen(<CurrenciesScreen />, { ...routes, "POST /api/fms/v1/exchange-rates": { status: 201, json: RATE } });
    click(byText(view.host, "button", "Agregar tasa"));
    await wait();
    const inputs = view.host.querySelectorAll<HTMLInputElement>("dialog input");
    typeInto(inputs[1], "3.915,5");
    expect(view.visible()).toContain("1 USD = $3.915,5");
    click(byText(view.host, "dialog button", "Guardar tasa"));
    await wait();
    expect(view.mock.calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(view.visible()).toContain("La fuente es obligatoria");
    typeInto(inputs[2], "Casa de cambio");
    click(byText(view.host, "dialog button", "Guardar tasa"));
    await wait();
    const [post] = view.mock.calls.filter((c) => c.method === "POST");
    expect(post.body).toMatchObject({ currency: "USD", rate: "3915.5", source: "Casa de cambio" });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(post.url).not.toMatch(/3915/);
  });

  it("borrar pide confirmación y avisa que el histórico no cambia", async () => {
    view = await mountScreen(<CurrenciesScreen />, { ...routes, "DELETE /api/fms/v1/exchange-rates/r-1": { status: 204 } });
    click(byText(view.host, "button", "Borrar"));
    await wait();
    expect(view.visible()).toContain("conservan su propia copia");
    click(byText(view.host, "dialog button", "Borrar tasa"));
    await wait();
    expect(view.mock.calls.some((c) => c.method === "DELETE" && c.url.endsWith("/exchange-rates/r-1"))).toBe(true);
  });

  it("el consolidado separa lo asentado de la tasa más reciente y no inventa lo que falta", async () => {
    const today = new Date();
    view = await mountScreen(<CurrenciesScreen />, {
      ...routes,
      [`GET /api/fms/v1/currencies/consolidation?from=${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(today).slice(0, 8)}01&to=${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(today)}`]: {
        status: 200,
        json: {
          base: "COP",
          spent_booked_total: "11698.08",
          income_booked_total: "0.00",
          rows: [{ currency: "USD", count: 1, spent_original: "2.99", spent_booked: "11698.08", income_original: "0", income_booked: "0.00", latest_rate: { rate: "4000", on: "2026-11-20", source: "TRM" }, spent_at_latest_rate: "11960.00", income_at_latest_rate: "0.00", spent_difference: "261.92" }],
        },
      },
    });
    click(byText(view.host, "[role=tab]", "Consolidado"));
    await wait();
    const text = view.visible();
    expect(text).toContain("USD 2,99");
    expect(text).toContain("$11.698,08");
    expect(text).toContain("$11.960");
    expect(text).toContain("Diferencia frente a lo asentado");
  });
});

describe("cobro en otra moneda en el movimiento", () => {
  const base = {
    "GET /api/fms/v1/accounts?page_size=100": page([ACCOUNT]),
    "GET /api/fms/v1/categories?page_size=200&archived=false": page([]),
    "GET /api/fms/v1/tags?page_size=200": page([]),
    "GET /api/fms/v1/payment-methods": { status: 200, json: [] },
    "GET /api/fms/v1/movements?page_size=30": page([]),
    "GET /api/fms/v1/currencies": { status: 200, json: [USD] },
  };
  const save = () => [...document.querySelectorAll("button")].find((b) => b.type === "submit")!;

  it("US$2,99 con la tasa registrada: vista previa en pesos y se envía el original sin `amount`", async () => {
    view = await mountScreen(<MovementForm />, {
      ...base,
      "GET /api/fms/v1/exchange-rates?page_size=100&currency=USD": page([RATE]),
      "POST /api/fms/v1/movements": { status: 201, json: { id: "m-9", status: "confirmado", warnings: [] } },
    });
    click(byText(view.host, "label", "Cobro en otra moneda").querySelector("input"));
    await wait();
    typeInto(view.host.querySelector<HTMLInputElement>("[data-testid=foreign-fields] input[type=text]")!, "2,99");
    await wait();
    const preview = view.host.querySelector("[data-testid=fx-preview]")!.textContent!;
    expect(preview).toContain("USD 2,99");
    expect(preview).toContain("$3.912,4");
    expect(preview).toContain("$11.698,08");
    click(save());
    await wait();
    const [post] = view.mock.calls.filter((c) => c.method === "POST");
    expect(post.body).toMatchObject({ type: "expense", original_amount: "2.99", original_currency: "USD" });
    expect(post.body).not.toHaveProperty("amount");
    expect(post.body).not.toHaveProperty("fx_rate");
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(post.url).not.toMatch(/2\.99|11698/);
  });

  it("sin tasa registrada avisa, manda a Monedas y no deja guardar; con tasa propia exige la fuente", async () => {
    view = await mountScreen(<MovementForm />, { ...base, "GET /api/fms/v1/exchange-rates?page_size=100&currency=USD": page([]) });
    click(byText(view.host, "label", "Cobro en otra moneda").querySelector("input"));
    await wait();
    typeInto(view.host.querySelector<HTMLInputElement>("[data-testid=foreign-fields] input[type=text]")!, "2,99");
    await wait();
    expect(view.host.querySelector("[data-testid=fx-rate-missing]")!.textContent).toContain("No hay una tasa de USD registrada");
    expect(save().disabled).toBe(true);
    click(byText(view.host, "label", "Usar otra tasa").querySelector("input"));
    await wait();
    const inputs = view.host.querySelectorAll<HTMLInputElement>("[data-testid=foreign-fields] input[type=text]");
    typeInto(inputs[1], "4.100");
    await wait();
    expect(save().disabled).toBe(true);
    typeInto(view.host.querySelectorAll<HTMLInputElement>("[data-testid=foreign-fields] input[type=text]")[2], "Recibo del cajero");
    await wait();
    expect(save().disabled).toBe(false);
  });
});

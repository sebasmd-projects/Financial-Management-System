// @vitest-environment happy-dom
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { I18nProvider } from "@/i18n/provider";
import { mockFetch } from "@/test/mock-fetch";
import { ParametersScreen } from "./parameters-screen";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let query = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(query), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas/configuracion/parametros" }));

const CATALOG = [
  { key: "USURY_RATE_EA", label: "Tasa de usura (consumo y ordinario, E.A.)", unit: "fraction", description: "Aviso si una tasa registrada la supera en su fecha.", seeded: false, scope: "global", value: "0.2345", valid_from: "2026-11-01", valid_to: "2026-11-30", source: "Resolución SFC 1234", gap_from: "2026-12-01" },
  { key: "LATE_INTEREST_EA", label: "Tasa de mora (E.A.)", unit: "fraction", description: "Interés de mora de una obligación con pago extemporáneo.", seeded: false, scope: "global", value: null, valid_from: null, valid_to: null, source: null, gap_from: null },
  { key: "UVT_VALUE", label: "UVT (valor en pesos)", unit: "amount", description: "Unidad de Valor Tributario del año.", seeded: true, scope: "user", value: "49799.00", valid_from: "2026-01-01", valid_to: null, source: "Resolución DIAN", gap_from: null },
];

let host: HTMLDivElement;
let root: Root;
const wait = (ms = 20) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
function visible(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll(".visually-hidden").forEach((n) => n.remove());
  return copy.textContent ?? "";
}
function setField(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  act(() => { setter.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
function mount(routes: Record<string, { status: number; json?: unknown }>) {
  const mock = mockFetch({ "GET /api/fms/v1/parameters/catalog": { status: 200, json: CATALOG }, ...routes });
  vi.stubGlobal("fetch", mock.fetch);
  document.cookie = "csrftoken=tok-test";
  root = createRoot(host);
  act(() => root.render(<I18nProvider locale="es" dict={es}><ParametersScreen /></I18nProvider>));
  return mock;
}

beforeEach(() => {
  query = "";
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("parámetros Colombia", () => {
  it("el catálogo muestra el valor vigente con su vigencia y fuente, el hueco «Sin valor vigente desde» y la falta de valor", async () => {
    mount({});
    await wait();
    const text = visible(host);
    expect(text).toContain("23,45 %");
    expect(text).toContain("desde 01/11/2026");
    expect(text).toContain("hasta 30/11/2026");
    expect(text).toContain("Fuente: Resolución SFC 1234");
    expect(text).toContain("Sin valor vigente desde 01/12/2026");
    expect(text).toContain("Sin valor vigente");
    expect(text).toContain("$49.799");
    expect(text).toContain("sin fecha final");
    expect(text).toContain("Tuyo");
  });

  it("agregar un valor propio exige la fuente, manda la fracción y Idempotency-Key, y recarga", async () => {
    const mock = mount({
      "GET /api/fms/v1/parameters?key=LATE_INTEREST_EA": { status: 200, json: [] },
      "GET /api/fms/v1/user-parameters?key=LATE_INTEREST_EA": { status: 200, json: [] },
      "POST /api/fms/v1/user-parameters": { status: 201, json: { id: "u1" } },
    });
    await wait();
    const row = [...host.querySelectorAll<HTMLButtonElement>("button.params__row")].find((b) => b.textContent?.includes("Tasa de mora"))!;
    await act(async () => row.click());
    await wait();
    expect(host.textContent).toContain("Aún no registras valores propios");
    expect(host.textContent).toContain("No hay valores oficiales");
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Agregar vigencia")!.click());
    const form = host.querySelector<HTMLFormElement>("dialog form")!;
    const inputs = form.querySelectorAll<HTMLInputElement>("input.input");
    setField(inputs[0], "27,5");
    // Sin fuente: no se envía y se pide.
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(mock.calls.some((c) => c.method === "POST")).toBe(false);
    expect(host.textContent).toContain("Escribe la fuente del valor");
    setField(form.querySelector("textarea")!, "Superfinanciera, certificado de noviembre");
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await wait();
    const post = mock.calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ key: "LATE_INTEREST_EA", value: "0.275", source: "Superfinanciera, certificado de noviembre" });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    for (const c of mock.calls) expect(c.url).not.toMatch(/0\.275|27/);
    expect(host.textContent).toContain("Valor registrado");
  });

  it("?clave=LATE_INTEREST_EA abre ese parámetro y explica para qué", async () => {
    query = "clave=LATE_INTEREST_EA";
    mount({ "GET /api/fms/v1/parameters?key=LATE_INTEREST_EA": { status: 200, json: [] }, "GET /api/fms/v1/user-parameters?key=LATE_INTEREST_EA": { status: 200, json: [] } });
    await wait();
    expect(host.textContent).toContain("Para registrar la tasa de mora");
    expect(host.querySelector("dialog")?.textContent).toContain("Valores de Tasa de mora");
  });

  it("un valor propio ya vigente se cierra (no se borra); uno futuro se borra", async () => {
    const mine = [
      { id: "u1", key: "UVT_VALUE", value: "49799.00", valid_from: "2026-01-01", valid_to: null, source: "Resolución DIAN" },
      { id: "u2", key: "UVT_VALUE", value: "52000.00", valid_from: "2999-01-01", valid_to: null, source: "Proyección" },
    ];
    const mock = mount({
      "GET /api/fms/v1/parameters?key=UVT_VALUE": { status: 200, json: [{ key: "UVT_VALUE", value: "47065.00", valid_from: "2025-01-01", valid_to: "2025-12-31", source: "DIAN 2025" }] },
      "GET /api/fms/v1/user-parameters?key=UVT_VALUE": { status: 200, json: mine },
      "DELETE /api/fms/v1/user-parameters/u2": { status: 204 },
    });
    await wait();
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button.params__row")].find((b) => b.textContent?.includes("UVT"))!.click());
    await wait();
    const dialog = host.querySelector("dialog")!;
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button")].map((b) => b.textContent);
    expect(buttons.filter((b) => b === "Cerrar vigencia")).toHaveLength(1);
    expect(buttons.filter((b) => b === "Borrar")).toHaveLength(1);
    expect(visible(dialog)).toContain("DIAN 2025");
    await act(async () => [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Borrar")!.click());
    await wait();
    expect(mock.calls.some((c) => c.method === "DELETE" && c.url.endsWith("/user-parameters/u2"))).toBe(true);
    expect(host.textContent).toContain("Valor borrado");
  });

  it("el servidor rechaza un cruce de vigencias y se dice en español", async () => {
    mount({
      "GET /api/fms/v1/parameters?key=UVT_VALUE": { status: 200, json: [] },
      "GET /api/fms/v1/user-parameters?key=UVT_VALUE": { status: 200, json: [] },
      "POST /api/fms/v1/user-parameters": { status: 422, json: { code: "overlapping_validity" } },
    });
    await wait();
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button.params__row")].find((b) => b.textContent?.includes("UVT"))!.click());
    await wait();
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Agregar vigencia")!.click());
    const form = host.querySelector<HTMLFormElement>("dialog form")!;
    setField(form.querySelectorAll<HTMLInputElement>("input.input")[0], "52.000");
    setField(form.querySelector("textarea")!, "DIAN");
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await wait();
    expect(host.textContent).toContain("se cruza con otro valor del mismo parámetro");
  });
});

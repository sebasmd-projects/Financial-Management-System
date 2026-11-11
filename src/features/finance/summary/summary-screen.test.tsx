// @vitest-environment happy-dom
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { I18nProvider } from "@/i18n/provider";
import { periodOf, shiftPeriod, todayBogota } from "@/lib/dates";
import { mockFetch } from "@/test/mock-fetch";
import { peekDraft } from "../draft-store";
import { SummaryScreen } from "./summary-screen";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas" }));

const today = todayBogota();
const DASH = {
  period: periodOf(today),
  is_current: true,
  today,
  kpi: { remaining: "1840000.00", spent: "2310000.00", income: "5200000.00", committed: "1050000.00", loan_capital_paid: "0.00", goal_contributions: "0.00", available_today: "3420000.00", owed: "2170000.00", overdue_total: "450000.00" },
  bar: { spent: "2310000.00", committed: "1050000.00", free: "1840000.00" },
  liquidity: { horizons: [{ days: 15, balance: "2000000.00" }, { days: 30, balance: "1250000.00" }, { days: 60, balance: "-100000.00" }, { days: 90, balance: "-900000.00" }], first_negative_date: "2027-01-20", missing: "900000.00" },
  rail: [{ kind: "card_payment", name: "Visa Bancolombia", amount: "850000.00", date: today, days_left: 0, state: "today", ref_kind: "card", ref_id: "card-1" }],
  fixed_expenses: { paid_count: 1, total_count: 2, paid: "450000.00", total: "1250000.00", percent: 36, more: 0, items: [
    { occurrence_id: "occ-1", name: "Arriendo", status: "overdue", due_date: today, expected: "800000.00", paid: "0.00", pending: "800000.00", percent: 0, days_left: -5, estimated: false },
    { occurrence_id: "occ-2", name: "Internet", status: "paid", due_date: today, expected: "450000.00", paid: "450000.00", pending: "0.00", percent: 100, days_left: 0, estimated: false },
  ] },
  shortcuts: [{ name: "Gasolina", amount: "180000.00", category_id: "cat-1" }],
  alerts: [
    { kind: "overdue", severity: "critical", name: "Arriendo", amount: "800000.00", date: today, ref_kind: "occurrence", ref_id: "occ-1" },
    { kind: "due_today", severity: "warning", name: "Visa Bancolombia", amount: "850000.00", date: today, ref_kind: "card", ref_id: "card-1" },
  ],
  all_clear_days: null,
};

let host: HTMLDivElement;
let root: Root;
const wait = (ms = 20) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
function mount(dash: unknown, extra: Record<string, { status: number; json?: unknown }> = {}) {
  const mock = mockFetch({ "GET /api/fms/v1/dashboard": { status: 200, json: dash }, ...extra });
  vi.stubGlobal("fetch", mock.fetch);
  root = createRoot(host);
  act(() => root.render(<I18nProvider locale="es" dict={es}><SummaryScreen /></I18nProvider>));
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

describe("Resumen", () => {
  it("pinta «Te queda», gastado, liquidez, riel, gastos fijos y la alerta más urgente, con los datos de la API", async () => {
    mount(DASH);
    await wait();
    const text = host.textContent!;
    expect(text).toContain("Te queda este mes");
    expect(text).toContain("$1.840.000");
    expect(text).toContain("$2.310.000");
    expect(text).toContain("Disponible hoy");
    expect(text).toContain("$3.420.000");
    expect(text).toContain("en 30 días");
    expect(text).toContain("$1.250.000");
    expect(host.querySelector('a[href="/es/finanzas/tarjetas/card-1"]')?.textContent).toContain("Visa Bancolombia");
    expect(text).toContain("Gastos fijos · 1 de 2 pagados");
    expect(host.querySelector('a[href="/es/finanzas/pagos/fijos/occ-1/pagar"]')?.textContent).toContain("Arriendo");
    expect(host.querySelector(".summary__alert")?.textContent).toContain("Arriendo venció el");
    expect(host.querySelector(".summary__alert")?.textContent).toContain("1 de 2");
    expect(host.querySelector(".summary__bar")?.getAttribute("aria-label")).toBe("Del total de ingresos: gastado 44 %, comprometido 20 %, libre 35 %");
  });

  it("«Te queda» negativo va con icono de alerta y sin inventar nada", async () => {
    mount({ ...DASH, kpi: { ...DASH.kpi, remaining: "-120000.00" } });
    await wait();
    expect(host.querySelector(".summary__big--negative")?.textContent).toContain("−$120.000");
    expect(host.querySelector(".summary__big--negative svg")).not.toBeNull();
  });

  it("ocultar montos sustituye todas las cifras por •••••, y volver a mostrarlas las restituye", async () => {
    mount(DASH);
    await wait();
    const eye = host.querySelector<HTMLButtonElement>('button[aria-pressed]')!;
    act(() => eye.click());
    const visible = [...host.querySelectorAll(".money > [aria-hidden=true]")].map((n) => n.textContent);
    expect(visible.length).toBeGreaterThan(5);
    expect(visible.every((v) => v === "•••••")).toBe(true);
    expect(host.textContent).not.toContain("$1.840.000");
    act(() => eye.click());
    expect(host.textContent).toContain("$1.840.000");
  });

  it("la hoja de liquidez muestra los cuatro horizontes y el primer día en negativo", async () => {
    mount(DASH);
    await wait();
    act(() => host.querySelector<HTMLButtonElement>(".summary__liquidity")!.click());
    const sheet = [...host.querySelectorAll("dialog")].find((d) => d.textContent?.includes("Liquidez a 15"))!;
    for (const days of ["15 días", "30 días", "60 días", "90 días"]) expect(sheet.textContent).toContain(days);
    expect(sheet.textContent).toContain("baja de cero el");
    expect(sheet.textContent).toContain("$900.000");
  });

  it("un atajo deja el borrador del movimiento en memoria (nunca en la URL)", async () => {
    mount(DASH);
    await wait();
    const chip = [...host.querySelectorAll<HTMLAnchorElement>("a.chip")].find((a) => a.textContent?.includes("Gasolina"))!;
    expect(chip.getAttribute("href")).toBe("/es/finanzas/movimientos/nuevo");
    act(() => chip.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    expect(peekDraft()).toMatchObject({ amount: "180000.00", categoryId: "cat-1", description: "Gasolina" });
  });

  it("primer uso: estados vacíos con una acción, sin datos inventados y sin alerta falsa", async () => {
    mount({ ...DASH, kpi: { ...DASH.kpi, remaining: "0", spent: "0", income: "0", committed: "0", available_today: "0", owed: "0", overdue_total: "0" }, bar: { spent: "0", committed: "0", free: "0" }, rail: [], shortcuts: [], alerts: [], all_clear_days: null, liquidity: { horizons: [], first_negative_date: null, missing: null }, fixed_expenses: { paid_count: 0, total_count: 0, paid: "0", total: "0", percent: 0, more: 0, items: [] } });
    await wait();
    const text = host.textContent!;
    expect(text).toContain("Registra un ingreso para empezar");
    expect(text).toContain("Agrega tu primer gasto fijo");
    expect(text).toContain("Tu resumen está vacío");
    expect(text).toContain("Todo al día");
    expect(text).toContain("Gasolina");
  });

  it("un periodo pasado pide ese periodo a la API y atenúa lo del presente", async () => {
    const mock = mockFetch({ "GET /api/fms/v1/dashboard": { status: 200, json: DASH }, [`GET /api/fms/v1/dashboard?period=${shiftPeriod(periodOf(today), -1)}`]: { status: 200, json: { ...DASH, is_current: false } } });
    vi.stubGlobal("fetch", mock.fetch);
    root = createRoot(host);
    act(() => root.render(<I18nProvider locale="es" dict={es}><SummaryScreen /></I18nProvider>));
    await wait();
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Mes anterior"]')!.click());
    await wait();
    expect(mock.calls.some((c) => c.url.endsWith(`period=${shiftPeriod(periodOf(today), -1)}`))).toBe(true);
    expect(host.textContent).toContain("Volver a hoy");
    expect(host.querySelectorAll(".summary__dim").length).toBeGreaterThan(0);
    expect(host.textContent).toContain("Te quedó en el periodo");
  });

  it("una cuota en UVR sin UVR vigente: el riel y la alerta dicen «monto por definir», nunca $0, y el aviso lleva a registrar la UVR", async () => {
    mount({
      ...DASH,
      rail: [{ kind: "loan_installment", name: "Hipoteca UVR", amount: null, index_missing: true, date: today, days_left: 0, state: "today", ref_kind: "loan", ref_id: "loan-uvr" }],
      alerts: [{ kind: "due_today", severity: "warning", name: "Hipoteca UVR", amount: null, index_missing: true, date: today, ref_kind: "loan", ref_id: "loan-uvr" }],
      notices: [{ code: "index_missing", key: "UVR_VALUE" }],
    });
    await wait();
    expect(host.querySelector(".summary__rail-amount")?.textContent).toBe("monto por definir (falta la UVR)");
    expect(host.querySelector(".summary__alert")?.textContent).toContain("monto por definir (falta la UVR)");
    expect(host.querySelector(".summary__rail-amount")?.textContent).not.toContain("$0");
    expect(host.querySelector('a[href="/es/finanzas/configuracion/parametros?clave=UVR_VALUE"]')?.textContent).toBe("Registrar el valor de la UVR");
  });

  it("si la API falla, lo dice con «Reintentar»", async () => {
    mockFetchFail();
    await wait();
    expect(host.textContent).toContain("No pudimos cargar el resumen");
    expect(host.textContent).toContain("Reintentar");
  });
});

function mockFetchFail() {
  const mock = mockFetch({ "GET /api/fms/v1/dashboard": { status: 500, json: { code: "server_error" } } });
  vi.stubGlobal("fetch", mock.fetch);
  root = createRoot(host);
  act(() => root.render(<I18nProvider locale="es" dict={es}><SummaryScreen /></I18nProvider>));
}

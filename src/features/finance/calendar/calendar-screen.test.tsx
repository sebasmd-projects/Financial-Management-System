// @vitest-environment happy-dom
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { I18nProvider } from "@/i18n/provider";
import { addDays, periodOf, todayBogota } from "@/lib/dates";
import { mockFetch } from "@/test/mock-fetch";
import { CalendarScreen } from "./calendar-screen";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let query = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(query), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas/pagos/calendario" }));

const today = todayBogota();
const first = `${periodOf(today)}-01`;
const day = (date: string, extra: object = {}) => ({ date, holiday: null, items: [], needed: "0", expected_income: "0", balance_before: null, balance_after: null, negative: false, ...extra });
const ITEM = { date: today, original_date: addDays(today, -2), moved_reason: "holiday", kind: "fixed_expense", name: "Administración", amount: "250000.00", direction: "out", ref_kind: "occurrence", ref_id: "occ-1", account_id: "acc-1", overdue: false, estimated: false, balance_after: "1650000.00", shortfall: null };
const SHORT = { ...ITEM, name: "Seguro del carro", amount: "180000.00", ref_id: "occ-2", account_id: "acc-2", balance_after: "-80000.00", shortfall: "80000.00" };
const CAL = {
  mode: "month",
  start: first,
  end: addDays(first, 27),
  days: [day(today, { items: [ITEM, SHORT], needed: "430000.00", balance_before: "1900000.00", balance_after: "1350000.00" }), day(addDays(first, 1), { holiday: "Año Nuevo" })],
  overdue: { items: [{ date: addDays(today, -5), name: "Arriendo", amount: "800000.00", kind: "fixed_expense", ref_kind: "occurrence", ref_id: "occ-9", days_late: 5 }], total: "800000.00" },
};
const ACCOUNTS = { count: 2, page: 1, page_size: 100, results: [{ id: "acc-1", name: "Ahorros", kind: "savings", status: "active" }, { id: "acc-2", name: "Nequi", kind: "wallet", status: "active" }] };

/** Lo que se ve: sin el texto solo para lectores de pantalla (que repite cada monto en palabras). */
function visible(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll(".visually-hidden").forEach((n) => n.remove());
  return copy.textContent ?? "";
}

let host: HTMLDivElement;
let root: Root;
const wait = (ms = 20) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
function mount(routes: Record<string, { status: number; json?: unknown }>) {
  const mock = mockFetch({ "GET /api/fms/v1/accounts?page_size=100": { status: 200, json: ACCOUNTS }, ...routes });
  vi.stubGlobal("fetch", mock.fetch);
  root = createRoot(host);
  act(() => root.render(<I18nProvider locale="es" dict={es}><CalendarScreen /></I18nProvider>));
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

describe("calendario financiero", () => {
  it("el mes: festivo marcado «F», puntos por compromiso y el día de hoy con «Necesitas … disponibles» y el saldo antes y después", async () => {
    const mock = mount({ [`GET /api/fms/v1/calendar?view=month&date=${today}`]: { status: 200, json: CAL } });
    await wait();
    const text = visible(host);
    expect(text).toContain("Necesitas $430.000 disponibles");
    expect(text).toContain("Saldo proyectado: $1.900.000 → $1.350.000");
    expect(text).toContain("Movido del");
    expect(text).toContain("(festivo)");
    expect(host.querySelectorAll(".calendar__dot").length).toBeGreaterThanOrEqual(2);
    expect(host.querySelector(".calendar__holiday")?.textContent).toContain("F");
    expect(host.querySelector('button[aria-label*="Año Nuevo"]')).not.toBeNull();
    for (const call of mock.calls) expect(call.url).not.toMatch(/250000|430000/);
  });

  it("el primer compromiso que deja una cuenta en negativo dice cuánto falta, en qué cuenta y ofrece transferir", async () => {
    mount({ [`GET /api/fms/v1/calendar?view=month&date=${today}`]: { status: 200, json: CAL } });
    await wait();
    const alert = host.querySelector(".calendar__shortfall")!;
    expect(visible(alert)).toContain("No alcanza: faltan $80.000");
    expect(alert.textContent).toContain("Nequi");
    expect(alert.querySelector("a")?.getAttribute("href")).toBe("/es/finanzas/movimientos/nuevo?tipo=transferencia&hasta=acc-2");
    const pay = [...host.querySelectorAll("a")].find((a) => a.textContent?.startsWith("Pagar") && a.getAttribute("href")?.includes("occ-1"));
    expect(pay?.getAttribute("href")).toBe("/es/finanzas/pagos/fijos/occ-1/pagar");
  });

  it("?rango=30 abre el rango de 30 días y pide solo ese rango", async () => {
    query = "rango=30";
    const mock = mount({ "GET /api/fms/v1/calendar?range=30": { status: 200, json: { ...CAL, mode: "range", days: [day(today, { items: [ITEM], needed: "250000.00" })] } } });
    await wait();
    expect(mock.calls.some((c) => c.url === "/api/fms/v1/calendar?range=30")).toBe(true);
    expect(host.querySelector('input[type=radio]:checked')?.parentElement?.textContent).toBe("Próximos 30");
    expect(host.querySelector(".calendar__grid")).toBeNull();
    expect(host.textContent).toContain("Administración");
  });

  it("vencidos: lista con el total adeudado y días de atraso; con el contador en la pestaña", async () => {
    query = "rango=vencidos";
    mount({ [`GET /api/fms/v1/calendar?view=month&date=${today}`]: { status: 200, json: CAL } });
    await wait();
    expect(visible(host)).toContain("Total adeudado: $800.000");
    expect(host.textContent).toContain("5 días de atraso");
    expect(host.textContent).toContain("Vencidos (1)");
  });

  it("sin compromisos: estado vacío, nunca datos inventados", async () => {
    query = "rango=7";
    mount({ "GET /api/fms/v1/calendar?range=7": { status: 200, json: { ...CAL, days: [day(today)], overdue: { items: [], total: "0" } } } });
    await wait();
    expect(host.textContent).toContain("Sin compromisos en este rango");
  });

  it("error de la API: mensaje con «Reintentar»", async () => {
    mount({ [`GET /api/fms/v1/calendar?view=month&date=${today}`]: { status: 500, json: { code: "x" } } });
    await wait();
    expect(host.textContent).toContain("No pudimos cargar el calendario");
  });
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { CompareScreen } from "./compare-screen";
import { IndependenceScreen } from "./independence-screen";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/es/finanzas/informes/proyecciones/comparar",
}));

const page = (results: unknown[]) => ({ status: 200, json: { count: results.length, page: 1, page_size: 100, results } });
const NETFLIX = { id: "rec-1", kind: "subscription", name: "Netflix", expected_amount: "44900.00", status: "active", next_dates: [] };
const SCENARIO = { id: "s1", name: "Cancelar Netflix", description: null, adjustments: [{ kind: "cancel_recurrence", recurrence_id: "rec-1", start: "2026-12-01" }], created_at: "2026-11-10T13:00:00Z" };
const month = (i: number) => `2026-${String(11 + i).padStart(2, "0")}-01`;
const points = (base: number, step: number) => Array.from({ length: 2 }, (_, i) => ({ month: month(i), state: i === 0 ? "current" : "projected", closing: `${base + step * i}.00` }));
const COMPARE = {
  as_of: "2026-11-11",
  horizon_months: 12,
  until: "2027-10-31",
  columns: [
    { key: "today", name: "Hoy", closing_balance: "4000000.00", interest_paid: "1200000.00", debt_end_date: "2028-05-15", net_worth: "30000000.00", diff: null, monthly: points(3000000, 100000) },
    { key: "s1", name: "Cancelar Netflix", closing_balance: "4538800.00", interest_paid: "1200000.00", debt_end_date: "2028-05-15", net_worth: "30538800.00", diff: { closing_balance: "538800.00", interest_paid: "0.00", net_worth: "538800.00", debt_end_days: 0 }, monthly: points(3000000, 144900) },
  ],
  warnings: [],
  notes: ["Proyección sobre el escenario base."],
};

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
});

describe("comparador de escenarios (corte 3.2)", () => {
  const routes = {
    "GET /api/fms/v1/scenarios?page_size=100": page([SCENARIO]),
    "GET /api/fms/v1/recurrences?page_size=100": page([NETFLIX]),
    "POST /api/fms/v1/scenarios/compare": { status: 200, json: COMPARE },
  };

  it("«Cancelar Netflix» frente a «Hoy»: la diferencia a 12 meses con signo y en palabras; solo se llama a compare", async () => {
    view = await mountScreen(<CompareScreen />, routes);
    expect(view.visible()).toContain("Cancelar Netflix");
    expect(view.visible()).toContain("Cancelar «Netflix» desde 01/12/2026");
    expect(view.visible()).toContain("Marca uno o más escenarios");
    click(view.host.querySelector<HTMLInputElement>("input[type=checkbox]"));
    await wait();
    const compare = view.mock.calls.find((c) => c.url.endsWith("/scenarios/compare"))!;
    expect(compare.body).toEqual({ items: [{ scenario_id: "s1" }] });
    const table = view.host.querySelector("[data-testid=compare]")!.textContent!;
    expect(table).toContain("Hoy");
    expect(table).toContain("$4.000.000");
    expect(table).toContain("$4.538.800");
    expect(table).toContain("+$538.800");
    expect(table).toContain("más");
    expect(table).toContain("igual"); // la fecha de fin de deuda no cambia
    // ningún escenario escribe en el libro: la única escritura posible es `compare`, y esa no pide Idempotency-Key ni toca nada
    const writes = view.mock.calls.filter((c) => c.method !== "GET");
    expect(writes.map((c) => c.url)).toEqual(["/api/fms/v1/scenarios/compare"]);
    expect(writes[0].headers.get("Idempotency-Key")).toBeNull();
    expect(compare.url).not.toMatch(/\d{5,}/);
  });

  it("como mucho tres escenarios a la vez", async () => {
    const four = ["a", "b", "c", "d"].map((id) => ({ ...SCENARIO, id, name: `Esc ${id}` }));
    view = await mountScreen(<CompareScreen />, { ...routes, "GET /api/fms/v1/scenarios?page_size=100": page(four) });
    const boxes = () => [...view!.host.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
    boxes().slice(0, 3).forEach((b) => click(b));
    await wait();
    click(boxes()[3]);
    await wait();
    expect(boxes().filter((b) => b.checked)).toHaveLength(3);
    expect(boxes()[3].checked).toBe(false);
    const last = view.mock.calls.filter((c) => c.url.endsWith("/scenarios/compare")).at(-1)!;
    expect((last.body as { items: unknown[] }).items).toHaveLength(3);
  });

  it("crear un escenario: cancela una recurrencia desde una fecha; se guarda con Idempotency-Key y sin montos en la URL", async () => {
    view = await mountScreen(<CompareScreen />, { ...routes, "GET /api/fms/v1/scenarios?page_size=100": page([]), "POST /api/fms/v1/scenarios": { status: 201, json: SCENARIO } });
    expect(view.visible()).toContain("Aún no tienes escenarios");
    click(byText(view.host, "button", "Nuevo escenario"));
    await wait();
    const dialog = view.host.querySelector("dialog[open]")!;
    typeInto(dialog.querySelector<HTMLInputElement>("input[type=text]")!, "Cancelar Netflix");
    const recurrence = [...dialog.querySelectorAll<HTMLSelectElement>("select")].find((s) => [...s.options].some((o) => o.value === "rec-1"))!;
    typeInto(recurrence, "rec-1");
    typeInto(dialog.querySelector<HTMLInputElement>("input[type=date]")!, "2026-12-01");
    click(byText(dialog, "button", "Crear escenario"));
    await wait();
    const post = view.mock.calls.find((c) => c.method === "POST" && c.url === "/api/fms/v1/scenarios")!;
    expect(post.body).toEqual({ name: "Cancelar Netflix", description: null, adjustments: [{ kind: "cancel_recurrence", recurrence_id: "rec-1", start: "2026-12-01" }] });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("un ajuste incompleto no se guarda y lo dice", async () => {
    view = await mountScreen(<CompareScreen />, { ...routes, "GET /api/fms/v1/scenarios?page_size=100": page([]) });
    click(byText(view.host, "button", "Nuevo escenario"));
    await wait();
    const dialog = view.host.querySelector("dialog[open]")!;
    typeInto(dialog.querySelector<HTMLInputElement>("input[type=text]")!, "Algo");
    click(byText(dialog, "button", "Crear escenario"));
    await wait();
    expect(view.visible()).toContain("Elige la recurrencia que cancelarías.");
    expect(view.mock.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("avisa si hay un crédito en UVR sin la UVR de hoy (la cuota no entra, no vale cero)", async () => {
    view = await mountScreen(<CompareScreen />, { ...routes, "POST /api/fms/v1/scenarios/compare": { status: 200, json: { ...COMPARE, warnings: [{ code: "uvr_missing" }] } } });
    click(view.host.querySelector<HTMLInputElement>("input[type=checkbox]"));
    await wait();
    expect(view.visible()).toContain("sus cuotas no entran en esta comparación");
    expect(view.host.querySelector("[data-testid=compare] a")!.getAttribute("href")).toBe("/es/finanzas/configuracion/parametros?clave=UVR_VALUE");
  });
});

describe("independencia financiera (corte 3.2)", () => {
  const RESULT = {
    monthly_spending: "4000000.00",
    obligations_monthly: "0.00",
    monthly_saving: "1500000.00",
    real_return: "0.04",
    withdrawal_rate: "0.04",
    starting_capital: "20000000.00",
    needed_capital: "1200000000.00",
    reachable: true,
    months: 262,
    estimated_on: "2048-09-01",
    curve: [{ months: 0, capital: "20000000.00" }, { months: 12, capital: "38000000.00" }],
    notes: [],
  };

  it("calcula con los montos en el cuerpo del POST (nunca en la URL) y rotula todo como estimación", async () => {
    view = await mountScreen(<IndependenceScreen />, { "POST /api/fms/v1/independence": { status: 200, json: RESULT } });
    expect(view.visible()).toContain("no asesoría");
    const fields = () => [...view!.host.querySelectorAll<HTMLInputElement>("input[type=text]")];
    typeInto(fields()[0], "4.000.000");
    typeInto(fields()[1], "1.500.000");
    typeInto(fields()[2], "4");
    click(byText(view.host, "button", "Calcular"));
    await wait();
    const call = view.mock.calls.find((c) => c.url === "/api/fms/v1/independence")!;
    expect(call.body).toEqual({ monthly_spending: "4000000", monthly_saving: "1500000", real_return: "0.04", withdrawal_rate: "0.04", include_obligations: false });
    const result = view.host.querySelector("[data-testid=independence-result]")!.textContent!;
    expect(result).toContain("$1.200.000.000");
    expect(result).toContain("Septiembre 2048");
    expect(result).toContain("21 años y 10 meses");
  });

  it("si no se alcanza en 100 años lo dice, sin inventar una fecha", async () => {
    view = await mountScreen(<IndependenceScreen />, { "POST /api/fms/v1/independence": { status: 200, json: { ...RESULT, reachable: false, months: null, estimated_on: null } } });
    const fields = () => [...view!.host.querySelectorAll<HTMLInputElement>("input[type=text]")];
    typeInto(fields()[0], "4.000.000");
    typeInto(fields()[2], "0");
    click(byText(view.host, "button", "Calcular"));
    await wait();
    const result = view.host.querySelector("[data-testid=independence-result]")!.textContent!;
    expect(result).toContain("no se alcanza en 100 años");
    expect(result).not.toContain("Fecha estimada");
  });

  it("con datos inválidos no pide nada", async () => {
    view = await mountScreen(<IndependenceScreen />, {});
    click(byText(view.host, "button", "Calcular"));
    await wait();
    expect(view.mock.calls).toHaveLength(0);
    expect(view.visible()).toContain("Escribe un monto válido");
  });
});

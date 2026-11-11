// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { BudgetDetail } from "./budget-detail";
import { BudgetsScreen } from "./budgets-screen";
import { GoalsScreen } from "./goals-screen";
import { IndicatorsScreen } from "./indicators-screen";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas" }));

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.unstubAllGlobals();
});

const cat = (id: string, name: string) => ({ id, name, kind: "expense", parent_id: null, path: [name], account_id: "x", default_nature: "", default_classification: "", archived: false });
const page = <T,>(results: T[]) => ({ count: results.length, page: 1, page_size: 200, results });
const lookupRoutes = {
  "GET /api/fms/v1/categories?page_size=200": { status: 200, json: page([cat("c-mercado", "Mercado"), cat("c-rest", "Restaurantes")]) },
  "GET /api/fms/v1/accounts?page_size=100": { status: 200, json: page([{ id: "acc-1", name: "Ahorros", kind: "savings", status: "active", posted_balance: "5000000.00" }, { id: "acc-2", name: "Fondo viaje", kind: "fund", status: "active", posted_balance: "3200000.00" }]) },
  "GET /api/fms/v1/tags?page_size=200": { status: 200, json: page([]) },
  "GET /api/fms/v1/cost-centers?page_size=200": { status: 200, json: page([]) },
};
const budget = (over: Record<string, unknown>) => ({
  id: "b-1", dimension: "category", target_id: "c-mercado", period: "monthly", period_start: "2026-11-01", period_end: "2026-11-30", limit: "800000.00", spent: "640000.00", remaining: "160000.00", exceeded_by: "0.00", percent: "80.00", state: "attention", days_left: 20, per_day: "8000.00", pace: "960000.00", warn_percent: 80, exceed_percent: 100, active: true, label: null,
  movements_filter: { type: "expense", from: "2026-11-01", to: "2026-11-30", category: "c-mercado" },
  ...over,
});

describe("presupuestos", () => {
  it("cada presupuesto con ejecutado frente al límite, «te quedan» y por día, y el estado con texto (atención y excedido)", async () => {
    mounted = await mountScreen(<BudgetsScreen />, {
      ...lookupRoutes,
      "GET /api/fms/v1/budgets": {
        status: 200,
        json: {
          budgets: [budget({}), budget({ id: "b-2", target_id: "c-rest", limit: "350000.00", spent: "420000.00", remaining: "-70000.00", exceeded_by: "70000.00", percent: "120.00", state: "exceeded", per_day: "0.00" })],
          total: { limit: "1150000.00", spent: "1060000.00", percent: "92.17" },
        },
      },
    });
    const text = mounted.visible();
    expect(text).toContain("Mercado");
    expect(text).toContain("$640.000");
    expect(text).toContain("Te quedan");
    expect(text).toContain("$8.000 por día");
    expect(text).toContain("Atención");
    expect(text).toContain("Excedido · $70.000");
    expect(text).toContain("Superaste el límite");
    expect(text).toContain("92,17 %");
    const bars = [...mounted.host.querySelectorAll('[role="progressbar"]')].map((b) => b.getAttribute("aria-valuenow"));
    expect(bars).toContain("80");
    expect(bars).toContain("100");
    expect(mounted.host.querySelector('a[href="/es/finanzas/presupuestos/b-1"]')).toBeTruthy();
    for (const call of mounted.mock.calls) expect(call.url).not.toMatch(/800000|640000/);
  });

  it("sin presupuestos: propone límites con el promedio de 3 meses y crear uno envía su Idempotency-Key", async () => {
    mounted = await mountScreen(<BudgetsScreen />, {
      ...lookupRoutes,
      "GET /api/fms/v1/budgets": { status: 200, json: { budgets: [], total: { limit: "0.00", spent: "0.00", percent: "0.00" } } },
      "GET /api/fms/v1/budgets/suggestions": { status: 200, json: { suggestions: [{ category_id: "c-mercado", suggested_limit: "712000.00" }] } },
      "POST /api/fms/v1/budgets": { status: 201, json: budget({}) },
    });
    expect(mounted.text()).toContain("Aún no tienes presupuestos");
    expect(mounted.visible()).toContain("$712.000");
    click(byText(mounted.host, "button", "Crear con este límite"));
    await wait();
    const post = mounted.mock.calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ dimension: "category", target_id: "c-mercado", limit: "712000.00", period: "monthly" });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("el formulario cubre las 5 dimensiones y no envía sin objetivo ni límite", async () => {
    mounted = await mountScreen(<BudgetsScreen />, {
      ...lookupRoutes,
      "GET /api/fms/v1/budgets": { status: 200, json: { budgets: [budget({})], total: { limit: "800000.00", spent: "640000.00", percent: "80.00" } } },
      "POST /api/fms/v1/budgets": { status: 201, json: budget({}) },
    });
    click(byText(mounted.host, "header button, .screen button", "Nuevo presupuesto"));
    await wait();
    const form = mounted.host.querySelector("dialog form")!;
    const dimension = byText<HTMLLabelElement>(form, "label", "Qué presupuestas").control as HTMLSelectElement;
    expect([...dimension.options].map((o) => o.value).filter(Boolean)).toEqual(["category", "subcategory", "account", "cost_center", "tag"]);
    click(form.querySelector('button[type="submit"]'));
    await wait();
    expect(mounted.mock.calls.some((c) => c.method === "POST")).toBe(false);
    typeInto(byText<HTMLLabelElement>(form, "label", "Categoría").control as HTMLSelectElement, "c-rest");
    typeInto(byText<HTMLLabelElement>(form, "label", "Límite").control as HTMLInputElement, "350.000");
    click(form.querySelector('button[type="submit"]'));
    await wait();
    const post = mounted.mock.calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ dimension: "category", target_id: "c-rest", limit: "350000", warn_percent: 80, exceed_percent: 100 });
  });

  it("detalle: barras pareadas con tabla equivalente y «Ver movimientos» con el filtro exacto, sin montos en la URL", async () => {
    mounted = await mountScreen(<BudgetDetail id="b-1" />, {
      ...lookupRoutes,
      "GET /api/fms/v1/budgets/b-1": { status: 200, json: budget({}) },
      "GET /api/fms/v1/budgets/b-1/history?months=6": {
        status: 200,
        json: { budget_id: "b-1", periods: [{ period_start: "2026-10-01", period_end: "2026-10-31", limit: "800000.00", spent: "720000.00", percent: "90.00", state: "attention", movements_filter: { type: "expense", from: "2026-10-01", to: "2026-10-31", category: "c-mercado" } }] },
      },
    });
    const links = [...mounted.host.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toContain("/es/finanzas/movimientos/egresos?from=2026-11-01&to=2026-11-30&category=c-mercado");
    expect(links).toContain("/es/finanzas/movimientos/egresos?from=2026-10-01&to=2026-10-31&category=c-mercado");
    expect(mounted.text()).toContain("A este paso terminas en");
    expect(mounted.visible()).toContain("~$960.000");
    expect(mounted.host.querySelector("figure.chart")).toBeTruthy();
    expect(mounted.host.querySelector("figure details table")).toBeTruthy();
    expect(mounted.host.querySelector('[aria-hidden="true"].chart__rows')).toBeTruthy();
    for (const href of links) expect(href).not.toMatch(/amount|000000/);
  });
});

describe("metas", () => {
  const goal = {
    id: "g-1", name: "Vacaciones", kind: "vacation", status: "active", account_id: "acc-2", target_amount: "12000000.00", saved: "3200000.00", remaining: "8800000.00", percent: "26.67", reached: false, target_date: "2027-11-30", months_left: 12, monthly_needed: "733333.34", planned_contribution: "700000.00",
    movements_filter: { account: "acc-2" },
  };
  const routes = { ...lookupRoutes, "GET /api/fms/v1/goals": { status: 200, json: { goals: [goal, { ...goal, id: "g-2", name: "Carro", kind: "vehicle" }] } } };

  it("Ahorro muestra las metas de ahorro: progreso = saldo, aporte mensual necesario redondeado hacia arriba y «Ver movimientos»", async () => {
    mounted = await mountScreen(<GoalsScreen tab="ahorro" />, routes);
    const text = mounted.visible();
    expect(text).toContain("Vacaciones");
    expect(text).not.toContain("Carro");
    expect(text).toContain("$3.200.000");
    expect(text).toContain("$12.000.000");
    expect(text).toContain("26,67 %");
    expect(text).toContain("$733.333,34 al mes para llegar el 30/11/2027");
    expect(mounted.host.querySelector('a[href="/es/finanzas/movimientos?account=acc-2"]')).toBeTruthy();
  });
  it("Objetivos muestra el resto", async () => {
    mounted = await mountScreen(<GoalsScreen tab="objetivos" />, routes);
    expect(mounted.text()).toContain("Carro");
    expect(mounted.text()).not.toContain("Vacaciones");
  });
  it("aportar es una transferencia con Idempotency-Key y sin montos en la URL", async () => {
    mounted = await mountScreen(<GoalsScreen tab="ahorro" />, { ...routes, "POST /api/fms/v1/goals/g-1/contribute": { status: 201, json: { id: "m-1" } } });
    click(byText(mounted.host, "article button", "Aportar"));
    await wait();
    const dialog = [...mounted.host.querySelectorAll("dialog")].find((d) => d.textContent?.includes("Una transferencia hacia"))!;
    typeInto(dialog.querySelector('input[inputmode="decimal"]')!, "500.000");
    click(dialog.querySelector('button[type="submit"]'));
    await wait();
    const post = mounted.mock.calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/fms/v1/goals/g-1/contribute");
    expect(post.body).toMatchObject({ amount: "500000", from_account_id: "acc-1" });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
  });
  it("sin metas: estado vacío", async () => {
    mounted = await mountScreen(<GoalsScreen tab="objetivos" />, { ...lookupRoutes, "GET /api/fms/v1/goals": { status: 200, json: { goals: [] } } });
    expect(mounted.text()).toContain("Aún no tienes metas aquí");
  });
});

describe("indicadores", () => {
  it("valor, fórmula y tendencia con tabla; sin base muestra «—» y lo explica", async () => {
    mounted = await mountScreen(<IndicatorsScreen />, {
      "GET /api/fms/v1/indicators": {
        status: 200,
        json: {
          month: "2026-11-01",
          indicators: [
            { key: "committed_income", formula: "x", value: "34.50", trend: [{ month: "2026-10-01", value: "30.00" }, { month: "2026-11-01", value: "34.50" }] },
            { key: "saving_capacity", formula: "y", value: null, trend: [{ month: "2026-11-01", value: null }] },
          ],
        },
      },
    });
    const text = mounted.visible();
    expect(text).toContain("Ingresos comprometidos");
    expect(text).toContain("34,5 %");
    expect(text).toContain("(gastos fijos + cuotas de deuda del mes) ÷ ingresos del mes");
    expect(text).toContain("Sin base este mes");
    expect(mounted.host.querySelectorAll("figure details table")).toHaveLength(2);
  });
});

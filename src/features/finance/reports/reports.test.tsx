// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { NetWorthScreen, ProjectionsScreen, ReportScreen, ReportsHome, StatisticsScreen } from "./reports-screens";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas" }));

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.unstubAllGlobals();
});

const col = (key: string, label: string, kind: string) => ({ key, label, kind });
const INCOME = {
  report: "income_statement",
  title: "Estado de resultados personal",
  generated_on: "2026-11-11",
  filters: [{ label: "Periodo", value: "2026-11-01 a 2026-11-30" }],
  headline: [{ key: "net_result", kind: "money", value: "3200000.00" }, { key: "income", kind: "money", value: "5200000.00" }, { key: "expenses", kind: "money", value: "2000000.00" }],
  tables: [
    {
      key: "expenses",
      title: "Gastos",
      columns: [col("category", "Categoría", "text"), col("amount", "Monto", "money"), col("percent", "%", "percent")],
      rows: [
        { cells: ["Mercado", "1200000.00", "60.00"], movements_filter: { type: "expense", from: "2026-11-01", to: "2026-11-30", category: "c-mercado" }, ref: null },
        { cells: ["Transporte", "800000.00", "40.00"], movements_filter: { type: "expense", from: "2026-11-01", to: "2026-11-30", category: "c-trans", max_amount: "9" }, ref: null },
      ],
      totals: ["Total", "2000000.00", "100.00"],
    },
    {
      key: "classification",
      title: "Necesario frente a discrecional",
      columns: [col("category", "Categoría", "text"), col("amount", "Monto", "money"), col("percent", "%", "percent")],
      rows: [{ cells: ["Necesario", "1500000.00", "75.00"], movements_filter: { type: "expense", classification: "necessary", from: "2026-11-01", to: "2026-11-30" }, ref: null }],
      totals: null,
    },
  ],
  notes: [],
};
const json = (body: unknown) => ({ status: 200, json: body });

describe("informe con filtros comunes", () => {
  it("cifra principal → gráfica → tabla; cada cifra abre sus movimientos con el filtro exacto (sin montos) y los totales suman", async () => {
    mounted = await mountScreen(<ReportScreen reportKey="income_statement" />, { "GET /api/fms/v1/reports/income_statement": json(INCOME) });
    const text = mounted.visible();
    expect(text).toContain("Estado de resultados personal");
    expect(text).toContain("$3.200.000");
    expect(text).toContain("60 %");
    expect(text).toContain("Total");
    const links = [...mounted.host.querySelectorAll("table a")].map((a) => a.getAttribute("href"));
    expect(links).toContain("/es/finanzas/movimientos/egresos?from=2026-11-01&to=2026-11-30&category=c-mercado");
    expect(links).toContain("/es/finanzas/movimientos/egresos?from=2026-11-01&to=2026-11-30&category=c-trans");
    expect(links).toContain("/es/finanzas/movimientos/egresos?from=2026-11-01&to=2026-11-30&classification=necessary");
    for (const href of links) expect(href).not.toMatch(/amount|max_/);
    expect(mounted.host.querySelector("a[aria-label^='Ver movimientos: Mercado']")).toBeTruthy();
    expect(mounted.host.querySelectorAll("figure.chart")).toHaveLength(2);
    expect(mounted.host.querySelector("figure details table")).toBeTruthy();
    expect(mounted.host.querySelector("tfoot")?.textContent).toContain("$2.000.000");
    expect(mounted.mock.calls[0].url).toBe("/api/fms/v1/reports/income_statement");
  });

  it("en inglés lleva a su idioma los rótulos del servidor y las filas conocidas", async () => {
    mounted = await mountScreen(<ReportScreen reportKey="income_statement" />, { "GET /api/fms/v1/reports/income_statement": json(INCOME) }, "en");
    const text = mounted.visible();
    expect(text).toContain("Expenses");
    expect(text).toContain("Necessary versus discretionary");
    expect(text).toContain("Necessary");
    expect(text).toContain("Category");
    expect(text).toContain("Net result");
    expect(text).toContain("Period: 2026-11-01 a 2026-11-30");
    expect(text).not.toContain("Estado de resultados");
  });

  it("los filtros comunes van al servidor (periodo, categoría, tipo) y ninguno es un monto", async () => {
    const routes = {
      "GET /api/fms/v1/reports/income_statement": json(INCOME),
      "GET /api/fms/v1/reports/income_statement?month=2026-10&category=c-mercado&type=expense": json(INCOME),
      "GET /api/fms/v1/categories?page_size=200": json({ count: 1, page: 1, page_size: 200, results: [{ id: "c-mercado", name: "Mercado", kind: "expense", parent_id: null, path: ["Mercado"], account_id: "x", default_nature: "", default_classification: "", archived: false }] }),
      "GET /api/fms/v1/accounts?page_size=100": json({ count: 0, page: 1, page_size: 100, results: [] }),
      "GET /api/fms/v1/cards?page_size=100": json({ count: 0, page: 1, page_size: 100, results: [] }),
      "GET /api/fms/v1/tags?page_size=200": json({ count: 0, page: 1, page_size: 200, results: [] }),
    };
    mounted = await mountScreen(<ReportScreen reportKey="income_statement" />, routes);
    click(byText<HTMLLabelElement>(mounted.host, "label", "Un mes").control ?? null);
    await wait();
    // Mes anterior: el filtro de mes es AAAA-MM, no un monto.
    click(mounted.host.querySelector('button[aria-label="Mes anterior"]'));
    click(byText(mounted.host, "button", "Más filtros"));
    await wait();
    const filters = mounted.host.querySelector("#report-filters")!;
    typeInto(byText<HTMLLabelElement>(filters, "label", "Categoría").control as HTMLSelectElement, "c-mercado");
    typeInto(byText<HTMLLabelElement>(filters, "label", "Tipo de movimiento").control as HTMLSelectElement, "expense");
    await wait();
    const urls = mounted.mock.calls.filter((c) => c.url.includes("/reports/")).map((c) => c.url);
    expect(urls.some((u) => /\/reports\/income_statement\?month=\d{4}-\d{2}&category=c-mercado&type=expense$/.test(u))).toBe(true);
    for (const url of urls) expect(url).not.toMatch(/amount|balance|total|price|value/);
  });

  it("sin movimientos: estado vacío con el texto del diseño, nunca cifras inventadas", async () => {
    mounted = await mountScreen(<ReportScreen reportKey="cash_flow" />, {
      "GET /api/fms/v1/reports/cash_flow": json({ ...INCOME, report: "cash_flow", headline: [], tables: [{ key: "cash_flow", title: "Flujo de caja mensual", columns: [col("month", "Mes", "date")], rows: [], totals: null }] }),
    });
    expect(mounted.text()).toContain("Necesitas al menos un mes de movimientos para este informe");
    expect(mounted.host.querySelector("figure")).toBeNull();
  });

  it("una clave que no es un informe: aviso, sin pedir nada", async () => {
    mounted = await mountScreen(<ReportScreen reportKey="../etc" />, {});
    expect(mounted.text()).toContain("No conocemos ese informe");
    expect(mounted.mock.calls).toHaveLength(0);
  });
});

describe("saldos y patrimonio", () => {
  it("una fila de saldo lleva a su cuenta; su cifra abre los movimientos de la cuenta", async () => {
    const worth = {
      ...INCOME,
      report: "net_worth",
      headline: [{ key: "net_worth", kind: "money", value: "4000000.00" }],
      tables: [{ key: "assets", title: "Activos", columns: [col("group", "Grupo", "text"), col("account", "Cuenta", "text"), col("balance", "Saldo", "money"), col("percent", "%", "percent")], rows: [{ cells: ["liquid", "Ahorros", "5000000.00", "100.00"], movements_filter: { account: "acc-1" }, ref: { kind: "account", id: "acc-1" } }], totals: ["Total", null, "5000000.00", "100.00"] }],
    };
    mounted = await mountScreen(<NetWorthScreen />, { "GET /api/fms/v1/reports/net_worth": json(worth) });
    const links = [...mounted.host.querySelectorAll("table a")].map((a) => a.getAttribute("href"));
    expect(links).toContain("/es/finanzas/cuentas/acc-1");
    expect(links).toContain("/es/finanzas/movimientos?account=acc-1");
    expect(mounted.visible()).toContain("Líquido");
  });
});

describe("proyección: real y proyectado sin depender del color", () => {
  const projection = {
    report: "projection",
    title: "Proyección financiera",
    generated_on: "2026-11-11",
    filters: [{ label: "Escenario", value: "base" }],
    headline: [{ key: "available_today", kind: "money", value: "3420000.00" }, { key: "first_negative_date", kind: "date", value: "2027-01-20" }, { key: "missing", kind: "money", value: "900000.00" }],
    tables: [
      {
        key: "projection",
        title: "Pronóstico mensual de caja",
        columns: [col("month", "Mes", "date"), col("state", "Estado", "text"), col("opening", "Saldo inicial", "money"), col("inflow", "Entradas", "money"), col("outflow", "Salidas", "money"), col("closing", "Saldo final", "money")],
        rows: [
          { cells: ["2026-10-01", "real", "2900000.00", "5200000.00", "4950000.00", "3150000.00"], movements_filter: { from: "2026-10-01", to: "2026-10-31" }, ref: null },
          { cells: ["2026-11-01", "en curso", "3150000.00", "5200000.00", "7370000.00", "980000.00"], movements_filter: { from: "2026-11-01", to: "2026-11-30" }, ref: null },
          { cells: ["2026-12-01", "proyect.", "980000.00", "5200000.00", "4840000.00", "1340000.00"], movements_filter: null, ref: null },
        ],
        totals: null,
      },
    ],
    notes: ["Estimación, no asesoría: lo proyectado usa el promedio de los últimos 3 meses y las reglas vigentes; nunca escribe movimientos."],
  };
  const catalog = { reports: [], scenarios: [{ key: "base", income_pct: "0.0000", variable_pct: "0.0000" }, { key: "optimistic", income_pct: "0.0500", variable_pct: "-0.1000" }, { key: "pessimistic", income_pct: "-0.1000", variable_pct: "0.1500" }] };
  const liquidity = { scenario: "base", available_today: "3420000.00", variable_spending_monthly: "1500000.00", horizons: [{ days: 15, balance: "2000000.00" }, { days: 30, balance: "1250000.00" }, { days: 60, balance: "-100000.00" }, { days: 90, balance: "-900000.00" }], first_negative_date: "2027-01-20", missing: "900000.00" };
  const routes = {
    "GET /api/fms/v1/reports": json(catalog),
    "GET /api/fms/v1/reports/projection?scenario=base&horizon=12m": json(projection),
    "GET /api/fms/v1/liquidity?scenario=base": json(liquidity),
  };

  it("cada mes lleva su rótulo (Real, En curso, Proyectado), la fila proyectada su clase y la barra proyectada su trama", async () => {
    mounted = await mountScreen(<ProjectionsScreen />, routes);
    const rows = [...mounted.host.querySelectorAll("tbody tr.rep-row")];
    expect(rows.map((r) => r.className)).toEqual(["rep-row rep-row--real", "rep-row rep-row--current", "rep-row rep-row--projected"]);
    expect(rows.map((r) => r.querySelector("td .badge")?.textContent)).toEqual(["Real", "En curso", "Proyectado"]);
    const fills = [...mounted.host.querySelectorAll(".chart__rows .chart__fill")];
    const hatched = fills.map((f) => f.classList.contains("chart__fill--hatched"));
    expect(hatched).toEqual([false, false, false, false, true, true]);
    expect(mounted.host.querySelector(".chart__legend")?.textContent).toContain("Proyectado (barras con trama)");
    expect(mounted.visible()).toContain("Estimación, no asesoría");
  });

  it("la liquidez muestra los horizontes, el primer día negativo y lo que faltaría", async () => {
    mounted = await mountScreen(<ProjectionsScreen />, routes);
    const text = mounted.visible();
    expect(text).toContain("En 30 días");
    expect(text).toContain("$1.250.000");
    expect(text).toContain("−$100.000");
    expect(text).toContain("El saldo se vuelve negativo el 20/01/2027");
    expect(text).toContain("Te faltarían $900.000");
  });

  it("escenario y porcentajes editables: solo se envían los que cambió la persona", async () => {
    const opt = "GET /api/fms/v1/reports/projection?scenario=optimistic&horizon=12m";
    mounted = await mountScreen(<ProjectionsScreen />, { ...routes, [opt]: json(projection), "GET /api/fms/v1/liquidity?scenario=optimistic": json(liquidity), "GET /api/fms/v1/reports/projection?scenario=optimistic&horizon=12m&income_pct=0.08": json(projection), "GET /api/fms/v1/liquidity?scenario=optimistic&income_pct=0.08": json(liquidity) });
    click(byText<HTMLLabelElement>(mounted.host, "label", "Optimista").control ?? null);
    await wait();
    const incomeField = byText<HTMLLabelElement>(mounted.host, "label", "Ingresos (% de cambio)").control as HTMLInputElement;
    expect(incomeField.value).toBe("5");
    expect(mounted.mock.calls.some((c) => c.url === "/api/fms/v1/reports/projection?scenario=optimistic&horizon=12m")).toBe(true);
    typeInto(incomeField, "8");
    await wait();
    expect(mounted.mock.calls.some((c) => c.url === "/api/fms/v1/reports/projection?scenario=optimistic&horizon=12m&income_pct=0.08")).toBe(true);
    expect(mounted.mock.calls.some((c) => c.url.includes("variable_pct"))).toBe(false);
  });

  it("un porcentaje inválido no pide nada y lo dice", async () => {
    mounted = await mountScreen(<ProjectionsScreen />, routes);
    const before = mounted.mock.calls.length;
    typeInto(byText<HTMLLabelElement>(mounted.host, "label", "Gasto variable (% de cambio)").control as HTMLInputElement, "abc");
    await wait();
    expect(mounted.text()).toContain("Corrige los porcentajes");
    expect(mounted.mock.calls.length).toBe(before);
  });
});

describe("gastos hormiga", () => {
  const ants = { ...INCOME, report: "ant_expenses", title: "Gastos hormiga", filters: [{ label: "Mes", value: "2026-11" }, { label: "Umbral", value: "20000" }], headline: [{ key: "monthly_total", kind: "money", value: "98000.00" }, { key: "yearly_total", kind: "money", value: "1176000.00" }], tables: [{ key: "ants", title: "Gastos hormiga", columns: [col("name", "Hormiga", "text"), col("count", "Veces", "int"), col("monthly", "Al mes", "money"), col("yearly", "Al año", "money")], rows: [{ cells: ["Café", "14", "98000.00", "1176000.00"], movements_filter: { type: "expense", classification: "discretionary", from: "2026-11-01", to: "2026-11-30", counterparty: "p-1", max_amount: "20000" }, ref: null }], totals: ["Total", "14", "98000.00", "1176000.00"] }] };
  it("«Café: 14 veces · $98.000 al mes · $1.176.000 al año»; el monto máximo del filtro no viaja en la URL", async () => {
    mounted = await mountScreen(<StatisticsScreen />, { "GET /api/fms/v1/reports/statistics": json({ ...INCOME, report: "statistics", tables: [] }), "GET /api/fms/v1/reports/ant_expenses": json(ants) });
    click(byText(mounted.host, "[role=tab]", "Gastos hormiga"));
    await wait();
    const text = mounted.visible();
    expect(text).toContain("Café");
    expect(text).toContain("14");
    expect(text).toContain("$98.000");
    expect(text).toContain("$1.176.000");
    const link = [...mounted.host.querySelectorAll("table a")].map((a) => a.getAttribute("href"))[0];
    expect(link).toBe("/es/finanzas/movimientos/egresos?from=2026-11-01&to=2026-11-30&counterparty=p-1&classification=discretionary");
    expect(text).toContain("el monto máximo no viaja en la URL");
  });
  it("el umbral es un control: el de por defecto no se envía y uno distinto va al servidor", async () => {
    mounted = await mountScreen(<StatisticsScreen />, { "GET /api/fms/v1/reports/statistics": json({ ...INCOME, report: "statistics", tables: [] }), "GET /api/fms/v1/reports/ant_expenses": json(ants), "GET /api/fms/v1/reports/ant_expenses?threshold=50000": json(ants) });
    click(byText(mounted.host, "[role=tab]", "Gastos hormiga"));
    await wait();
    expect(mounted.mock.calls.some((c) => c.url === "/api/fms/v1/reports/ant_expenses")).toBe(true);
    typeInto(byText<HTMLLabelElement>(mounted.host, "label", "Umbral por gasto").control as HTMLSelectElement, "50000");
    await wait();
    expect(mounted.mock.calls.some((c) => c.url === "/api/fms/v1/reports/ant_expenses?threshold=50000")).toBe(true);
  });
});

describe("exportar", () => {
  const routes = { "GET /api/fms/v1/reports/income_statement": json(INCOME) };
  function stubUrl() {
    const events: string[] = [];
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => (events.push("create"), "blob:r"), revokeObjectURL: () => events.push("revoke") }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => void events.push("click"));
    return events;
  }
  it("POST con el formato y los filtros en el cuerpo, descarga directa y URL revocada al instante; la URL no lleva nada", async () => {
    const events = stubUrl();
    mounted = await mountScreen(<ReportScreen reportKey="income_statement" />, { ...routes, "POST /api/fms/v1/reports/income_statement/export": { status: 200, body: "a,b\n" } });
    click(byText(mounted.host, "button", "CSV"));
    await wait();
    const post = mounted.mock.calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/fms/v1/reports/income_statement/export");
    expect(post.body).toEqual({ format: "csv" });
    expect(post.headers.get("X-CSRFToken")).toBe("tok-test");
    expect(events).toEqual(["create", "click", "revoke"]);
  });
  it("si falla: «No pudimos generar el PDF · Reintentar», sin descargar nada", async () => {
    const events = stubUrl();
    mounted = await mountScreen(<ReportScreen reportKey="income_statement" />, { ...routes, "POST /api/fms/v1/reports/income_statement/export": { status: 500, json: { code: "boom" } } });
    click(byText(mounted.host, "button", "PDF"));
    await wait();
    expect(mounted.text()).toContain("No pudimos generar el PDF");
    expect(byText(mounted.host, "button", "Reintentar")).toBeTruthy();
    expect(events).toEqual([]);
  });
  it("demasiadas exportaciones seguidas (429) se dicen con palabras", async () => {
    stubUrl();
    mounted = await mountScreen(<ReportScreen reportKey="income_statement" />, { ...routes, "POST /api/fms/v1/reports/income_statement/export": { status: 429, json: { code: "throttled" } } });
    click(byText(mounted.host, "button", "Excel"));
    await wait();
    expect(mounted.text()).toContain("Demasiadas solicitudes seguidas");
  });
});

describe("catálogo", () => {
  it("lista los informes del catálogo y cada uno lleva a su pantalla", async () => {
    const reports = ["income_statement", "cash_flow", "net_worth", "debt", "recurring_expenses", "cards", "subscriptions", "budgets", "net_worth_evolution", "projection", "statistics", "ant_expenses"].map((key) => ({ key, title: key, projected: key === "projection", default_months: 1 }));
    mounted = await mountScreen(<ReportsHome />, { "GET /api/fms/v1/reports": json({ reports, scenarios: [] }) });
    const links = [...mounted.host.querySelectorAll("ul a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual([
      "/es/finanzas/informes/income_statement",
      "/es/finanzas/informes/cash_flow",
      "/es/finanzas/informes/patrimonio",
      "/es/finanzas/informes/debt",
      "/es/finanzas/informes/recurring_expenses",
      "/es/finanzas/informes/cards",
      "/es/finanzas/informes/subscriptions",
      "/es/finanzas/informes/budgets",
      "/es/finanzas/informes/net_worth_evolution",
      "/es/finanzas/informes/proyecciones",
      "/es/finanzas/informes/estadisticas",
      "/es/finanzas/informes/estadisticas",
    ]);
    expect(mounted.visible()).toContain("Estimación, no asesoría");
  });
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { AssetDetail } from "./asset-detail";
import { WealthScreen } from "./wealth-screen";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/es/finanzas/informes/patrimonio",
}));

const page = (results: unknown[]) => ({ status: 200, json: { count: results.length, page: 1, page_size: 100, results } });
const ACCOUNT = { id: "acc-1", type: "asset", kind: "savings", system_key: "", name: "Ahorros", last4: null, institution: null, parent_id: null, currency: "COP", gmf_exempt: false, liquid: true, enforce_funds: false, status: "active", posted_balance: "3420000.00", projected_balance: "3420000.00" };
const VEHICLE = { plate: "ABC123", brand: "Mazda", model: "3 Touring", year: 2022, odometer_km: "185400.00", odometer_on: "2026-11-01", initial_odometer_km: "25000.00", tag_id: "tag-1" };
const ASSET = { id: "a1", kind: "vehicle", name: "Mazda 3", notes: null, account_id: "acc-9", acquired_on: "2024-03-01", purchase_value: "50000000.00", value: "42000000.00", last_valuation_on: "2026-10-15", loan_id: null, archived: false, vehicle: VEHICLE };
const WORTH = {
  as_of: "2026-11-11",
  assets: { liquid: "3420000.00", savings: "0.00", receivable: "0.00", vehicles: "42000000.00", property: "0.00", investments: "0.00", other_assets: "0.00" },
  liabilities: { cards: "1200000.00", loans: "10000000.00", personal_debts: "0.00" },
  total_assets: "45420000.00",
  total_liabilities: "11200000.00",
  net_worth: "34220000.00",
  trend: [
    { on: "2026-09-30", assets: "44000000.00", liabilities: "11500000.00", net_worth: "32500000.00" },
    { on: "2026-10-31", assets: "45000000.00", liabilities: "11300000.00", net_worth: "33700000.00" },
  ],
};

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
});

describe("patrimonio neto", () => {
  it("muestra activos − pasivos del libro con su composición, tendencia en gráfica y tabla", async () => {
    view = await mountScreen(<WealthScreen />, { "GET /api/fms/v1/net-worth?months=12": { status: 200, json: WORTH } });
    const text = view.visible();
    expect(view.host.querySelector("[data-testid=net-worth]")!.textContent).toContain("$34.220.000");
    expect(text).toContain("Activos menos pasivos");
    expect(text).toContain("Vehículos");
    expect(text).toContain("$42.000.000");
    expect(text).toContain("Tarjetas de crédito");
    expect(text).not.toContain("Inmuebles"); // un grupo en cero no se pinta
    expect(text).toContain("Tendencia mensual");
    expect(text).toContain("Ver como tabla");
  });

  it("sin activos ni deudas: estado vacío, nada inventado", async () => {
    const zero = { ...WORTH, assets: { liquid: "0.00" }, liabilities: { cards: "0.00" }, total_assets: "0.00", total_liabilities: "0.00", net_worth: "0.00", trend: [] };
    view = await mountScreen(<WealthScreen />, { "GET /api/fms/v1/net-worth?months=12": { status: 200, json: zero } });
    expect(view.visible()).toContain("Aún no hay activos ni deudas registrados");
  });

  it("la pestaña Activos lista por tipo y crea un vehículo con Idempotency-Key", async () => {
    view = await mountScreen(<WealthScreen />, {
      "GET /api/fms/v1/net-worth?months=12": { status: 200, json: WORTH },
      "GET /api/fms/v1/assets?page_size=100": page([ASSET]),
      "GET /api/fms/v1/loans?page_size=100": page([]),
      "POST /api/fms/v1/assets": { status: 201, json: ASSET },
    });
    click(byText(view.host, "[role=tab]", "Activos"));
    await wait();
    expect(view.visible()).toContain("Mazda 3");
    expect(view.visible()).toContain("Placa ABC123");
    click(byText(view.host, "button", "Agregar activo"));
    await wait();
    const dialog = view.host.querySelector("dialog")!;
    const texts = [...dialog.querySelectorAll<HTMLInputElement>("input[type=text]")];
    // nombre, valor, valor de compra, placa, año, marca, modelo, kilometraje
    typeInto(texts[0], "Moto Honda");
    typeInto(texts[1], "9.500.000");
    typeInto(texts[3], "xyz-98a");
    typeInto(texts[7], "12000");
    click(byText(view.host, "dialog button", "Guardar activo"));
    await wait();
    const [post] = view.mock.calls.filter((c) => c.method === "POST");
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(post.body).toMatchObject({ kind: "vehicle", name: "Moto Honda", value: "9500000", vehicle: { plate: "XYZ98A", odometer_km: "12000" } });
    expect(post.url).not.toMatch(/9500000/);
  });
});

describe("detalle del activo y vehículo", () => {
  const MAINT = [
    { id: "m1", name: "Cambio de aceite", every_months: 6, every_km: 5000, last_done_on: "2026-05-01", last_done_km: "180000.00", active: true, status: { state: "soon", reason: "km", due_on: "2026-11-01", due_km: "185000", days_left: 20, km_left: "-400", } },
  ];
  const routes = {
    "GET /api/fms/v1/assets/a1": { status: 200, json: ASSET },
    "GET /api/fms/v1/assets/a1/valuations?page_size=50&page=1": page([
      { id: "v2", on: "2026-10-15", value: "42000000.00", previous_value: "45000000.00", source: "Fasecolda", entry_id: "e2" },
      { id: "v1", on: "2024-03-01", value: "45000000.00", previous_value: "0.00", source: "Compra", entry_id: "e1" },
    ]),
    "GET /api/fms/v1/assets/a1/cost-summary": { status: 200, json: { first: "2024-03-01", last: "2026-11-11", total: "5400000.00", entries: 9, months: 32, per_month: "168750.00", km_driven: "160400.00", per_km: "33.67" } },
    "GET /api/fms/v1/assets/a1/costs": { status: 200, json: [{ id: "c1", kind: "soat", recurrence_id: "r1", name: "SOAT Mazda 3", expected_amount: "620000.00", status: "active", next_due: "2027-01-15", notify_days: [30, 7] }] },
    "GET /api/fms/v1/assets/a1/maintenance": { status: 200, json: MAINT },
  };

  it("valor actual, historial de avalúos con diferencia y fuente, y el vehículo", async () => {
    view = await mountScreen(<AssetDetail id="a1" />, routes);
    const text = view.visible();
    expect(view.host.querySelector("[data-testid=asset-value]")!.textContent).toContain("$42.000.000");
    expect(text).toContain("Avalúo del 15/10/2026");
    expect(text).toContain("Fasecolda");
    expect(text).toContain("−$3.000.000");
    expect(view.host.querySelector("[data-testid=odometer]")!.textContent).toBe("185.400 km al 01/11/2026");
    expect(text).toContain("ABC123");
    // costo por mes y por km
    const summary = view.host.querySelector("[data-testid=cost-summary]")!.textContent!;
    expect(summary).toContain("$168.750");
    expect(summary).toContain("$33,67");
    // SOAT con avisos
    expect(text).toContain("SOAT");
    expect(text).toContain("Próximo vencimiento: 15/01/2027");
    expect(text).toContain("Avisa 30 días antes");
    expect(text).toContain("Avisa 7 días antes");
    // mantenimiento «lo que ocurra primero»
    expect(text).toContain("Cada 6 meses o 5.000 km, lo que ocurra primero");
    expect(text).toContain("Pronto · por kilometraje");
    expect(text).toContain("Pasaron 400 km");
    expect(text).toContain("Faltan 20 días");
  });

  it("actualizar el valor exige la fuente y manda monto en el cuerpo, nunca en la URL", async () => {
    view = await mountScreen(<AssetDetail id="a1" />, { ...routes, "POST /api/fms/v1/assets/a1/valuations": { status: 201, json: {} } });
    click(byText(view.host, "button", "Actualizar valor"));
    await wait();
    const inputs = () => [...view!.host.querySelectorAll<HTMLInputElement>("dialog input")];
    typeInto(inputs()[0], "43.500.000");
    click(byText(view.host, "dialog button", "Guardar avalúo"));
    await wait();
    expect(view.mock.calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(view.visible()).toContain("La fuente es obligatoria");
    typeInto(inputs()[2], "Fasecolda noviembre");
    click(byText(view.host, "dialog button", "Guardar avalúo"));
    await wait();
    const [post] = view.mock.calls.filter((c) => c.method === "POST");
    expect(post.body).toMatchObject({ value: "43500000", source: "Fasecolda noviembre" });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(post.url).not.toMatch(/43500000/);
  });

  it("el kilometraje no puede bajar y registrar lo hecho manda fecha, km y costo", async () => {
    view = await mountScreen(<AssetDetail id="a1" />, {
      ...routes,
      "POST /api/fms/v1/assets/a1/odometer": { status: 200, json: VEHICLE },
      "POST /api/fms/v1/maintenance/m1/records": { status: 201, json: {} },
    });
    click(byText(view.host, "button", "Actualizar kilometraje"));
    await wait();
    const km = () => view!.host.querySelector<HTMLInputElement>("dialog input[inputmode=numeric]")!;
    typeInto(km(), "180000");
    await wait();
    expect(view.visible()).toContain("no puede bajar");
    click(byText(view.host, "dialog button", "Guardar"));
    await wait();
    expect(view.mock.calls.filter((c) => c.method === "POST")).toHaveLength(0);
    typeInto(km(), "186.000");
    click(byText(view.host, "dialog button", "Guardar"));
    await wait();
    expect(view.mock.calls.find((c) => c.url.endsWith("/odometer"))!.body).toMatchObject({ km: "186000" });

    click(byText(view.host, "button", "Registrar que se hizo"));
    await wait();
    const fields = [...view.host.querySelectorAll<HTMLInputElement>("dialog input[type=text]")];
    typeInto(fields[0], "190000");
    typeInto(fields[1], "180.000");
    click(byText(view.host, "dialog button", "Guardar"));
    await wait();
    const record = view.mock.calls.find((c) => c.url.endsWith("/maintenance/m1/records"))!;
    expect(record.body).toMatchObject({ odometer_km: "190000", cost: "180000" });
    expect(record.headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("agregar el SOAT crea la recurrencia anual con aviso y lleva el valor solo en el cuerpo", async () => {
    view = await mountScreen(<AssetDetail id="a1" />, {
      ...routes,
      "GET /api/fms/v1/accounts?page_size=100": page([ACCOUNT]),
      "GET /api/fms/v1/categories?page_size=200&archived=false": page([]),
      "GET /api/fms/v1/cost-centers?page_size=200": page([]),
      "POST /api/fms/v1/assets/a1/costs": { status: 201, json: {} },
    });
    click(byText(view.host, "button", "Agregar costo anual"));
    await wait();
    const text = view.host.querySelector<HTMLInputElement>("dialog input.input--amount")!;
    typeInto(text, "620.000");
    typeInto(view.host.querySelector<HTMLInputElement>("dialog input[type=date]")!, "2027-01-15");
    click(byText(view.host, "dialog button", "Agregar costo"));
    await wait();
    const post = view.mock.calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ kind: "soat", amount: "620000", due_date: "2027-01-15", account_id: "acc-1" });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("activo no encontrado", async () => {
    view = await mountScreen(<AssetDetail id="x" />, { "GET /api/fms/v1/assets/x": { status: 404, json: { code: "asset_not_found" } }, "GET /api/fms/v1/assets/x/valuations?page_size=50&page=1": { status: 404, json: {} } });
    expect(view.visible()).toContain("No encontramos este activo");
  });
});

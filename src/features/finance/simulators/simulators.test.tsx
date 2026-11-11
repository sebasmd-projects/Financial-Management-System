// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { CompareSimulator } from "./compare-sim";
import { ExtraPaymentSimulator } from "./extra-sim";
import { InstallmentSimulator } from "./installment-sim";
import { RatesSimulator } from "./rates-sim";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas" }));

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.unstubAllGlobals();
});
const settle = () => wait(450);
const field = (m: Mounted, label: string) => byText<HTMLLabelElement>(m.host, "label", label).control as HTMLInputElement;

describe("conversor de tasas", () => {
  const lines = ["EA", "EM", "NMV", "ET", "NTV", "ED"].map((convention, i) => ({ convention, rate: "0.01", percent: ["24", "1.8088", "21.7051", "5.525", "22.1001", "0.059"][i], days_in_year: convention === "ED" ? 365 : null }));
  it("en blanco indica qué escribir y no pide nada; con la tasa muestra las equivalencias del servidor", async () => {
    mounted = await mountScreen(<RatesSimulator />, { "POST /api/fms/v1/simulators/rates": { status: 200, json: { lines, usury: { ea: "0.2568", exceeded: false } } } });
    expect(mounted.text()).toContain("Escribe una tasa para ver sus equivalentes");
    expect(mounted.mock.calls).toHaveLength(0);
    typeInto(field(mounted, "Tasa (%)"), "24");
    await settle();
    const post = mounted.mock.calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ rate: "0.24", convention: "EA", days_in_year: 365 });
    expect(post.headers.has("Idempotency-Key")).toBe(false);
    expect(mounted.text()).toContain("1,8088 %");
    expect(mounted.text()).toContain("21,7051 %");
    expect(mounted.text()).toContain("Está por debajo de la usura vigente (25,68 % E.A.)");
  });
  it("sin usura vigente lo dice y lleva a Parámetros", async () => {
    mounted = await mountScreen(<RatesSimulator />, { "POST /api/fms/v1/simulators/rates": { status: 200, json: { lines, usury: { ea: null, exceeded: null } } } });
    typeInto(field(mounted, "Tasa (%)"), "24");
    await settle();
    expect(mounted.host.querySelector('[data-testid="usury-null"] a')?.getAttribute("href")).toContain("clave=USURY_RATE_EA");
  });
});

describe("cuota fija y tabla", () => {
  const sim = {
    summary: { principal: "20000000.00", term: 36, first_payment: "723047.91", total_interest: "6029724.79", total_insurance: "0.00", upfront_fees: "0.00", total_paid: "26029724.79", total_cost: "26029724.79", financial_cost: "6029724.79", monthly_rate: "0.015", effective_annual_rate: "0.195618", cost_effective_annual_rate: "0.195618" },
    rows: Array.from({ length: 36 }, (_, i) => ({ number: i + 1, due_date: null, opening: "1.00", capital: "423047.91", interest: "300000.00", insurance: "0.00", payment: "723047.91", total: "723047.91", closing: "19576952.09" })),
    usury: { ea: "0.2568", exceeded: false },
  };
  const routes = { "POST /api/fms/v1/simulators/installment": { status: 200, json: sim } };
  async function fill(m: Mounted) {
    typeInto(field(m, "Capital inicial"), "20.000.000");
    typeInto(field(m, "Tasa (%)"), "1,5");
    typeInto(field(m, "Plazo (cuotas)"), "36");
    await settle();
  }
  it("incompleto: «Completa capital, tasa y plazo»; completo: cuota, interés total y costo total del servidor", async () => {
    mounted = await mountScreen(<InstallmentSimulator />, routes);
    expect(mounted.text()).toContain("Completa capital, tasa y plazo");
    await fill(mounted);
    expect(mounted.text()).toContain("$723.047,91");
    expect(mounted.text()).toContain("$6.029.724,79");
    expect(mounted.text()).toContain("Costo total del crédito");
    expect(mounted.host.querySelectorAll("tbody tr")).toHaveLength(12);
    click(byText(mounted.host, "button", "Mostrar las 36 cuotas"));
    expect(mounted.host.querySelectorAll("tbody tr")).toHaveLength(36);
  });
  it("plazo mayor a 600 meses: error y ninguna petición", async () => {
    mounted = await mountScreen(<InstallmentSimulator />, routes);
    typeInto(field(mounted, "Capital inicial"), "1.000.000");
    typeInto(field(mounted, "Tasa (%)"), "1");
    typeInto(field(mounted, "Plazo (cuotas)"), "601");
    await settle();
    expect(mounted.text()).toContain("El plazo máximo es de 600 meses");
    expect(mounted.mock.calls).toHaveLength(0);
  });
  it("un 422 del servidor se dice con palabras (la cuota no cubre el interés)", async () => {
    mounted = await mountScreen(<InstallmentSimulator />, { "POST /api/fms/v1/simulators/installment": { status: 422, json: { code: "invalid_loan_terms" } } });
    await fill(mounted);
    expect(mounted.text()).toContain("la cuota no cubre el interés");
  });
  it("exportar descarga el archivo de la respuesta, con la URL de objeto revocada, y manda el formato en el cuerpo", async () => {
    const created: string[] = [];
    const revoked: string[] = [];
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => (created.push("blob:1"), "blob:1"), revokeObjectURL: (u: string) => revoked.push(u) }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    mounted = await mountScreen(<InstallmentSimulator />, { ...routes, "POST /api/fms/v1/simulators/installment/export": { status: 200, body: "N,Cuota\n1,723047.91\n" } });
    await fill(mounted);
    const button = byText<HTMLButtonElement>(mounted.host, "button", "CSV");
    await wait(0);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await wait();
    const post = mounted.mock.calls.find((c) => c.url.endsWith("/export"))!;
    expect(post.body).toMatchObject({ format: "csv", principal: "20000000", term: 36 });
    expect(post.url).not.toMatch(/\?/);
    expect(created).toEqual(["blob:1"]);
    expect(revoked).toEqual(["blob:1"]);
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe("abono extra", () => {
  const scenario = (payment: string, left: number, saved: string) => ({ payment, installments_left: left, last_payment: payment, interest_left: "1.00", interest_saved: saved });
  const json = {
    after_installment: 6,
    balance: "17364601.49",
    extra: "2000000.00",
    balance_after: "15364601.49",
    none: scenario("723047.91", 30, "0.00"),
    reduce_term: scenario("723047.91", 26, "1050705.95"),
    reduce_installment: scenario("639769.53", 30, "498351.30"),
    installments_saved: 4,
  };
  it("tres columnas con el ahorro de cada una y la mejor rotulada con texto", async () => {
    mounted = await mountScreen(<ExtraPaymentSimulator />, { "POST /api/fms/v1/simulators/extra-payment": { status: 200, json } });
    typeInto(field(mounted, "Saldo del crédito"), "20.000.000");
    typeInto(field(mounted, "Tasa (%)"), "1,5");
    typeInto(field(mounted, "Plazo (cuotas)"), "36");
    typeInto(field(mounted, "Abono después de la cuota"), "6");
    typeInto(field(mounted, "Abono extra"), "2.000.000");
    await settle();
    const text = mounted.text();
    expect(text).toContain("$1.050.705,95");
    expect(text).toContain("$498.351,30");
    expect(text).toContain("$639.769,53");
    expect(text).toContain("Mayor ahorro");
    expect(text).toContain("4 cuotas antes");
    expect(mounted.host.querySelectorAll("thead th")).toHaveLength(3);
  });
});

describe("comparar alternativas", () => {
  const offer = (label: string, financial: string, cheapest: boolean) => ({
    label,
    cheapest,
    usury: { ea: null, exceeded: null },
    summary: { principal: "10000000.00", term: 24, first_payment: "500000.00", total_interest: financial, total_insurance: "0.00", upfront_fees: "0.00", total_paid: "1.00", total_cost: "1.00", financial_cost: financial, monthly_rate: "0.015", effective_annual_rate: "0.2", cost_effective_annual_rate: "0.2" },
  });
  it("marca la más barata con texto y muestra la diferencia de las otras frente a ella", async () => {
    mounted = await mountScreen(<CompareSimulator />, { "POST /api/fms/v1/simulators/compare": { status: 200, json: { offers: [offer("Banco A", "2000000.00", false), offer("Banco B", "1500000.00", true)], cheapest_index: 1 } } });
    expect(mounted.text()).toContain("Completa capital, tasa y plazo de al menos dos alternativas");
    for (const [i, name] of ["Banco A", "Banco B"].entries()) {
      const set = (label: string, value: string) => typeInto([...mounted!.host.querySelectorAll<HTMLLabelElement>("label")].filter((l) => l.textContent?.includes(label))[i].control as HTMLInputElement, value);
      set("Nombre", name);
      set("Capital inicial", "10.000.000");
      set("Tasa (%)", "20");
      set("Plazo (cuotas)", "24");
    }
    await settle();
    const post = mounted.mock.calls.find((c) => c.method === "POST")!;
    expect((post.body as { offers: unknown[] }).offers).toHaveLength(2);
    const text = mounted.text();
    expect(text).toContain("Menor costo financiero");
    expect(text).toContain("la más barata");
    expect(text).toContain("+$500.000");
  });
});

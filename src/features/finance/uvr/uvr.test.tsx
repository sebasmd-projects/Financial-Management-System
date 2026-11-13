// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { todayBogota } from "@/lib/dates";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { InstallmentsScreen } from "../credit/installments-screen";
import { InterestScreen } from "../credit/interest-screen";
import { LoanDetail } from "../loans/loan-detail";
import { LoanForm } from "../loans/loan-form";
import { LoanTable } from "../loans/loan-table";
import { LoansScreen } from "../loans/loans-screen";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/es/finanzas/creditos/loan-uvr",
}));

const today = todayBogota();
const page = (results: unknown[]) => ({ status: 200, json: { count: results.length, page: 1, page_size: 100, results } });
const INSTALLMENT = { number: 1, due_date: "2026-12-05", adjusted_due_date: "2026-12-05", capital: "100.0000", interest: "300.0000", insurance: "10.0000", charges: "0.0000", payment: "410.0000", status: "pending", movement_id: null, paid_on: null, paid_interest: null, paid_late_interest: null };
const LOAN = { id: "loan-uvr", account_id: "pas-1", name: "Hipoteca UVR", status: "active", principal: "52000.0000", balance: "20251509.20", paid_percent: 0, rate: "0.09", rate_convention: "EA", system: "french", term: 240, insurance: "10.0000", other_charges: "0.0000", kind: "mortgage", unit: "UVR", index_key: null, margin: null, installments_paid: 0, next_installment: INSTALLMENT, next_due_date: "2026-12-05", interest_start: null, interest_prepaid: "0", interest_paid_total: "0", first_period_may_vary: false, disbursement_date: "2026-11-05", first_due_date: "2026-12-05" };
const valuation = (on: string, uvr: string | null, patch: object = {}) => ({
  status: 200,
  json: { loan_id: "loan-uvr", unit: "UVR", on, units_balance: "52000.0000", uvr_value: uvr, uvr_source: "Banco de la República", peso_balance: "20251509.20", ledger_balance: "20251509.20", difference: "0.00", ...patch },
});
const ACCOUNTS = { count: 1, page: 1, page_size: 100, results: [{ id: "acc-1", name: "Ahorros", kind: "savings", status: "active", posted_balance: "5000000.00" }] };
const MISSING = { status: 422, json: { code: "index_missing", detail: "index missing" } };

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
});

describe("crédito en UVR (corte 3.3)", () => {
  const base = {
    "GET /api/fms/v1/loans/loan-uvr": { status: 200, json: LOAN },
    "GET /api/fms/v1/loans/loan-uvr/rates": { status: 200, json: { loan_id: "loan-uvr", rates: [] } },
    "GET /api/fms/v1/accounts?page_size=100": { status: 200, json: ACCOUNTS },
  };

  it("muestra el capital y la cuota en unidades, y el estimado en pesos con la UVR y la fecha usadas", async () => {
    view = await mountScreen(<LoanDetail id="loan-uvr" />, { ...base, [`GET /api/fms/v1/loans/loan-uvr/valuation?on=${today}`]: valuation(today, "389.4521") });
    const text = view.visible();
    expect(text).toContain("52.000 UVR");
    expect(view.host.querySelector("[data-testid=installment-estimate]")!.textContent).toContain("~$159.675,36");
    expect(view.host.querySelector("[data-testid=installment-estimate]")!.textContent).toContain("UVR de $389,4521");
    expect(text).toContain("410 UVR");
    const panel = view.host.querySelector("[data-testid=valuation]")!.textContent!;
    expect(panel).toContain("52.000 UVR");
    expect(panel).toContain("$389,4521");
    expect(panel).toContain("Banco de la República");
  });

  it("el saldo en pesos cambia con la UVR de la fecha consultada", async () => {
    view = await mountScreen(<LoanDetail id="loan-uvr" />, {
      ...base,
      [`GET /api/fms/v1/loans/loan-uvr/valuation?on=${today}`]: valuation(today, "389.4521"),
      "GET /api/fms/v1/loans/loan-uvr/valuation?on=2026-12-01": valuation("2026-12-01", "391.0000", { peso_balance: "20332000.00", difference: "80490.80" }),
    });
    expect(view.host.querySelector("[data-testid=valuation]")!.textContent).toContain("$20.251.509,20");
    const date = view.host.querySelector<HTMLInputElement>('section input[type="date"]')!;
    typeInto(date, "2026-12-01");
    await wait(60);
    const panel = view.host.querySelector("[data-testid=valuation]")!.textContent!;
    expect(panel).toContain("$391");
    expect(panel).toContain("$20.332.000");
    expect(panel).toContain("+$80.490,80");
    expect(view.mock.calls.some((c) => c.url.endsWith("valuation?on=2026-12-01"))).toBe(true);
  });

  it("sin UVR en esa fecha NO inventa un cero: dice «monto por definir (falta la UVR)» y enlaza a registrarla", async () => {
    view = await mountScreen(<LoanDetail id="loan-uvr" />, { ...base, [`GET /api/fms/v1/loans/loan-uvr/valuation?on=${today}`]: MISSING });
    const text = view.visible();
    expect(text).toContain("monto por definir (falta la UVR)");
    expect(text).toContain("No hay UVR registrada para el");
    expect(view.host.querySelector("[data-testid=valuation]")).toBeNull();
    expect(view.host.querySelector("[data-testid=installment-estimate]")!.textContent).toContain("monto por definir");
    expect(view.host.querySelector("[data-testid=installment-estimate]")!.textContent).not.toContain("$0");
    const links = [...view.host.querySelectorAll("a")].filter((a) => a.getAttribute("href") === "/es/finanzas/configuracion/parametros?clave=UVR_VALUE");
    expect(links.length).toBeGreaterThanOrEqual(2);
  });

  it("poner al día el libro asienta la diferencia con la UVR consultada, con Idempotency-Key", async () => {
    view = await mountScreen(<LoanDetail id="loan-uvr" />, {
      ...base,
      [`GET /api/fms/v1/loans/loan-uvr/valuation?on=${today}`]: valuation(today, "391.0000", { peso_balance: "20332000.00", difference: "80490.80" }),
      "POST /api/fms/v1/loans/loan-uvr/revalue": { status: 201, json: {} },
    });
    click(byText(view.host, "button", "Poner al día el libro"));
    await wait();
    const post = view.mock.calls.find((c) => c.url.endsWith("/revalue"))!;
    expect(post.body).toEqual({ on: today });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(view.visible()).toContain("el saldo del libro quedó al día");
  });

  it("pagar una cuota en UVR no manda el reparto (se paga en pesos con la UVR de la fecha), solo cuenta y fecha", async () => {
    view = await mountScreen(<LoanDetail id="loan-uvr" />, {
      ...base,
      [`GET /api/fms/v1/loans/loan-uvr/valuation?on=${today}`]: valuation(today, "389.4521"),
      "POST /api/fms/v1/loans/loan-uvr/installments/1/pay": { status: 201, json: {} },
    });
    click(byText(view.host, "button", "Pagar cuota"));
    await wait();
    const dialog = view.host.querySelector("dialog[open]")!;
    expect(dialog.querySelector("[data-testid=uvr-installment]")!.textContent).toContain("410 UVR");
    expect(dialog.textContent).toContain("~$159.675,36");
    click(byText(dialog, "button", "Pagar cuota"));
    await wait();
    const post = view.mock.calls.find((c) => c.url.endsWith("/installments/1/pay"))!;
    expect(post.body).toEqual({ from_account_id: "acc-1", date: today });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("pagar sin UVR de la fecha: no se puede enviar y se enlaza a registrarla", async () => {
    view = await mountScreen(<LoanDetail id="loan-uvr" />, { ...base, [`GET /api/fms/v1/loans/loan-uvr/valuation?on=${today}`]: MISSING });
    click(byText(view.host, "button", "Pagar cuota"));
    await wait();
    const dialog = view.host.querySelector("dialog[open]")!;
    expect(dialog.textContent).toContain("monto por definir (falta la UVR)");
    expect(byText<HTMLButtonElement>(dialog, "button", "Pagar cuota").disabled).toBe(true);
    expect(dialog.querySelector('a[href$="clave=UVR_VALUE"]')).not.toBeNull();
  });

  it("la tabla en unidades trae una columna de pesos estimados con la UVR de la fecha elegida", async () => {
    view = await mountScreen(<LoanTable id="loan-uvr" />, {
      "GET /api/fms/v1/loans/loan-uvr": { status: 200, json: LOAN },
      "GET /api/fms/v1/loans/loan-uvr/schedule": { status: 200, json: { loan_id: "loan-uvr", installments: [INSTALLMENT, { ...INSTALLMENT, number: 2, status: "paid", paid_on: "2027-01-05" }] } },
      [`GET /api/fms/v1/loans/loan-uvr/valuation?on=${today}`]: valuation(today, "389.4521"),
    });
    const text = view.visible();
    expect(text).toContain("Estimado en pesos");
    expect(text).toContain("410 UVR");
    expect(text).toContain("~$159.675,36");
    expect(view.host.querySelector("[data-testid=uvr-used]")!.textContent).toContain("UVR de $389,4521 del");
    // la cuota ya pagada no se re-estima
    const rows = [...view.host.querySelectorAll("tbody tr")];
    expect(rows[1].textContent).toContain("—");
  });
});

describe("listas con créditos en UVR", () => {
  it("el listado de préstamos pone el capital en unidades y la insignia UVR", async () => {
    view = await mountScreen(<LoansScreen />, { "GET /api/fms/v1/loans?page_size=100": page([LOAN]) });
    const text = view.visible();
    expect(text).toContain("52.000 UVR");
    expect(text).toContain("410 UVR");
    expect(view.host.querySelector(".badge--info")!.textContent).toBe("UVR");
  });

  it("Cuotas: en UVR muestra unidades y el estimado en pesos con la fecha de la UVR; sin UVR, «monto por definir» y nunca $0", async () => {
    const row = { kind: "loan", obligation_id: "loan-uvr", obligation_name: "Hipoteca UVR", number: 1, due_date: "2026-12-05", capital: "100.0000", interest: "300.0000", insurance: "10.0000", charges: "0.0000", total: "410.0000", state: "open", movement_id: null, unit: "UVR" };
    view = await mountScreen(<InstallmentsScreen />, {
      "GET /api/fms/v1/credit/installments?page_size=50&state=open&page=1": {
        status: 200,
        json: { count: 2, page: 1, page_size: 50, results: [{ ...row, peso_total: "159675.36", uvr_value: "389.4521", uvr_on: "2026-11-11", index_missing: false }, { ...row, number: 2, peso_total: null, uvr_value: null, uvr_on: null, index_missing: true }] },
      },
    });
    const items = [...view.host.querySelectorAll("li")];
    expect(items[0].textContent).toContain("~$159.675,36");
    expect(items[0].textContent).toContain("410 UVR");
    expect(items[0].textContent).toContain("UVR de $389,4521 del 11/11/2026");
    expect(items[1].textContent).toContain("monto por definir (falta la UVR)");
    expect(items[1].textContent).not.toContain("~$0");
    expect(items[1].textContent).toContain("Sin UVR vigente");
  });

  it("Intereses: el interés de un crédito en UVR sin UVR vigente es «monto por definir», no 0; trae el aviso", async () => {
    const data = {
      date_from: "2026-01-01",
      date_to: "2026-11-11",
      rows: [
        { month: "2026-10-01", obligation_id: "loan-uvr", obligation_name: "Hipoteca UVR", kind: "loan", interest: null, late_interest: "0.00", unit: "UVR", interest_units: "300.0000", uvr_on: null, index_missing: true },
        { month: "2026-09-01", obligation_id: "loan-2", obligation_name: "Libre inversión", kind: "loan", interest: "260469.02", late_interest: "0.00", unit: "COP", interest_units: null, uvr_on: null, index_missing: false },
      ],
      obligations: [],
      total_interest: "260469.02",
      total_late_interest: "0.00",
      notices: [{ code: "index_missing", key: "UVR_VALUE" }],
    };
    view = await mountScreen(<InterestScreen />, { "GET /api/fms/v1/credit/interest": { status: 200, json: data } });
    const rows = [...view.host.querySelectorAll("tbody tr")];
    expect(rows[0].textContent).toContain("monto por definir (falta la UVR)");
    expect(rows[0].textContent).toContain("300 UVR");
    expect(rows[1].textContent).toContain("$260.469,02");
    expect(view.host.querySelector('a[href$="clave=UVR_VALUE"]')).not.toBeNull();
  });
});

describe("alta de un crédito en UVR y de tasa variable", () => {
  const routes = {
    "GET /api/fms/v1/accounts?page_size=100": { status: 200, json: ACCOUNTS },
    "GET /api/fms/v1/institutions": { status: 200, json: [] },
    "POST /api/fms/v1/loans": { status: 201, json: LOAN },
  };
  const field = (m: Mounted, label: string) => byText<HTMLLabelElement>(m.host.querySelector("form")!, "label", label).control as HTMLInputElement;

  it("UVR: el capital va en unidades (con 4 decimales como mucho) y la unidad se envía", async () => {
    view = await mountScreen(<LoanForm onDone={() => undefined} onCancel={() => undefined} />, routes);
    typeInto(field(view, "Unidad del crédito") as unknown as HTMLInputElement, "UVR");
    await wait();
    typeInto(field(view, "Nombre"), "Hipoteca UVR");
    typeInto(field(view, "Capital (en unidades UVR)"), "52.000");
    expect(view.visible()).toContain("52.000 UVR");
    typeInto(field(view, "Tasa (%)"), "9");
    typeInto(field(view, "Plazo (cuotas)"), "240");
    typeInto(field(view, "Primer vencimiento"), "2026-12-05");
    click(view.host.querySelector('button[type="submit"]'));
    await wait();
    const post = view.mock.calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ unit: "UVR", principal: "52000", rate: "0.09", rate_convention: "EM", term: 240 });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(JSON.stringify(post.body)).not.toContain("index_key");
  });

  it("tasa variable: índice + margen (fracción); la tasa fija se ignora y la convención es EA", async () => {
    view = await mountScreen(<LoanForm onDone={() => undefined} onCancel={() => undefined} />, routes);
    typeInto(field(view, "Tipo de tasa") as unknown as HTMLInputElement, "variable");
    await wait();
    typeInto(field(view, "Nombre"), "Libre variable");
    typeInto(field(view, "Capital inicial"), "10.000.000");
    typeInto(field(view, "Índice") as unknown as HTMLInputElement, "IBR_EA");
    typeInto(field(view, "Margen (% E.A.)"), "5");
    typeInto(field(view, "Plazo (cuotas)"), "36");
    typeInto(field(view, "Primer vencimiento"), "2026-12-05");
    click(view.host.querySelector('button[type="submit"]'));
    await wait();
    const post = view.mock.calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ principal: "10000000", index_key: "IBR_EA", margin: "0.05", rate: "0", rate_convention: "EA" });
    expect(post.body).not.toHaveProperty("unit");
  });

  it("sin el índice en la fecha de desembolso el servidor responde index_missing: el mensaje enlaza a registrarlo", async () => {
    view = await mountScreen(<LoanForm onDone={() => undefined} onCancel={() => undefined} />, { ...routes, "POST /api/fms/v1/loans": MISSING });
    typeInto(field(view, "Tipo de tasa") as unknown as HTMLInputElement, "variable");
    await wait();
    typeInto(field(view, "Nombre"), "Libre variable");
    typeInto(field(view, "Capital inicial"), "10.000.000");
    typeInto(field(view, "Margen (% E.A.)"), "5");
    typeInto(field(view, "Plazo (cuotas)"), "36");
    typeInto(field(view, "Primer vencimiento"), "2026-12-05");
    click(view.host.querySelector('button[type="submit"]'));
    await wait();
    expect(view.visible()).toContain("Falta el valor de la UVR (o del índice) en esa fecha");
    expect([...view.host.querySelectorAll("a")].some((a) => a.getAttribute("href") === "/es/finanzas/configuracion/parametros?clave=DTF_EA")).toBe(true);
  });
});

describe("tasa variable en el detalle", () => {
  const VARIABLE = { ...LOAN, id: "loan-var", name: "Libre variable", unit: "COP", principal: "10000000.00", insurance: "0.00", other_charges: "0.00", index_key: "DTF_EA", margin: "0.0500", next_installment: { ...INSTALLMENT, capital: "250000.00", interest: "150000.00", insurance: "0.00", payment: "400000.00" } };
  it("muestra índice + margen y «Reajustar» manda solo la fecha, con Idempotency-Key", async () => {
    view = await mountScreen(<LoanDetail id="loan-var" />, {
      "GET /api/fms/v1/loans/loan-var": { status: 200, json: VARIABLE },
      "GET /api/fms/v1/loans/loan-var/rates": { status: 200, json: { loan_id: "loan-var", rates: [] } },
      "POST /api/fms/v1/loans/loan-var/reprice": { status: 201, json: { loan_id: "loan-var", rates: [] } },
    });
    expect(view.visible()).toContain("DTF (E.A.) + 5 %");
    click(byText(view.host, "button", "Reajustar la tasa"));
    await wait();
    const post = view.mock.calls.find((c) => c.url.endsWith("/reprice"))!;
    expect(post.body).toEqual({ on: today });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(view.visible()).toContain("la tasa quedó reajustada");
  });
  it("si falta el índice, el error enlaza a registrar el valor del índice (no de la UVR)", async () => {
    view = await mountScreen(<LoanDetail id="loan-var" />, {
      "GET /api/fms/v1/loans/loan-var": { status: 200, json: VARIABLE },
      "GET /api/fms/v1/loans/loan-var/rates": { status: 200, json: { loan_id: "loan-var", rates: [] } },
      "POST /api/fms/v1/loans/loan-var/reprice": MISSING,
    });
    click(byText(view.host, "button", "Reajustar la tasa"));
    await wait();
    expect(view.visible()).toContain("Falta el valor de la UVR (o del índice)");
    expect(view.host.querySelectorAll('a[href$="clave=DTF_EA"]').length).toBeGreaterThanOrEqual(1);
  });
});

describe("registrar la serie de la UVR con su fuente (corte 3.3)", () => {
  const CATALOG = [{ key: "UVR_VALUE", label: "UVR (valor en pesos)", unit: "amount", description: "Unidad de Valor Real.", seeded: false, scope: "user", value: "389.4521", valid_from: "2026-11-01", valid_to: null, source: "Banco de la República", gap_from: null }];
  const MINE = [{ id: "p1", key: "UVR_VALUE", value: "389.4521", valid_from: "2026-11-01", valid_to: null, source: "Banco de la República" }];
  const routes = {
    "GET /api/fms/v1/loans/loan-uvr": { status: 200, json: LOAN },
    "GET /api/fms/v1/loans/loan-uvr/rates": { status: 200, json: { loan_id: "loan-uvr", rates: [] } },
    [`GET /api/fms/v1/loans/loan-uvr/valuation?on=${today}`]: valuation(today, "389.4521"),
    "GET /api/fms/v1/parameters/catalog": { status: 200, json: CATALOG },
    "GET /api/fms/v1/parameters?key=UVR_VALUE": { status: 200, json: [] },
    "GET /api/fms/v1/user-parameters?key=UVR_VALUE": { status: 200, json: MINE },
    "POST /api/fms/v1/user-parameters": { status: 201, json: MINE[0] },
  };

  it("la serie se ve con sus decimales y su fuente, y un valor nuevo exige la fuente y conserva los 4 decimales", async () => {
    view = await mountScreen(<LoanDetail id="loan-uvr" />, routes);
    click(byText(view.host, "button", "Valores de la UVR"));
    await wait(60);
    const dialog = view.host.querySelector("dialog[open]")!;
    expect(dialog.textContent).toContain("$389,4521");
    expect(dialog.textContent).toContain("Banco de la República");
    click(byText(dialog, "button", "Agregar vigencia"));
    await wait();
    const form = dialog.querySelector("form")!;
    const text = [...form.querySelectorAll<HTMLInputElement>("input[type=text]")];
    typeInto(text[0], "391,2345");
    typeInto(form.querySelector<HTMLInputElement>("input[type=date]")!, "2026-12-01");
    click(byText(form, "button", "Guardar"));
    await wait();
    // sin fuente no se envía
    expect(view.mock.calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(dialog.textContent).toContain("Escribe la fuente del valor.");
    typeInto(form.querySelector("textarea")!, "Resolución del Banco de la República");
    click(byText(form, "button", "Guardar"));
    await wait();
    const post = view.mock.calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ key: "UVR_VALUE", value: "391.2345", valid_from: "2026-12-01", source: "Resolución del Banco de la República" });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(post.url).not.toMatch(/391/);
  });
});

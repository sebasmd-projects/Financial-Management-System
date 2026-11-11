// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { todayBogota } from "@/lib/dates";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { LoanForm } from "../loans/loan-form";
import { DebtsScreen } from "./debts-screen";
import { InstallmentsScreen } from "./installments-screen";
import { InterestScreen } from "./interest-screen";
import { LatePanel } from "./late-panel";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas" }));

const today = todayBogota();
const ACCOUNTS = { count: 1, page: 1, page_size: 100, results: [{ id: "acc-1", name: "Ahorros", kind: "savings", status: "active", posted_balance: "5000000.00" }] };
const DEBT = { id: "debt-1", account_id: "pas-1", direction: "owed", person: "Camilo", principal: "500000.00", balance: "300000.00", paid_percent: 40, agreed_date: "2026-10-02", due_date: "2026-12-02", overdue: false, note: null, remind_on: null, remind_every_days: null, status: "open" };
const page = <T,>(results: T[]) => ({ count: results.length, page: 1, page_size: 100, results });

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.unstubAllGlobals();
});

describe("deudas personales", () => {
  const routes = {
    "GET /api/fms/v1/debts/summary": { status: 200, json: { i_owe: "120000.00", they_owe_me: "300000.00" } },
    "GET /api/fms/v1/debts?page_size=100&direction=owed&status=open": { status: 200, json: page([DEBT]) },
    "GET /api/fms/v1/accounts?page_size=100": { status: 200, json: ACCOUNTS },
  };

  it("lista «Me deben» con saldo y avance, y el resumen de las dos direcciones", async () => {
    mounted = await mountScreen(<DebtsScreen />, routes);
    const text = mounted.text();
    expect(text).toContain("Camilo");
    expect(text).toContain("$300.000");
    expect(text).toContain("Me deben");
    expect(text).toContain("$120.000");
    expect(mounted.host.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("40");
  });

  it("un abono de quien te debe: explica que baja «Me deben», envía una Idempotency-Key y no pone montos en la URL", async () => {
    mounted = await mountScreen(<DebtsScreen />, { ...routes, "POST /api/fms/v1/debts/debt-1/payments": { status: 201, json: { id: "mov-1" } } });
    click(byText(mounted.host, "button", "Registrar abono"));
    await wait();
    const dialog = [...mounted.host.querySelectorAll("dialog")].find((d) => d.textContent?.includes("Camilo te paga"))!;
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain("no un ingreso");
    typeInto(dialog.querySelector('input[inputmode="decimal"]')!, "100.000");
    click(dialog.querySelector('button[type="submit"]'));
    await wait();
    const post = mounted.mock.calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/fms/v1/debts/debt-1/payments");
    expect(post.body).toMatchObject({ amount: "100000", account_id: "acc-1", date: today });
    expect(post.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    for (const call of mounted.mock.calls) expect(call.url).not.toMatch(/100000|300000/);
  });

  it("recordar muestra el texto que arma el servidor para compartir", async () => {
    mounted = await mountScreen(<DebtsScreen />, { ...routes, "GET /api/fms/v1/debts/debt-1/reminder?locale=es": { status: 200, json: { text: "Hola, Camilo: te recuerdo los $300.000 del 02/10." } } });
    click(byText(mounted.host, "article button", "Recordar"));
    await wait();
    expect(mounted.host.querySelector('[data-testid="reminder-text"]')?.textContent).toBe("Hola, Camilo: te recuerdo los $300.000 del 02/10.");
  });

  it("sin deudas: estado vacío, nunca datos inventados", async () => {
    mounted = await mountScreen(<DebtsScreen />, { ...routes, "GET /api/fms/v1/debts?page_size=100&direction=owed&status=open": { status: 200, json: page([]) } });
    expect(mounted.text()).toContain("Nadie te debe por ahora");
    expect(mounted.host.querySelector("article")).toBeNull();
  });
});

describe("intereses y usura", () => {
  const base = {
    date_from: "2026-06-01",
    date_to: today,
    rows: [{ month: "2026-10-01", obligation_id: "loan-1", obligation_name: "Davivienda", kind: "loan", interest: "260469.02", late_interest: "0.00" }],
    total_interest: "260469.02",
    total_late_interest: "0.00",
  };
  it("sin usura vigente (null): lo dice y lleva a Parámetros, sin suponer un valor", async () => {
    mounted = await mountScreen(<InterestScreen />, {
      "GET /api/fms/v1/credit/interest": { status: 200, json: { ...base, obligations: [{ obligation_id: "loan-1", obligation_name: "Davivienda", kind: "loan", rate: "0.015", convention: "EM", rate_ea: "0.195618", usury_ea: null, above_usury: null }] } },
    });
    const note = mounted.host.querySelector('[data-testid="usury-null"]')!;
    expect(note.textContent).toContain("No hay una tasa de usura vigente");
    expect(note.querySelector("a")?.getAttribute("href")).toBe("/es/finanzas/configuracion/parametros?clave=USURY_RATE_EA");
    expect(mounted.text()).toContain("19,56 % E.A.");
    expect(mounted.text()).toContain("$260.469,02");
  });
  it("por encima de la usura: aviso con texto, no solo color", async () => {
    mounted = await mountScreen(<InterestScreen />, {
      "GET /api/fms/v1/credit/interest": { status: 200, json: { ...base, obligations: [{ obligation_id: "loan-1", obligation_name: "Davivienda", kind: "loan", rate: "0.04", convention: "EM", rate_ea: "0.601", usury_ea: "0.2568", above_usury: true }] } },
    });
    expect(mounted.text()).toContain("Supera la tasa de usura vigente");
    expect(mounted.text()).toContain("25,68 % E.A.");
  });
});

describe("mora", () => {
  it("rate_missing: aviso claro con enlace a Parámetros y ninguna cifra de mora", async () => {
    mounted = await mountScreen(<LatePanel loanId="loan-1" />, {
      [`GET /api/fms/v1/loans/loan-1/late?on=${today}`]: { status: 200, json: { on: today, rate_missing: true, rate_ea: null, source: null, rows: [{ number: 3, due_date: "2026-09-20", days_late: 52, capital: "460000.00", late_interest: null }], total: null } },
    });
    expect(mounted.text()).toContain("Falta la tasa de mora");
    expect(mounted.host.querySelector("a")?.getAttribute("href")).toBe("/es/finanzas/configuracion/parametros?clave=LATE_INTEREST_EA");
    expect(mounted.host.querySelector("table")).toBeNull();
  });
  it("con tasa: el interés de mora va rotulado como estimado", async () => {
    mounted = await mountScreen(<LatePanel loanId="loan-1" />, {
      [`GET /api/fms/v1/loans/loan-1/late?on=${today}`]: { status: 200, json: { on: today, rate_missing: false, rate_ea: "0.25", source: "loan", rows: [{ number: 3, due_date: "2026-09-20", days_late: 52, capital: "460000.00", late_interest: "14937.10" }], total: "14937.10" } },
    });
    expect(mounted.text()).toContain("estimado");
    expect(mounted.text()).toContain("~$14.937,10");
  });
});

describe("cuotas", () => {
  it("junta cuotas de préstamos y de compras a cuotas con tarjeta, y enlaza a cada obligación", async () => {
    const row = { obligation_name: "Davivienda", number: 7, due_date: today, capital: "462578.88", interest: "260469.02", insurance: "12000.00", charges: "0.00", total: "735047.90", state: "overdue", movement_id: null };
    mounted = await mountScreen(<InstallmentsScreen />, {
      "GET /api/fms/v1/credit/installments?page_size=50&state=open&page=1": {
        status: 200,
        json: { count: 2, page: 1, page_size: 50, results: [{ ...row, kind: "loan", obligation_id: "loan-1" }, { ...row, kind: "card_plan", obligation_id: "card-1", obligation_name: "Visa", total: "200000.00", state: "billed" }] },
      },
    });
    const links = [...mounted.host.querySelectorAll("ul a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual(["/es/finanzas/creditos/loan-1", "/es/finanzas/tarjetas/card-1"]);
    expect(mounted.text()).toContain("Compra a cuotas");
    expect(mounted.text()).toContain("Vencidas");
    expect(mounted.text()).toContain("$735.047,90");
  });
  it("junta cuotas de préstamos y de compras a cuotas, y enlaza a cada obligación", async () => {
    mounted = await mountScreen(<InstallmentsScreen />, {
      "GET /api/fms/v1/credit/installments?page_size=50&state=open&page=1": { status: 200, json: { count: 0, page: 1, page_size: 50, results: [] } },
    });
    expect(mounted.text()).toContain("No hay cuotas en esta vista");
  });
});

describe("alta de préstamo con tabla personalizada", () => {
  const routes = {
    "GET /api/fms/v1/accounts?page_size=100": { status: 200, json: ACCOUNTS },
    "GET /api/fms/v1/institutions": { status: 200, json: [] },
    "POST /api/fms/v1/loans": { status: 201, json: { id: "loan-1" } },
  };
  async function fill(m: Mounted, capitals: string) {
    const form = m.host.querySelector("form")!;
    const field = (label: string) => byText<HTMLLabelElement>(form, "label", label).control as HTMLInputElement;
    typeInto(field("Nombre"), "Préstamo amigo");
    typeInto(field("Capital inicial"), "1.000.000");
    typeInto(field("Tasa (%)"), "1,5");
    typeInto(field("Plazo (cuotas)"), "3");
    typeInto(field("Primer vencimiento"), "2026-12-20");
    typeInto(field("Sistema de amortización") as unknown as HTMLInputElement, "custom");
    await wait();
    typeInto(form.querySelector("textarea")!, capitals);
    click(form.querySelector('button[type="submit"]'));
    await wait();
  }
  it("si los capitales no suman el capital inicial, no envía y lo dice", async () => {
    mounted = await mountScreen(<LoanForm onDone={() => undefined} onCancel={() => undefined} />, routes);
    await fill(mounted, "300.000\n300.000\n300.000");
    expect(mounted.mock.calls.some((c) => c.method === "POST")).toBe(false);
    expect(mounted.text()).toContain("deben sumar exactamente el capital inicial");
  });
  it("con la suma exacta envía custom_capitals con su Idempotency-Key", async () => {
    mounted = await mountScreen(<LoanForm onDone={() => undefined} onCancel={() => undefined} />, routes);
    await fill(mounted, "300.000\n300.000\n400.000");
    const post = mounted.mock.calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ system: "custom", custom_capitals: ["300000", "300000", "400000"], principal: "1000000", rate: "0.015", rate_convention: "EM", term: 3 });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
  });
});

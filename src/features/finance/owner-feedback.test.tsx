// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { todayBogota } from "@/lib/dates";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CardEditForm } from "./cards/card-edit";
import { Money } from "./kit";
import { LatePanel } from "./credit/late-panel";
import { disambiguate, defaultFirst, movementAccounts, setAccountKindLabels } from "./helpers";
import { LoanEditForm } from "./loans/loan-edit";
import { LoansSection } from "./loans/loans-section";
import { PrepaidInterestPanel } from "./loans/interest-panel";
import { LoanForm } from "./loans/loan-form";
import { RemoveDialog } from "./shared/remove";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas" }));

const page = <T,>(results: T[]) => ({ count: results.length, page: 1, page_size: 100, results });
const INSTALLMENT = { number: 2, due_date: "2026-12-01", adjusted_due_date: "2026-12-01", capital: "140102.00", interest: "159118.13", insurance: "0.00", charges: "0.00", payment: "299220.13", status: "pending", movement_id: null, paid_on: null, paid_interest: null, paid_late_interest: null };
const LOAN = {
  id: "loan-1", account_id: "pas-1", name: "Nequi", status: "active", principal: "7493754.86", balance: "7493754.86", paid_percent: 0, rate: "0.0211", rate_convention: "EM", system: "french", term: 36,
  insurance: "0.00", other_charges: "0.00", kind: "personal", unit: "COP", index_key: null, margin: null, installments_paid: 1, next_installment: INSTALLMENT, next_due_date: "2026-12-01",
  interest_start: "2026-11-01", interest_prepaid: "86785.32", interest_paid_total: "86785.32", first_period_may_vary: false, disbursement_date: "2026-10-16", first_due_date: "2026-12-01",
};

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.unstubAllGlobals();
});

describe("item 1: créditos en Cuentas", () => {
  it("lista el crédito con «Debes», «Cuota N de M», la próxima cuota con fecha y el enlace al detalle", async () => {
    mounted = await mountScreen(<LoansSection />, { "GET /api/fms/v1/loans?page_size=100": { status: 200, json: page([LOAN]) } });
    const text = mounted.visible();
    expect(text).toContain("Créditos y obligaciones");
    expect(text).toContain("Nequi");
    expect(text).toContain("Debes $7.493.754,86");
    expect(text).toContain("Cuota 2 de 36");
    expect(text).toContain("$299.220,13");
    expect(mounted.host.querySelector('a[href="/es/finanzas/creditos/loan-1"]')).not.toBeNull();
  });
  it("no lista los cerrados", async () => {
    mounted = await mountScreen(<LoansSection />, { "GET /api/fms/v1/loans?page_size=100": { status: 200, json: page([{ ...LOAN, status: "closed" }]) } });
    expect(mounted.visible()).toContain("Aún no tienes créditos");
  });
});

describe("item 2: eliminar con las reglas del libro", () => {
  it("pide confirmación y borra con DELETE", async () => {
    const done = vi.fn();
    mounted = await mountScreen(<RemoveDialog open name="Nequi" deletePath="/loans/loan-1" closePath="/loans/loan-1" onClose={() => undefined} onDone={done} />, { "DELETE /api/fms/v1/loans/loan-1": { status: 204 } });
    expect(document.querySelector("dialog")?.textContent).toContain("¿Eliminar «Nequi»?");
    click(byText(document.body, "button", "Sí, eliminar"));
    await wait();
    expect(mounted.mock.calls.map((c) => c.method)).toEqual(["DELETE"]);
    expect(done).toHaveBeenCalled();
  });
  it("con historia (409 has_history) no borra: lo explica y ofrece Archivar / Cerrar", async () => {
    const done = vi.fn();
    mounted = await mountScreen(<RemoveDialog open name="Nequi" deletePath="/loans/loan-1" closePath="/loans/loan-1" onClose={() => undefined} onDone={done} />, {
      "DELETE /api/fms/v1/loans/loan-1": { status: 409, json: { code: "has_history", detail: "x" } },
      "PATCH /api/fms/v1/loans/loan-1": { status: 200, json: LOAN },
    });
    click(byText(document.body, "button", "Sí, eliminar"));
    await wait();
    const dialog = document.querySelector("dialog")?.textContent ?? "";
    expect(dialog).toContain("No se puede eliminar");
    expect(dialog).toContain("el libro no se borra");
    expect(done).not.toHaveBeenCalled();
    click(byText(document.body, "button", "Archivar / Cerrar"));
    await wait();
    const patch = mounted.mock.calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toEqual({ status: "closed" });
    expect(patch?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(done).toHaveBeenCalled();
  });
  it("cerrar con saldo muestra por qué no se puede", async () => {
    mounted = await mountScreen(<RemoveDialog open name="Nequi" deletePath="/loans/loan-1" closePath="/loans/loan-1" onClose={() => undefined} onDone={() => undefined} />, {
      "DELETE /api/fms/v1/loans/loan-1": { status: 409, json: { code: "has_history" } },
      "PATCH /api/fms/v1/loans/loan-1": { status: 409, json: { code: "balance_not_zero" } },
    });
    click(byText(document.body, "button", "Sí, eliminar"));
    await wait();
    click(byText(document.body, "button", "Archivar / Cerrar"));
    await wait();
    expect(document.querySelector("dialog")?.textContent).toContain("el saldo tiene que ser cero");
  });
});

describe("item 2 y 3: editar el crédito y la cuota del banco", () => {
  it("edita el seguro y manda solo lo que cambió con Idempotency-Key", async () => {
    const done = vi.fn();
    mounted = await mountScreen(<LoanEditForm loan={LOAN as never} onCancel={() => undefined} onDone={done} />, { "PATCH /api/fms/v1/loans/loan-1": { status: 200, json: LOAN } });
    const insurance = [...mounted.host.querySelectorAll<HTMLInputElement>("input")].find((i) => i.labels?.[0]?.textContent?.includes("Seguro"));
    typeInto(insurance!, "8694,36");
    click(byText(mounted.host, "button", "Guardar cambios"));
    await wait();
    const patch = mounted.mock.calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toEqual({ insurance: "8694.36" });
    expect(patch?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(done).toHaveBeenCalled();
  });
  it("con la cuota del banco $307.914,49 muestra el extra $8.694,36 y lo guarda como seguro y cargos", async () => {
    mounted = await mountScreen(<LoanEditForm loan={LOAN as never} onCancel={() => undefined} onDone={() => undefined} />, {
      "POST /api/fms/v1/simulators/bank-installment": { status: 200, json: { principal_interest: "299220.13", implied_extra: "8694.36" } },
      "PATCH /api/fms/v1/loans/loan-1": { status: 200, json: LOAN },
    });
    const bank = [...mounted.host.querySelectorAll<HTMLInputElement>("input")].find((i) => i.labels?.[0]?.textContent?.includes("Cuota que te cobra el banco"));
    typeInto(bank!, "307914,49");
    await wait(500);
    const quote = mounted.mock.calls.find((c) => c.url.endsWith("/simulators/bank-installment"));
    expect(quote?.body).toEqual({ bank_installment: "307914.49", loan_id: "loan-1" });
    expect(mounted.visible()).toContain("$8.694,36");
    click(byText(mounted.host, "button", "Guardar como seguro y otros cargos mensuales"));
    await wait();
    expect(mounted.mock.calls.find((c) => c.method === "PATCH")?.body).toEqual({ insurance: "8694.36", other_charges: "0" });
  });
  it("el alta manda bank_installment e interest_start", async () => {
    mounted = await mountScreen(<LoanForm onCancel={() => undefined} onDone={() => undefined} />, {
      "GET /api/fms/v1/accounts?page_size=100": { status: 200, json: page([]) },
      "GET /api/fms/v1/institutions": { status: 200, json: [] },
      "POST /api/fms/v1/simulators/bank-installment": { status: 200, json: { principal_interest: "299220.13", implied_extra: "8694.36" } },
      "POST /api/fms/v1/loans": { status: 201, json: LOAN },
    });
    const field = (label: string) => [...mounted!.host.querySelectorAll<HTMLInputElement>("input")].find((i) => i.labels?.[0]?.textContent?.includes(label))!;
    typeInto(field("Nombre"), "Nequi");
    typeInto(field("Capital inicial"), "7493754,86");
    typeInto(field("Tasa (%)"), "2,11");
    typeInto(field("Plazo (cuotas)"), "36");
    typeInto(field("Fecha de desembolso"), "2026-10-16");
    typeInto(field("Primer vencimiento"), "2026-12-01");
    typeInto(field("Los intereses corren desde"), "2026-11-01");
    typeInto(field("Cuota que te cobra el banco"), "307914,49");
    await wait(500);
    expect(mounted.visible()).toContain("$8.694,36");
    click(byText(mounted.host, "button", "Crear crédito"));
    await wait();
    const post = mounted.mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/loans"));
    expect(post?.body).toMatchObject({ principal: "7493754.86", bank_installment: "307914.49", interest_start: "2026-11-01", first_due_date: "2026-12-01" });
    expect(post?.headers.get("Idempotency-Key")).toBeTruthy();
  });
});

describe("item 3: intereses del periodo inicial", () => {
  it("muestra los pagos aparte y los totales, y registra uno con Idempotency-Key", async () => {
    const LIST = { loan_id: "loan-1", total: "86785.32", payments: [
      { id: "p1", movement_id: "m1", date: "2026-11-03", amount: "65977.17", covers_from: "2026-10-16", covers_to: "2026-10-31" },
      { id: "p2", movement_id: "m2", date: "2026-11-04", amount: "20808.15", covers_from: "2026-10-16", covers_to: "2026-10-31" },
    ] };
    mounted = await mountScreen(<PrepaidInterestPanel loan={LOAN as never} canWrite onChanged={() => undefined} />, {
      "GET /api/fms/v1/loans/loan-1/interest-payments": { status: 200, json: LIST },
      "GET /api/fms/v1/accounts?page_size=100": { status: 200, json: page([{ id: "acc-1", name: "Nequi", kind: "wallet", status: "active", last4: null, is_default: false, posted_balance: "100000.00" }]) },
      "POST /api/fms/v1/loans/loan-1/interest-payments": { status: 201, json: LIST },
    });
    const text = mounted.visible();
    expect(text).toContain("$65.977,17");
    expect(text).toContain("$20.808,15");
    expect(text).toContain("Intereses pagados aparte");
    expect(text).toContain("$86.785,32");
    click(byText(mounted.host, "button", "Registrar pago de intereses"));
    await wait();
    const dialog = document.querySelector("dialog")!;
    typeInto([...dialog.querySelectorAll<HTMLInputElement>("input")].find((i) => i.labels?.[0]?.textContent?.includes("Monto del débito"))!, "65977,17");
    click(byText(dialog, "button", "Registrar"));
    await wait();
    const post = mounted.mock.calls.find((c) => c.method === "POST");
    expect(post?.body).toMatchObject({ amount: "65977.17", from_account_id: "acc-1", covers_from: "2026-10-16" });
    expect(post?.headers.get("Idempotency-Key")).toBeTruthy();
  });
});

describe("item 4: mora desde el préstamo", () => {
  it("sin tasa: una línea corta y la acción para registrarla ahí mismo (la fuente es opcional)", async () => {
    const today = todayBogota();
    const quote = { on: today, rate_missing: true, rate_ea: null, source: null, rows: [], total: null };
    mounted = await mountScreen(<LatePanel loanId="loan-1" />, {
      [`GET /api/fms/v1/loans/loan-1/late?on=${today}`]: { status: 200, json: quote },
      "POST /api/fms/v1/loans/loan-1/rates": { status: 201, json: { loan_id: "loan-1", rates: [] } },
    });
    expect(mounted.visible()).toContain("Sin tasa de mora registrada");
    expect(mounted.visible()).not.toContain("Falta la tasa de mora");
    expect(mounted.host.querySelector('a[href*="LATE_INTEREST_EA"]')).not.toBeNull();
    click(byText(mounted.host, "button", "Registrar tasa de mora"));
    await wait();
    const dialog = document.querySelector("dialog")!;
    typeInto([...dialog.querySelectorAll<HTMLInputElement>("input")].find((i) => i.labels?.[0]?.textContent?.includes("Tasa de mora (%)"))!, "30");
    click(byText(dialog, "button", "Registrar tasa de mora"));
    await wait();
    const post = mounted.mock.calls.find((c) => c.method === "POST");
    expect(post?.body).toEqual({ kind: "late", rate: "0.3", rate_convention: "EA", valid_from: today });
    expect(post?.headers.get("Idempotency-Key")).toBeTruthy();
  });
});

describe("item 5 y 6: nombres repetidos y predeterminada", () => {
  const accounts = [
    { id: "a", name: "Nu", kind: "savings", last4: "2395", status: "active", is_default: false, posted_balance: "0" },
    { id: "b", name: "Nu", kind: "credit_card", last4: "7048", status: "active", is_default: true, posted_balance: "0" },
    { id: "c", name: "Bancolombia", kind: "savings", last4: null, status: "active", is_default: false, posted_balance: "0" },
  ] as never[];
  it("desambigua con tipo y últimos dígitos sin tocar los nombres únicos", () => {
    setAccountKindLabels({ savings: "Ahorros", credit_card: "Tarjeta" });
    expect(disambiguate(accounts).map((a) => (a as { name: string }).name)).toEqual(["Nu · Ahorros ••2395", "Nu · Tarjeta ••7048", "Bancolombia"]);
  });
  it("la predeterminada va primero en los selectores de movimientos", () => {
    setAccountKindLabels({ savings: "Ahorros", credit_card: "Tarjeta" });
    expect(movementAccounts(accounts).map((a) => a.id)).toEqual(["b", "a", "c"]);
    expect(defaultFirst(accounts).map((a) => (a as { id: string }).id)).toEqual(["b", "a", "c"]);
  });
});

describe("item 6: tarjeta predeterminada", () => {
  it("editar la tarjeta manda is_default con Idempotency-Key y solo lo que cambió", async () => {
    const CARD = { id: "card-1", account_id: "acc-9", name: "Nu", last4: "7048", issuer: null, status: "active", is_default: false, limit: "5000000.00", used: "0.00", available: "5000000.00", utilization_percent: 0, cut_day: 10, pay_day: 25, next_cutoff: "2026-12-10", next_payment_date: "2026-12-25", rate: "0.24", rate_convention: "EA", installment_system: "constant_capital", handling_fee: "0.00", insurance: "0.00", min_payment_rate: "0.05", rate_type: "fixed", rate_reminder_days: 5 };
    mounted = await mountScreen(<CardEditForm card={CARD as never} onCancel={() => undefined} onDone={() => undefined} />, { "PATCH /api/fms/v1/cards/card-1": { status: 200, json: CARD } });
    click(mounted.host.querySelector('input[type="checkbox"]'));
    click(byText(mounted.host, "button", "Guardar cambios"));
    await wait();
    const patch = mounted.mock.calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toEqual({ is_default: true });
    expect(patch?.headers.get("Idempotency-Key")).toBeTruthy();
  });
});

describe("item 7: texto para el lector de pantalla", () => {
  it("se lee natural («7.493.754 pesos con 86 centavos») y se oculta con un recorte completo", async () => {
    mounted = await mountScreen(<Money value="7493754.86" />, {});
    expect(mounted.text()).toContain("7.493.754 pesos con 86 centavos");
    expect(mounted.visible()).toBe("$7.493.754,86");
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const rule = /\.visually-hidden\s*\{[^}]*\}/.exec(css)![0];
    for (const needle of ["position: absolute", "width: 1px", "height: 1px", "overflow: hidden", "clip: rect(0 0 0 0)", "clip-path: inset(50%)", "white-space: nowrap"]) expect(rule).toContain(needle);
  });
});

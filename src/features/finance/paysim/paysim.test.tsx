// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { CardPaymentSimulator } from "./card-pay-sim";
import { LoanPaymentSimulator } from "./loan-pay-sim";
import { OpeningPlansScreen } from "./opening-plans";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas" }));

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.unstubAllGlobals();
});
const settle = () => wait(450);
const field = (m: Mounted, label: string) => byText<HTMLLabelElement>(m.host, "label", label).control as HTMLInputElement;

const ID = "11111111-1111-4111-8111-111111111111";
const row = (number: number, payment: string, balance = "0") => ({ number, cutoff: "2026-11-30", due_date: `2026-12-${String(10 + number).padStart(2, "0")}`, total_due: "2000000", minimum_due: "320000", payment, revolving_interest: "0", installments: "125322.62", deferred_installment: "0", fees: "29900", balance_after: balance });
const params = { pay_now: null, continue_with: "total", defer_terms: null, defer_rate: null, defer_rate_convention: null, defer_scope: "statement" };
const outcome = (key: string, extra: Record<string, unknown> = {}) => ({
  key, params, notes: [], pay_now: "2000000", months: 7, payoff_date: "2027-06-20", total_paid: "2857400", total_interest: "130000", interest_revolving: "30000", interest_installments: "100000", interest_deferred: "0", fees: "29900",
  total_cost: "2857400", extra_cost: "0", peak_payment: "2000000", deferred_principal: "0", truncated: false, remaining: "0", cheapest: false, rows: [row(0, "2000000"), row(1, "167222.62")], ...extra,
});
const statement = { month: "2026-11", cutoff: "2026-11-30", due_date: "2026-12-16", closed: false, estimated: true, total_due: "2000000", minimum_due: "320000", paid_so_far: "0", installments_capital: "100000", installments_interest: "22000", revolving: "1500000", revolving_interest: "30000", fees: "29900", monthly_rate: "0.0219", rate: "0.296", rate_convention: "EA", plans_capital_after: "600000" };
const strategy = {
  card_id: ID, statement, cheapest_index: 0, skipped: [], warnings: [{ code: "rate_above_usury" }],
  assumptions: ["no_new_purchases", "paid_on_due_date"],
  strategies: [
    outcome("total", { cheapest: true }),
    outcome("minimum", { pay_now: "320000", total_interest: "862333.63", total_cost: "6998333.63", extra_cost: "4140933.63", truncated: true, remaining: "3566.00", months: 121, notes: ["raised_to_minimum"] }),
    outcome("defer", { params: { ...params, pay_now: "800000", defer_terms: 12 }, pay_now: "800000", total_interest: "300367.62", total_cost: "3207167.62", extra_cost: "349767.62", months: 13, deferred_principal: "1200000" }),
  ],
};
const target = { card_id: ID, goal: "no_interest", feasible: true, amount: "2000000", months: 7, terms: null, earliest_months: null, notes: [], outcome: outcome("total"), comparison: outcome("minimum", { total_interest: "862333.63" }), statement, assumptions: [], warnings: [] };
const card = { id: ID, name: "Visa sintética" };
const routes = {
  [`GET /api/fms/v1/cards/${ID}`]: { status: 200, json: card },
  [`POST /api/fms/v1/cards/${ID}/simulators/payment-strategy`]: { status: 200, json: strategy },
  [`POST /api/fms/v1/cards/${ID}/simulators/payment-target`]: { status: 200, json: target },
};

describe("simulador de pagos de la tarjeta", () => {
  it("compara las estrategias lado a lado, marca la más barata con texto y trae mes a mes, gráfica y supuestos", async () => {
    mounted = await mountScreen(<CardPaymentSimulator id={ID} />, routes);
    await settle();
    const post = mounted.mock.calls.find((c) => c.method === "POST" && c.url.endsWith("payment-strategy"))!;
    expect(post.body).toEqual({ continue_with: "same", defer_terms: [6, 12, 24], defer_scope: "statement", horizon_months: 120 });
    expect(post.headers.has("Idempotency-Key")).toBe(false);
    const cards = mounted.host.querySelectorAll("article.paysim-card");
    expect(cards).toHaveLength(3);
    expect(cards[0].textContent).toContain("Pagar el total");
    expect(cards[0].textContent).toContain("La más barata");
    expect(cards[1].textContent).toContain("Pagar el mínimo");
    expect(cards[1].textContent).toContain("Sin saldar en 10 años");
    expect(cards[1].textContent).toContain("Lo que escribiste es menos que el mínimo");
    expect(cards[2].textContent).toContain("Pagar $800.000 y diferir a 12 cuotas");
    expect(cards[2].textContent).toContain("$349.767,62");
    expect(cards[2].textContent).toContain("más que la más barata");
    expect(mounted.visible()).toContain("Extracto de Noviembre 2026: te falta pagar $2.000.000");
    expect(mounted.visible()).toContain("devenga a 29,6 %");
    expect(mounted.visible()).toContain("La tasa del re-pacto supera la usura");
    expect(mounted.host.querySelector("figure.chart")).not.toBeNull();
    expect(mounted.host.querySelector(".chart__table table")).not.toBeNull();
    click(byText(mounted.host, "summary", "Supuestos de esta simulación"));
    expect(mounted.visible()).toContain("No compras ni haces avances nuevos.");
  });
  it("X, la tasa propia y los plazos viajan como cadenas; un valor inválido no pide nada", async () => {
    mounted = await mountScreen(<CardPaymentSimulator id={ID} />, routes);
    await settle();
    typeInto(field(mounted, "Quiero pagar este mes"), "800.000");
    typeInto(field(mounted, "Tasa (%)"), "18");
    await settle();
    const last = mounted.mock.calls.filter((c) => c.method === "POST" && c.url.endsWith("payment-strategy")).at(-1)!;
    expect(last.body).toMatchObject({ pay_amount: "800000", defer_rate: "0.18", defer_rate_convention: "EA" });
    const before = mounted.mock.calls.length;
    typeInto(field(mounted, "Quiero pagar este mes"), "abc");
    await settle();
    expect(mounted.mock.calls.length).toBe(before);
  });
  it("las preguntas al revés: no pagar intereses contesta con el total del extracto", async () => {
    mounted = await mountScreen(<CardPaymentSimulator id={ID} />, routes);
    await settle();
    const ask = mounted.mock.calls.find((c) => c.method === "POST" && c.url.endsWith("payment-target"))!;
    expect(ask.body).toMatchObject({ goal: "no_interest" });
    expect(mounted.visible()).toContain("Para no pagar intereses del saldo, paga $2.000.000 este mes");
    expect(mounted.visible()).toContain("$862.333,63 de intereses");
  });
  it("un error del servidor se dice con palabras", async () => {
    mounted = await mountScreen(<CardPaymentSimulator id={ID} />, { ...routes, [`POST /api/fms/v1/cards/${ID}/simulators/payment-strategy`]: { status: 422, json: { code: "nothing_due" } } });
    await settle();
    expect(mounted.visible()).toContain("No hay un extracto con algo por pagar");
  });
});

describe("simulador de pagos del préstamo", () => {
  const loanOutcome = (key: string, extra: Record<string, unknown> = {}) => ({ key, extra_now: "0", installments: 30, first_payment: "723047.91", last_payment: "723047.91", total_interest: "4326835.83", interest_saved: "0", total_cost: "21691437.3", saved: "0", last_due_date: "2029-12-10", cheapest: false, rows: [], ...extra });
  const sim = {
    loan_id: ID, balance: "17364601.49", installments_left: 30, next_payment: "723047.91", rate: "0.015", rate_convention: "EM", warnings: [], assumptions: ["rate_in_force"],
    strategies: [loanOutcome("installment"), loanOutcome("reduce_term", { extra_now: "2000000", installments: 25, total_interest: "3276129.88", interest_saved: "1050705.95", saved: "1050705.95", cheapest: true }), loanOutcome("reduce_installment", { extra_now: "2000000", total_interest: "3828484.53", interest_saved: "498351.3", saved: "498351.3" })],
    finish_in: { months: 12, feasible: true, extra: "9500000", outcome: null },
  };
  it("pagar solo la cuota frente a abonar: reducir plazo o reducir cuota, y cuánto abonar para terminar en N", async () => {
    mounted = await mountScreen(<LoanPaymentSimulator id={ID} />, { [`GET /api/fms/v1/loans/${ID}`]: { status: 200, json: { id: ID, name: "Crédito libre inversión" } }, [`POST /api/fms/v1/loans/${ID}/simulators/payment-strategy`]: { status: 200, json: sim } });
    await settle();
    typeInto(field(mounted, "Abono extra a capital"), "2.000.000");
    typeInto(field(mounted, "¿Cuánto abonar para terminar en N cuotas?"), "12");
    await settle();
    const post = mounted.mock.calls.filter((c) => c.method === "POST").at(-1)!;
    expect(post.body).toEqual({ extra: "2000000", months: 12 });
    const cards = mounted.host.querySelectorAll("article.paysim-card");
    expect(cards).toHaveLength(3);
    expect(cards[1].textContent).toContain("Abonar y reducir el plazo");
    expect(cards[1].textContent).toContain("La más barata");
    expect(cards[1].textContent).toContain("$1.050.705,95");
    expect(mounted.visible()).toContain("abona $9.500.000 ahora");
  });
});

describe("compras a cuotas vigentes", () => {
  const recon = { opening_balance: "3000000", plans_capital: "1400000", revolving: "1600000", revolving_gap: "0", balance: "3000000" };
  const plan = { id: "22222222-2222-4222-8222-222222222222", movement_id: null, opening: true, description: "Nevera Samsung", remaining_principal: "1400000", date: "2026-06-15", installments: 12, billed: 5, follows_card_rate: true, purchase_value: "2400000", total_interest: "101290.46", total_real_cost: "1501290.46", next_payment: "225322.62" };
  it("muestra la cuenta saldo inicial = revolvente + capital, la lista y registra con una Idempotency-Key", async () => {
    mounted = await mountScreen(<OpeningPlansScreen id={ID} />, {
      [`GET /api/fms/v1/cards/${ID}`]: { status: 200, json: card },
      [`GET /api/fms/v1/cards/${ID}/opening-plans`]: { status: 200, json: { plans: [plan], reconciliation: recon } },
      [`POST /api/fms/v1/cards/${ID}/opening-plans`]: { status: 201, json: { plan, reconciliation: recon, first_cutoff: "2026-11-30", warnings: [] } },
    });
    await settle();
    expect(mounted.visible()).toContain("Cuadra: saldo inicial = revolvente + capital");
    expect(mounted.visible()).toContain("Nevera Samsung");
    expect(mounted.visible()).toContain("5 de 12 facturadas");
    typeInto(field(mounted, "Fecha de la compra"), "2026-06-15");
    typeInto(field(mounted, "Valor original"), "2.400.000");
    typeInto(field(mounted, "Cuotas totales"), "12");
    typeInto(field(mounted, "Cuotas ya facturadas"), "5");
    click(byText(mounted.host, "button", "Registrar"));
    await settle();
    const post = mounted.mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/opening-plans"))!;
    expect(post.body).toMatchObject({ purchase_date: "2026-06-15", original: "2400000", count: 12, billed: 5, add_to_opening: false });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(mounted.visible()).toContain("la próxima cuota se factura el");
  });
  it("avisa cuando el saldo inicial no alcanza para el capital de las compras", async () => {
    mounted = await mountScreen(<OpeningPlansScreen id={ID} />, {
      [`GET /api/fms/v1/cards/${ID}`]: { status: 200, json: card },
      [`GET /api/fms/v1/cards/${ID}/opening-plans`]: { status: 200, json: { plans: [plan], reconciliation: { ...recon, opening_balance: "500000", revolving: "0", revolving_gap: "-900000" } } },
    });
    await settle();
    expect(mounted.visible()).toContain("es $900.000 menor que el capital");
  });
});

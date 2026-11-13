// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { periodOf, shiftPeriod, todayBogota } from "@/lib/dates";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { CardRatesScreen } from "./card-rates";
import { CardList } from "./cards-screen";
import { CardPay } from "./card-pay";
import { PurchasePanel } from "./card-purchase";
import { StatementsScreen } from "./statements-screen";
import type { Card } from "@/api/models";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/es/finanzas/cuentas/credito/extractos",
}));

const today = todayBogota();
const current = periodOf(today);
const PAST = shiftPeriod(current, -1);
const NEXT = shiftPeriod(current, 1);
const NEXT2 = shiftPeriod(current, 2);
const LABELS: Record<string, string> = { "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril", "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto", "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre" };
const name = (p: string) => `${LABELS[p.slice(5)]} ${p.slice(0, 4)}`;

const entry = (cardId: string, label: string, month: string, min: string, total: string, extra: object = {}) => ({
  card_id: cardId, card_label: label, cutoff: `${month}-05`, due_date: `${month}-20`, estimated: `${month}-05` > today, carried: "0.00", total_due: total, minimum_due: min, paid_so_far: "0.00", rate_assumed: false, rate_valid_from: null, rate_outdated: false, ...extra,
});
const line = (cardId: string, label: string, month: string, extra: object = {}) => ({
  date: `${month}-05`, description: `Compra ${label}`, card_id: cardId, card_label: label, kind: "installment", installment_number: 2, installment_total: 6, amount: "150000.00", capital: "100000.00", interest: "50000.00", purchase_date: "2026-04-10", estimated: false, rate_assumed: false, ...extra,
});
const month = (m: string, cards: ReturnType<typeof entry>[], min: string, total: string, extra: object = {}) => ({
  month: m, cutoff: cards[0].cutoff, due_date: cards[0].due_date, estimated: m > current, rate_assumed: false, rate_outdated: false, total_due: total, minimum_due: min, paid_so_far: "0.00",
  cards, lines: cards.map((c) => line(c.card_id, c.card_label, m, m > current ? { estimated: true } : {})), ...extra,
});
const TIMELINE = {
  months: [
    month(PAST, [entry("visa", "Visa", PAST, "90000.00", "300000.00"), entry("nu", "Nu", PAST, "30000.00", "100000.00")], "120000.00", "400000.00"),
    month(NEXT, [entry("visa", "Visa", NEXT, "171908.34", "450000.00", { rate_assumed: true, rate_outdated: true }), entry("nu", "Nu", NEXT, "20000.00", "80000.00")], "191908.34", "530000.00", { rate_assumed: true }),
    month(NEXT2, [entry("visa", "Visa", NEXT2, "80000.00", "200000.00"), entry("nu", "Nu", NEXT2, "0.00", "0.00")], "80000.00", "200000.00"),
  ],
};
const TL = "GET /api/fms/v1/cards/statements/timeline?months_back=6";

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
});

const bar = (m: string) => view!.host.querySelector<HTMLButtonElement>(`.stm-bar[data-month="${m}"]`)!;

describe("Extractos: gráfica", () => {
  it("una barra-botón por mes con aria-label legible, el mes elegido resaltado y los proyectados marcados «estimado» sin depender del color", async () => {
    view = await mountScreen(<StatementsScreen />, { [TL]: { status: 200, json: TIMELINE } });
    expect(view.host.querySelectorAll(".stm-bar")).toHaveLength(3);
    // El mes por omisión es el primero cuyo pago aún no vence (el cerrado, que vence el 20 del mes pasado, ya pasó).
    click(bar(NEXT));
    expect(bar(NEXT).getAttribute("aria-label")).toBe(`${name(NEXT)}, pago mínimo estimado $191.908,34`);
    expect(bar(PAST).getAttribute("aria-label")).toBe(`${name(PAST)}, pago mínimo $120.000`);
    expect(bar(NEXT).getAttribute("aria-pressed")).toBe("true");
    expect(bar(PAST).getAttribute("aria-pressed")).toBe("false");
    expect(bar(NEXT).classList.contains("stm-bar--estimated")).toBe(true);
    expect(bar(PAST).classList.contains("stm-bar--estimated")).toBe(false);
    expect(bar(NEXT).textContent).toContain("estimado");
    expect(bar(PAST).textContent).not.toContain("estimado");
    // La más alta mide 100 %.
    expect(bar(NEXT).querySelector<HTMLElement>(".stm-bar__fill")!.style.height).toBe("100%");
    expect(view.visible()).toContain("Este es tu pago mínimo estimado");
    expect(view.host.querySelector('[data-testid="stm-minimum"]')!.textContent).toContain("$191.908,34");
  });

  it("elegir un mes cambia el resumen: «Pago mínimo» (cerrado) y fechas de corte y límite", async () => {
    view = await mountScreen(<StatementsScreen />, { [TL]: { status: 200, json: TIMELINE } });
    click(bar(PAST));
    expect(view.visible()).toContain("Pago mínimo");
    expect(view.visible()).not.toContain("Este es tu pago mínimo estimado");
    expect(view.host.querySelector('[data-testid="stm-minimum"]')!.textContent).toContain("$120.000");
    expect(view.visible()).toContain("Deuda total al corte");
    expect(view.visible()).toContain("Fecha límite de pago");
    expect(view.visible()).toContain(`05/${PAST.slice(5)}/${PAST.slice(0, 4)}`);
  });

  it("flechas del teclado mueven la selección y «Gráfica» alterna a la tabla equivalente", async () => {
    view = await mountScreen(<StatementsScreen />, { [TL]: { status: 200, json: TIMELINE } });
    click(bar(PAST));
    act(() => bar(PAST).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(bar(NEXT).getAttribute("aria-pressed")).toBe("true");
    click(byText(view.host, "button.stm-toggle", "Gráfica"));
    expect(view.host.querySelector(".stm-chart")).toBeNull();
    const rows = view.host.querySelectorAll("table tbody tr");
    expect(rows).toHaveLength(3);
    expect(rows[1].textContent).toContain("estimado");
  });

  it("avisa tasa supuesta/desactualizada con enlace a Tasas, y las barras filtran al elegir tarjeta", async () => {
    view = await mountScreen(<StatementsScreen />, { [TL]: { status: 200, json: TIMELINE } });
    click(bar(NEXT));
    expect(view.visible()).toContain("Proyección con la última tasa conocida; actualízala.");
    const link = byText<HTMLAnchorElement>(view.host, "a", "Actualizar tasas");
    expect(link.getAttribute("href")).toMatch(/\/tarjetas\/visa\/tasas$/);
  });
});

describe("Extractos: pestañas, líneas y Abonar", () => {
  it("«Por tarjeta» filtra las líneas y los totales a esa tarjeta", async () => {
    view = await mountScreen(<StatementsScreen />, { [TL]: { status: 200, json: TIMELINE } });
    click(bar(NEXT));
    expect(view.host.querySelectorAll(".stm-line")).toHaveLength(2);
    click(byText(view.host, '[role="tab"]', "Por tarjeta"));
    click(byText(view.host, "label.choice__option", "Nu"));
    expect(view.host.querySelectorAll(".stm-line")).toHaveLength(1);
    expect(view.host.querySelector(".stm-line")!.textContent).toContain("Compra Nu");
    expect(view.host.querySelector('[data-testid="stm-minimum"]')!.textContent).toContain("$20.000");
  });

  it("cada línea muestra fecha, «Cuota N de M», monto y un detalle con capital, interés y fecha de compra", async () => {
    view = await mountScreen(<StatementsScreen />, { [TL]: { status: 200, json: TIMELINE } });
    click(bar(NEXT));
    const first = view.host.querySelector(".stm-line")!;
    expect(first.textContent).toContain("Cuota 2 de 6");
    expect(first.querySelector(".stm-line__date")!.textContent).toMatch(/^\d{1,2} [A-Z]{3}$/);
    expect(first.textContent).not.toContain("Capital");
    click(byText(first, "button", "Ver detalle"));
    expect(first.textContent).toContain("Capital");
    expect(first.textContent).toContain("$100.000");
    expect(first.textContent).toContain("Interés");
    expect(first.textContent).toContain("10/04/2026");
  });

  it("Abonar en un mes futuro lleva kind amount con el mínimo de ESE mes (en memoria, no en la URL) y en el último cerrado kind minimum", async () => {
    const pay = { "GET /api/fms/v1/cards/visa": { status: 200, json: { id: "visa", name: "Visa" } }, "GET /api/fms/v1/cards/visa/statements": { status: 200, json: { statement: null } }, "GET /api/fms/v1/accounts?page_size=100": { status: 200, json: { count: 1, page: 1, page_size: 100, results: [{ id: "acc-1", name: "Ahorros", kind: "savings", status: "active", posted_balance: "5000000.00" }] } } };
    const only = { months: TIMELINE.months.map((m) => ({ ...m, cards: m.cards.filter((c) => c.card_id === "visa"), lines: m.lines.filter((l) => l.card_id === "visa") })) };
    view = await mountScreen(<StatementsScreen />, { [TL]: { status: 200, json: only }, ...pay });
    click(bar(NEXT2));
    const abonar = byText<HTMLAnchorElement>(view.host, "a.button", "Abonar");
    expect(abonar.getAttribute("href")).not.toMatch(/80000|amount/);
    click(abonar);
    view.unmount();
    view = await mountScreen(<CardPay id="visa" />, pay);
    expect(view.host.querySelector<HTMLInputElement>("input.input--amount")!.value).toBe("80000.00");
    expect(view.host.querySelector<HTMLInputElement>('input[type="radio"][value="amount"]')!.checked).toBe(true);
  });

  it("con varias tarjetas, Abonar ofrece una por una; la de mínimo 0 no aparece", async () => {
    view = await mountScreen(<StatementsScreen />, { [TL]: { status: 200, json: TIMELINE } });
    click(bar(NEXT));
    click(byText(view.host, "button", "Abonar"));
    expect(view.host.querySelectorAll('ul[aria-label] a')).toHaveLength(2);
    expect(view.host.textContent).toContain("Abonar a Visa");
    // En el mes en que Nu no debe nada, solo queda Visa y Abonar es un enlace directo.
    click(bar(NEXT2));
    expect(view.host.querySelector("a.button")!.textContent).toBe("Abonar");
  });

  it("sin tarjetas dice que no hay", async () => {
    view = await mountScreen(<StatementsScreen />, { [TL]: { status: 200, json: { months: [] } } });
    expect(view.visible()).toContain("Aún no tienes tarjetas");
  });
});

const CARD = { id: "visa", account_id: "a", name: "Visa", last4: null, issuer: null, status: "active", limit: "5000000.00", used: "0.00", available: "5000000.00", utilization_percent: 0, cut_day: 5, pay_day: 20, next_cutoff: "2026-12-05", next_payment_date: "2026-12-20", rate: "0.24", rate_convention: "EA", rate_type: "variable", rate_reminder_days: 3, rate_valid_from: "2026-10-01", rate_outdated: false, installment_system: "constant_capital", handling_fee: "0.00", insurance: "0.00", min_payment_rate: "0.05" } as unknown as Card;

describe("formulario de tarjeta y de compra", () => {
  it("el formulario pide el tipo de tasa (con ayuda) y los días de recordatorio solo si es variable; envía rate_type", async () => {
    view = await mountScreen(<CardList />, {
      "GET /api/fms/v1/cards?page_size=100": { status: 200, json: { count: 0, page: 1, page_size: 100, results: [] } },
      "GET /api/fms/v1/institutions": { status: 200, json: [] },
      "POST /api/fms/v1/cards": { status: 201, json: CARD },
    });
    click(byText(view.host, "button", "Agrega tu primera tarjeta"));
    await wait();
    expect(view.host.textContent).toContain("Tipo de tasa");
    expect(view.host.textContent).not.toContain("Recordarme actualizar la tasa");
    const select = byText<HTMLElement>(view.host, "label.field__label", "Tipo de tasa").closest(".field")!.querySelector("select")!;
    typeInto(select, "variable");
    expect(view.host.textContent).toContain("Recordarme actualizar la tasa");
    click(view.host.querySelector('button[aria-label^="Ayuda sobre: Tipo de tasa"]'));
    expect(view.host.querySelector('[role="note"]')!.textContent).toContain("Variable: la tasa cambia");
    const inputs = [...view.host.querySelectorAll<HTMLInputElement>("dialog input.input")];
    const byLabel = (label: string) => document.getElementById(byText<HTMLLabelElement>(view!.host, "label", label).htmlFor) as HTMLInputElement;
    typeInto(byLabel("Nombre"), "Visa");
    typeInto(byLabel("Cupo total"), "5000000");
    typeInto(byLabel("Día de corte"), "5");
    typeInto(byLabel("Día de pago"), "20");
    expect(inputs.length).toBeGreaterThan(3);
    click(byText(view.host, "button[type=submit]", "Crear tarjeta"));
    await wait();
    const post = view.mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/cards"))!;
    expect(post.body).toMatchObject({ rate_type: "variable", rate_reminder_days: 3 });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("«Compra con tasa de promoción» manda follows_card_rate: false", async () => {
    view = await mountScreen(<PurchasePanel card={CARD} />, {
      "GET /api/fms/v1/categories?page_size=200&archived=false&kind=expense": { status: 200, json: { count: 0, page: 1, page_size: 200, results: [] } },
      "GET /api/fms/v1/accounts?page_size=100": { status: 200, json: { count: 0, page: 1, page_size: 100, results: [] } },
      "POST /api/fms/v1/cards/visa/simulate": { status: 200, json: { purchase_value: "100.00", installments: 1, first_payment: "100.00", total_interest: "0.00", total_real_cost: "100.00", monthly_rate_percent: "0", rows: [], available_after: "1.00", exceeds_limit: false } },
    });
    const box = view.host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(view.host.textContent).toContain("Compra con tasa de promoción / sin intereses");
    click(box);
    typeInto(view.host.querySelector<HTMLInputElement>("input.input--amount")!, "100");
    await wait(450);
    const sim = view.mock.calls.find((c) => c.url.endsWith("/simulate"))!;
    expect(sim.body).toMatchObject({ follows_card_rate: false, rate: "0" });
  });
});

const RATES = (extra: object = {}) => ({
  card_id: "visa", rate_type: "variable", rate_outdated: false, warnings: [],
  rates: [
    { id: "r1", rate: "0.2678", convention: "EA", valid_from: "2026-04-24", source: "Extracto" },
    { id: "r2", rate: "0.2811", convention: "EA", valid_from: "2026-05-07", source: null },
  ],
  adjustments: [
    { kind: "installment", purchase_id: "p1", installment_number: 1, cutoff: "2026-05-05", base: "2400000.00", billed_interest: "47000.00", expected_interest: "47800.16", difference: "800.16" },
    { kind: "revolving_interest", purchase_id: null, installment_number: null, cutoff: "2026-06-05", base: "100.00", billed_interest: "50.00", expected_interest: "40.00", difference: "-10.00" },
  ],
  ...extra,
});
const FEES = { card_id: "visa", fees: [{ id: "f1", kind: "handling_fee", amount: "18000.00", valid_from: "2026-01-01" }] };
const ratesBase = {
  "GET /api/fms/v1/cards/visa": { status: 200, json: CARD },
  "GET /api/fms/v1/cards/visa/rates": { status: 200, json: RATES() },
  "GET /api/fms/v1/cards/visa/fees": { status: 200, json: FEES },
};

describe("Tasas de la tarjeta", () => {
  it("lista el historial con vigencia, tasa y convención legible, y marca la vigente", async () => {
    view = await mountScreen(<CardRatesScreen id="visa" />, ratesBase);
    const rows = view.host.querySelectorAll(".fin-section:first-of-type li, section li");
    expect(view.visible()).toContain("28,11 %");
    expect(view.visible()).toContain("Efectiva anual (EA)");
    expect(view.visible()).toContain("07/05/2026");
    expect(view.visible()).toContain("Vigente hoy");
    expect(rows.length).toBeGreaterThan(1);
  });

  it("crea una tasa con Idempotency-Key y la convierte a fracción", async () => {
    view = await mountScreen(<CardRatesScreen id="visa" />, { ...ratesBase, "POST /api/fms/v1/cards/visa/rates": { status: 201, json: RATES() } });
    click(byText(view.host, "button", "Registrar tasa"));
    await wait();
    const rate = document.getElementById(byText<HTMLLabelElement>(view.host, "dialog label", "Tasa (%)").htmlFor) as HTMLInputElement;
    typeInto(rate, "29,6");
    click(byText(view.host, "dialog button[type=submit]", "Guardar tasa"));
    await wait();
    const post = view.mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/rates"))!;
    expect(post.body).toMatchObject({ rate: "0.296", rate_convention: "EA" });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("edita (PATCH) y elimina con confirmación (DELETE)", async () => {
    view = await mountScreen(<CardRatesScreen id="visa" />, {
      ...ratesBase,
      "PATCH /api/fms/v1/cards/visa/rates/r1": { status: 200, json: RATES() },
      "DELETE /api/fms/v1/cards/visa/rates/r2": { status: 200, json: RATES() },
    });
    click(view.host.querySelectorAll<HTMLButtonElement>("button")[[...view.host.querySelectorAll("button")].findIndex((b) => b.textContent === "Editar")]);
    await wait();
    const rate = document.getElementById(byText<HTMLLabelElement>(view.host, "dialog label", "Tasa (%)").htmlFor) as HTMLInputElement;
    typeInto(rate, "27");
    click(byText(view.host, "dialog button[type=submit]", "Guardar tasa"));
    await wait();
    const patch = view.mock.calls.find((c) => c.method === "PATCH")!;
    expect(patch.body).toMatchObject({ rate: "0.27" });
    // Eliminar pide confirmación antes de llamar.
    const deletes = [...view.host.querySelectorAll("button")].filter((b) => b.textContent === "Eliminar");
    click(deletes[0]);
    expect(view.mock.calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(view.visible()).toContain("¿Eliminar la tasa que rige desde");
    click(byText(view.host, "button", "Sí, eliminar"));
    await wait();
    expect(view.mock.calls.some((c) => c.method === "DELETE" && c.url.endsWith("/rates/r2"))).toBe(true);
  });

  it("muestra los ajustes sugeridos y registra el positivo como interés tras confirmar el monto (la sugerencia negativa no tiene acción)", async () => {
    view = await mountScreen(<CardRatesScreen id="visa" />, { ...ratesBase, "POST /api/fms/v1/cards/visa/charges": { status: 201, json: { id: "m1" } } });
    expect(view.visible()).toContain("Ajustes sugeridos");
    expect([...view.host.querySelectorAll("button")].filter((b) => b.textContent === "Registrar como interés")).toHaveLength(1);
    click(byText(view.host, "button", "Registrar como interés"));
    expect(view.mock.calls.some((c) => c.url.endsWith("/charges"))).toBe(false);
    expect(view.visible()).toContain("$800,16");
    click(byText(view.host, "button", "Sí, registrar"));
    await wait();
    const post = view.mock.calls.find((c) => c.url.endsWith("/charges"))!;
    expect(post.body).toMatchObject({ kind: "interest", amount: "800.16", date: today });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(view.visible()).toContain("Interés registrado.");
  });

  it("en una tarjeta fija avisa y no deja agregar tasas", async () => {
    view = await mountScreen(<CardRatesScreen id="visa" />, { ...ratesBase, "GET /api/fms/v1/cards/visa/rates": { status: 200, json: RATES({ rate_type: "fixed", adjustments: [] }) } });
    expect(view.visible()).toContain("tasa fija");
    expect([...view.host.querySelectorAll("button")].some((b) => b.textContent === "Registrar tasa")).toBe(false);
  });

  it("cuota de manejo y seguro: lista con vigencia, agrega con clave de idempotencia y borra con confirmación", async () => {
    view = await mountScreen(<CardRatesScreen id="visa" />, {
      ...ratesBase,
      "POST /api/fms/v1/cards/visa/fees": { status: 201, json: FEES },
      "DELETE /api/fms/v1/cards/visa/fees/f1": { status: 200, json: { card_id: "visa", fees: [] } },
    });
    expect(view.visible()).toContain("Cuota de manejo y seguro");
    expect(view.visible()).toContain("$18.000");
    click(byText(view.host, "button", "Agregar"));
    await wait();
    typeInto(view.host.querySelector<HTMLSelectElement>("dialog select")!, "insurance");
    typeInto(view.host.querySelector<HTMLInputElement>("dialog input.input--amount")!, "9500");
    click(byText(view.host, "dialog button[type=submit]", "Guardar"));
    await wait();
    const post = view.mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/fees"))!;
    expect(post.body).toMatchObject({ kind: "insurance", amount: "9500" });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    click(view.host.querySelector('button[aria-label^="Eliminar: Cuota de manejo"]'));
    click(byText(view.host, "button", "Sí, eliminar"));
    await wait();
    expect(view.mock.calls.some((c) => c.method === "DELETE" && c.url.endsWith("/fees/f1"))).toBe(true);
  });
});

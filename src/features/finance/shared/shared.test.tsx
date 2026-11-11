// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { todayBogota } from "@/lib/dates";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { PersonScreen } from "./person-screen";
import { SharedScreen } from "./shared-screen";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/es/finanzas/movimientos/compartidos",
}));

const today = todayBogota();
const page = (results: unknown[]) => ({ status: 200, json: { count: results.length, page: 1, page_size: 100, results } });
const ACCOUNTS = page([
  { id: "acc-1", type: "asset", kind: "savings", name: "Ahorros", status: "active", posted_balance: "5000000.00" },
  { id: "card-1", type: "liability", kind: "credit_card", name: "Visa", status: "active", posted_balance: "0.00" },
]);
const CATEGORIES = page([{ id: "cat-1", name: "Restaurantes", kind: "expense", path: ["Alimentación", "Restaurantes"], archived: false }]);
const PEOPLE = page([
  { id: "laura", name: "Laura", archived: false },
  { id: "andres", name: "Andrés", archived: false },
]);
const BALANCES = {
  people: [
    { counterparty_id: "laura", name: "Laura", owed_to_me: "85000.00", i_owe: "0.00", net: "85000.00", debts: [{ debt_id: "d1", direction: "owed", agreed_date: "2026-11-05", balance: "85000.00", note: null }] },
    { counterparty_id: "andres", name: "Andrés", owed_to_me: "0.00", i_owe: "40000.00", net: "-40000.00", debts: [{ debt_id: "d2", direction: "owe", agreed_date: "2026-11-01", balance: "40000.00", note: null }] },
  ],
  owed_to_me: "85000.00",
  i_owe: "40000.00",
};
const PURCHASE = { id: "p1", date: "2026-11-05", mode: "equal", description: "Cena de cumpleaños", total: "170000.00", my_share: "85000.00", movement_id: "m1", shares: [{ counterparty_id: "laura", name: "Laura", amount: "85000.00", percent: null, debt_id: "d1", balance: "85000.00" }], cancelled_on: null };
const base = {
  "GET /api/fms/v1/shared/balances": { status: 200, json: BALANCES },
  "GET /api/fms/v1/shared/purchases?page_size=50": page([PURCHASE]),
  "GET /api/fms/v1/accounts?page_size=100": ACCOUNTS,
  "GET /api/fms/v1/categories?page_size=200&archived=false": CATEGORIES,
  "GET /api/fms/v1/counterparties?page_size=200": PEOPLE,
};

/** Lo que se ve: sin el texto solo para lectores de pantalla (que repite cada monto en palabras). */
function visibleOf(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll(".visually-hidden").forEach((n) => n.remove());
  return copy.textContent ?? "";
}

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
});

describe("compartidos: saldos y compras (corte 3.4)", () => {
  it("«Laura te debe $85.000» y «Le debes a Andrés $40.000», con enlace a saldar", async () => {
    view = await mountScreen(<SharedScreen />, base);
    const text = view.visible();
    expect(text).toContain("Laura te debe $85.000");
    expect(text).toContain("Le debes a Andrés $40.000");
    expect(visibleOf(view.host.querySelector("[data-testid=balance-totals]")!)).toContain("Te deben $85.000 · Debes $40.000");
    const links = [...view.host.querySelectorAll('a[href*="/compartidos/"]')].map((a) => a.getAttribute("href"));
    expect(links).toEqual(["/es/finanzas/movimientos/compartidos/laura", "/es/finanzas/movimientos/compartidos/andres"]);
    expect(text).toContain("Cena de cumpleaños");
    expect(text).toContain("Tu parte");
  });

  it("sin saldos ni compras: estados vacíos, nada inventado", async () => {
    view = await mountScreen(<SharedScreen />, { ...base, "GET /api/fms/v1/shared/balances": { status: 200, json: { people: [], owed_to_me: "0.00", i_owe: "0.00" } }, "GET /api/fms/v1/shared/purchases?page_size=50": page([]) });
    expect(view.visible()).toContain("Nadie te debe ni le debes");
    expect(view.visible()).toContain("Aún no has dividido ninguna compra");
  });

  it("dividir en partes iguales: la vista previa deja mi parte y el resto, y se envía con Idempotency-Key (pagando con la tarjeta)", async () => {
    view = await mountScreen(<SharedScreen />, { ...base, "POST /api/fms/v1/shared/purchases": { status: 201, json: PURCHASE } });
    click(byText(view.host, "button", "Nueva compra compartida"));
    await wait();
    const dialog = view.host.querySelector("dialog[open]")!;
    const selects = () => [...dialog.querySelectorAll<HTMLSelectElement>("select")];
    typeInto(selects()[0], "card-1"); // pagada con la tarjeta
    typeInto(dialog.querySelector<HTMLInputElement>("input.input--amount")!, "170.000");
    typeInto(selects().find((s) => [...s.options].some((o) => o.value === "laura"))!, "laura");
    await wait();
    expect(visibleOf(dialog.querySelector("[data-testid=my-share]")!)).toContain("$85.000");
    expect(dialog.textContent).toContain("Laura te debe $85.000");
    click(byText(dialog, "button", "Registrar la compra"));
    await wait();
    const post = view.mock.calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ account_id: "card-1", amount: "170000", date: today, mode: "equal", people: [{ counterparty_id: "laura" }] });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(post.url).not.toMatch(/170000/);
    expect(view.visible()).toContain("Compra compartida registrada con 1 persona(s)");
  });

  it("por porcentaje: los porcentajes que pasan de 100 no se envían y lo dicen", async () => {
    view = await mountScreen(<SharedScreen />, base);
    click(byText(view.host, "button", "Nueva compra compartida"));
    await wait();
    const dialog = view.host.querySelector("dialog[open]")!;
    typeInto(dialog.querySelector<HTMLInputElement>("input.input--amount")!, "100.000");
    click([...dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((r) => r.nextElementSibling?.textContent === "Por porcentaje")!);
    await wait();
    typeInto([...dialog.querySelectorAll<HTMLSelectElement>("select")].find((s) => [...s.options].some((o) => o.value === "laura"))!, "laura");
    typeInto([...dialog.querySelectorAll<HTMLInputElement>("input[type=text]")].find((i) => i.inputMode === "decimal" && !i.classList.contains("input--amount"))!, "120");
    click(byText(dialog, "button", "Registrar la compra"));
    await wait();
    expect(view.mock.calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(dialog.textContent).toContain("Escribe un porcentaje mayor que 0 y hasta 100.");
  });

  it("cancelar una compra con abonos: el 409 shares_already_paid se explica con claridad y lleva a los abonos", async () => {
    view = await mountScreen(<SharedScreen />, { ...base, "POST /api/fms/v1/shared/purchases/p1/cancel": { status: 409, json: { code: "shares_already_paid", detail: "shares already paid" } } });
    click(byText(view.host, "button", "Cancelar"));
    await wait();
    const dialog = view.host.querySelector("dialog[open]")!;
    typeInto(dialog.querySelector("textarea")!, "Me equivoqué de monto");
    click(byText(dialog, "button", "Cancelar la compra"));
    await wait();
    const post = view.mock.calls.find((c) => c.url.endsWith("/p1/cancel"))!;
    expect(post.body).toEqual({ reason: "Me equivoqué de monto" });
    expect(dialog.textContent).toContain("Alguien ya abonó a esta compra compartida. Anula primero esos abonos");
    expect(dialog.querySelector('a[href="/es/finanzas/movimientos/compartidos/laura"]')!.textContent).toBe("Ver los abonos de Laura");
  });

  it("cancelar sin abonos anula todo junto y recarga", async () => {
    let cancelled = false;
    view = await mountScreen(<SharedScreen />, {
      ...base,
      "GET /api/fms/v1/shared/purchases?page_size=50": () => page([cancelled ? { ...PURCHASE, cancelled_on: today } : PURCHASE]),
      "POST /api/fms/v1/shared/purchases/p1/cancel": () => {
        cancelled = true;
        return { status: 200, json: { ...PURCHASE, cancelled_on: today } };
      },
    });
    click(byText(view.host, "button", "Cancelar"));
    await wait();
    const dialog = view.host.querySelector("dialog[open]")!;
    typeInto(dialog.querySelector("textarea")!, "Duplicada");
    click(byText(dialog, "button", "Cancelar la compra"));
    await wait(60);
    expect(view.visible()).toContain("Compra cancelada");
    expect(view.visible()).toContain("Cancelada el");
  });
});

describe("saldar con una persona (corte 3.4)", () => {
  const LAURA = BALANCES.people[0];
  const SETTLED = { ...LAURA, owed_to_me: "0.00", net: "0.00", debts: [] };

  it("saldar todo manda cuenta, fecha y sentido (sin monto) con Idempotency-Key, y el saldo queda en $0", async () => {
    let settled = false;
    view = await mountScreen(<PersonScreen id="laura" />, {
      "GET /api/fms/v1/shared/people/laura": () => ({ status: 200, json: settled ? SETTLED : LAURA }),
      "GET /api/fms/v1/accounts?page_size=100": ACCOUNTS,
      "POST /api/fms/v1/shared/people/laura/settle": () => {
        settled = true;
        return { status: 201, json: SETTLED };
      },
    });
    expect(view.visible()).toContain("Laura te debe $85.000");
    expect(view.visible()).toContain("Entra a la cuenta");
    click(byText(view.host, "button", "Saldar todo"));
    await wait(60);
    const post = view.mock.calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ account_id: "acc-1", date: today, direction: "owed" });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(view.visible()).toContain("el saldo con Laura quedó en $0");
    expect(view.visible()).toContain("Con Laura estás a paz y salvo");
    expect(view.visible()).not.toContain("Laura te debe");
  });

  it("un abono parcial manda el monto en el cuerpo; no se puede abonar de más (el servidor lo rechaza y se dice)", async () => {
    view = await mountScreen(<PersonScreen id="laura" />, {
      "GET /api/fms/v1/shared/people/laura": { status: 200, json: LAURA },
      "GET /api/fms/v1/accounts?page_size=100": ACCOUNTS,
      "POST /api/fms/v1/shared/people/laura/settle": { status: 422, json: { code: "payment_exceeds_balance", detail: "x" } },
    });
    typeInto(view.host.querySelector<HTMLInputElement>("input.input--amount")!, "100.000");
    click(byText(view.host, "button", "Abonar"));
    await wait();
    const post = view.mock.calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ account_id: "acc-1", date: today, direction: "owed", amount: "100000" });
    expect(view.visible()).toContain("El abono no puede ser mayor que el saldo de la deuda.");
  });

  it("si ambos se deben algo, se elige qué saldar; a quien le debo sale de la cuenta", async () => {
    const both = { ...LAURA, i_owe: "20000.00", net: "65000.00", debts: [...LAURA.debts, { debt_id: "d3", direction: "owe", agreed_date: "2026-11-02", balance: "20000.00", note: null }] };
    view = await mountScreen(<PersonScreen id="laura" />, {
      "GET /api/fms/v1/shared/people/laura": { status: 200, json: both },
      "GET /api/fms/v1/accounts?page_size=100": ACCOUNTS,
      "POST /api/fms/v1/shared/people/laura/settle": { status: 201, json: both },
    });
    expect(view.visible()).toContain("Le debes a Laura $20.000");
    click([...view.host.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((r) => r.nextElementSibling?.textContent === "Lo que le debo")!);
    await wait();
    expect(view.visible()).toContain("Sale de la cuenta");
    click(byText(view.host, "button", "Saldar todo"));
    await wait();
    expect(view.mock.calls.find((c) => c.method === "POST")!.body).toMatchObject({ direction: "owe" });
  });

  it("una persona que no existe: 404 claro", async () => {
    view = await mountScreen(<PersonScreen id="nadie" />, { "GET /api/fms/v1/shared/people/nadie": { status: 404, json: { code: "not_found" } } });
    expect(view.visible()).toContain("No encontramos lo que buscas");
  });
});

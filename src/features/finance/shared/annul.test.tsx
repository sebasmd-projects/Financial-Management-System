// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { MovementDetail } from "../movements/movement-detail";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/es/finanzas/movimientos/m1",
}));

const MOVEMENT = {
  id: "m1",
  type: "expense",
  origin: "manual",
  status: "confirmado",
  voided: false,
  date: "2026-11-05",
  amount: "85000.00",
  currency: "COP",
  original: null,
  attributes: {},
  description: "Cena de cumpleaños",
  notes: null,
  counterparty: null,
  category: null,
  nature: "",
  classification: "",
  tags: [],
  cost_center: null,
  payment_method: null,
  account: { id: "acc-1", name: "Ahorros" },
  to_account: null,
  refund_of_id: null,
  replaces_id: null,
  gmf: null,
  entry_id: "e1",
  entry_number: 7,
  attachments: 0,
};

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
});

describe("anular a mano un gasto de una compra compartida", () => {
  it("409 part_of_shared_purchase: dice que se cancela la compra compartida y lleva a Compartidos", async () => {
    view = await mountScreen(<MovementDetail id="m1" />, {
      "GET /api/fms/v1/movements/m1": { status: 200, json: MOVEMENT },
      "GET /api/fms/v1/custom-attributes?page_size=100": { status: 200, json: { count: 0, page: 1, page_size: 100, results: [] } },
      "POST /api/fms/v1/movements/m1/annul": { status: 409, json: { code: "part_of_shared_purchase", detail: "part of shared purchase" } },
    });
    click(byText(view.host, "button", "Anular"));
    await wait();
    const dialog = view.host.querySelector("dialog[open]")!;
    typeInto(dialog.querySelector("textarea")!, "Me equivoqué");
    click([...dialog.querySelectorAll("button")].find((b) => b.getAttribute("type") === "submit")!);
    await wait();
    expect(dialog.textContent).toContain("es parte de una compra compartida y no se anula a mano");
    expect(dialog.textContent).toContain("Cancela la compra compartida");
    expect(dialog.querySelector('a[href="/es/finanzas/movimientos/compartidos"]')).not.toBeNull();
  });
});

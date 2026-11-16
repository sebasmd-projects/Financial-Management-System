// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { mountScreen, type Mounted } from "@/test/render";
import { CounterpartiesScreen } from "./counterparties-screen";

const MOM = { id: "p-1", name: "Mi Madre", archived: false, identifiers: [{ id: "i-1", channel: "nequi", last4: "0001" }], movements: 4 };
const SHOP = { id: "p-2", name: "Salchi Papas", archived: false, identifiers: [{ id: "i-2", channel: "qr", last4: "" }], movements: 1 };

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

describe("Contrapartes", () => {
  it("lista el nombre y, debajo, la cuenta con sus últimos dígitos (nunca el valor completo)", async () => {
    view = await mountScreen(<CounterpartiesScreen />, {
      "GET /api/fms/v1/counterparties?page_size=100": { status: 200, json: { count: 2, page: 1, page_size: 200, results: [SHOP, MOM] } },
    });
    expect(view.visible()).toContain("Mi Madre");
    expect(view.host.querySelector("[data-testid=accounts-p-1]")?.textContent).toBe("Nequi ··0001");
    expect(view.host.querySelector("[data-testid=accounts-p-2]")?.textContent).toBe("QR");
    expect(view.text()).not.toMatch(/3000000001/);
  });

  it("explica cómo empezar cuando no hay ninguna", async () => {
    view = await mountScreen(<CounterpartiesScreen />, {
      "GET /api/fms/v1/counterparties?page_size=100": { status: 200, json: { count: 0, page: 1, page_size: 200, results: [] } },
    });
    expect(view.visible()).toContain("Todavía no tienes contrapartes");
  });
});

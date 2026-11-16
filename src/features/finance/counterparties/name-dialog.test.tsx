// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountScreen, wait, type Mounted } from "@/test/render";
import { NameDialog } from "./name-dialog";

const PARTY = { id: "p-1", name: "Mi Madre", archived: false, identifiers: [{ id: "i-1", channel: "nequi", last4: "0001" }], movements: 3 };
const NAMED = { counterparty: { ...PARTY, name: "Mamá" }, identifier: PARTY.identifiers[0], updated: 2 };
const TARGET = { kind: "account" as const, channel: "nequi", value: "3000000001", accountText: "Nequi ··0001" };

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

function typeName(value: string) {
  const input = document.querySelector<HTMLInputElement>("input[type=text], input:not([type])")!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
const click = (el: Element | undefined) => act(() => { (el as HTMLElement).click(); });
const nameCalls = (m: Mounted) => m.mock.calls.filter((c) => c.method === "POST" && c.url.endsWith("/counterparties/name"));

describe("NameDialog", () => {
  it("guarda el nombre de una cuenta nueva y avisa cuántos movimientos anteriores quedaron con él", async () => {
    const done = vi.fn();
    view = await mountScreen(<NameDialog open target={TARGET} onClose={() => undefined} onDone={done} />, {
      "GET /api/fms/v1/counterparties?page_size=100": { status: 200, json: { count: 1, page: 1, page_size: 100, results: [PARTY] } },
      "POST /api/fms/v1/counterparties/name": { status: 200, json: NAMED },
    });
    typeName("Mamá");
    click(button("Guardar nombre"));
    await wait();
    expect(nameCalls(view)[0].body).toEqual({ name: "Mamá", channel: "nequi", value: "3000000001" });
    expect(done).toHaveBeenCalledWith("Listo: Mamá. También quedaron con ese nombre 2 movimientos anteriores.");
  });

  it("si la cuenta ya tiene otro nombre pregunta «¿Actualizar anterior → nuevo?» y reintenta con renombrar", async () => {
    const done = vi.fn();
    let first = true;
    view = await mountScreen(<NameDialog open target={TARGET} onClose={() => undefined} onDone={done} />, {
      "GET /api/fms/v1/counterparties?page_size=100": { status: 200, json: { count: 0, page: 1, page_size: 100, results: [] } },
      "POST /api/fms/v1/counterparties/name": () => {
        if (first) {
          first = false;
          return { status: 409, json: { code: "identifier_taken", detail: "x", current_name: "Mi Madre", counterparty_id: "p-1" } };
        }
        return { status: 200, json: { ...NAMED, updated: 0 } };
      },
    });
    typeName("Mamá");
    click(button("Guardar nombre"));
    await wait();
    expect(document.querySelector("[data-testid=name-conflict]")?.textContent).toContain("¿Actualizar «Mi Madre» → «Mamá»?");
    expect(done).not.toHaveBeenCalled();
    click(button("Actualizar nombre"));
    await wait();
    expect(nameCalls(view)[1].body).toEqual({ name: "Mamá", channel: "nequi", value: "3000000001", on_conflict: "rename" });
    expect(done).toHaveBeenCalledWith("Listo: Mamá.");
  });

  it("«Crear otro» pasa la cuenta a otra contraparte (on_conflict move)", async () => {
    let first = true;
    view = await mountScreen(<NameDialog open target={TARGET} onClose={() => undefined} onDone={() => undefined} />, {
      "GET /api/fms/v1/counterparties?page_size=100": { status: 200, json: { count: 0, page: 1, page_size: 100, results: [] } },
      "POST /api/fms/v1/counterparties/name": () => {
        if (first) {
          first = false;
          return { status: 409, json: { code: "identifier_taken", detail: "x", current_name: "Mi Madre" } };
        }
        return { status: 200, json: NAMED };
      },
    });
    typeName("Yennis");
    click(button("Guardar nombre"));
    await wait();
    click(button("Crear otro"));
    await wait();
    expect(nameCalls(view)[1].body).toMatchObject({ on_conflict: "move" });
  });

  it("desde un movimiento llama a su ruta sin mandar la cuenta (el servidor la lee del texto)", async () => {
    view = await mountScreen(<NameDialog open target={{ kind: "movement", movementId: "m-9" }} onClose={() => undefined} onDone={() => undefined} />, {
      "GET /api/fms/v1/counterparties?page_size=100": { status: 200, json: { count: 0, page: 1, page_size: 100, results: [] } },
      "POST /api/fms/v1/movements/m-9/counterparty": { status: 200, json: {} },
    });
    typeName("Salchi Papas");
    click(button("Guardar nombre"));
    await wait();
    const call = view.mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/movements/m-9/counterparty"));
    expect(call?.body).toEqual({ name: "Salchi Papas" });
  });
});

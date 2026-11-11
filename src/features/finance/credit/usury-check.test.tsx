// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoanForm } from "../loans/loan-form";
import { mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { UsuryRateCheck } from "./usury-check";

const page = (results: unknown[]) => ({ status: 200, json: { count: results.length, page: 1, page_size: 100, results } });
let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
});

describe("aviso de usura al escribir una tasa", () => {
  it("avisa cuando la tasa supera la usura vigente en su fecha, sin bloquear y con el texto escrito", async () => {
    view = await mountScreen(<UsuryRateCheck rate="0.3" convention="EA" on="2026-11-11" />, { "GET /api/fms/v1/usury/check?rate=0.3&convention=EA&on=2026-11-11": { status: 200, json: { usury_known: true, effective_annual: "0.3", usury: "0.2345", exceeds: true } } });
    await wait(500);
    const text = view.visible();
    expect(text).toContain("Supera la tasa de usura vigente");
    expect(text).toContain("23,45 %");
    expect(text).toContain("Tu tasa equivale a 30 % E.A.");
  });

  it("sin usura registrada lo dice y lleva a Parámetros; no supone ningún valor", async () => {
    view = await mountScreen(<UsuryRateCheck rate="0.2" convention="EM" on="2026-11-11" />, { "GET /api/fms/v1/usury/check?rate=0.2&convention=EM&on=2026-11-11": { status: 200, json: { usury_known: false, effective_annual: "7.9", usury: null, exceeds: false } } });
    await wait(500);
    expect(view.host.querySelector("[data-testid=usury-null]")).toBeTruthy();
    expect(view.visible()).toContain("No hay una tasa de usura vigente");
  });

  it("espera a que dejes de escribir y no consulta una tasa vacía o en cero", async () => {
    view = await mountScreen(<UsuryRateCheck rate="0" convention="EA" />, {});
    await wait(500);
    expect(view.mock.calls).toHaveLength(0);
  });

  it("el formulario de un crédito la consulta con la tasa como fracción (y la tasa va en la URL solo como fracción, nunca un monto)", async () => {
    view = await mountScreen(<LoanForm onDone={() => undefined} onCancel={() => undefined} />, {
      "GET /api/fms/v1/accounts?page_size=100": page([]),
      "GET /api/fms/v1/institutions": { status: 200, json: [] },
      [`GET /api/fms/v1/usury/check?rate=0.3&convention=EM&on=${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())}`]: { status: 200, json: { usury_known: true, effective_annual: "0.3", usury: "0.2345", exceeds: true } },
    });
    const rate = [...view.host.querySelectorAll<HTMLInputElement>("input[inputmode=decimal]")].find((i) => i.closest(".field")?.textContent?.includes("Tasa"))!;
    typeInto(rate, "30");
    await wait(500);
    expect(view.host.querySelector("[data-testid=usury-check]")).toBeTruthy();
    expect(view.visible()).toContain("Supera la tasa de usura vigente");
  });
});

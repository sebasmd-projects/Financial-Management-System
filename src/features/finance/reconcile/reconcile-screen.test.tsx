// @vitest-environment happy-dom
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { I18nProvider } from "@/i18n/provider";
import { mockFetch } from "@/test/mock-fetch";
import { ReconcileScreen } from "./reconcile-screen";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas/cuentas/acc-1/conciliar" }));

const ACCOUNT = { id: "acc-1", name: "Ahorros", kind: "savings", status: "active", posted_balance: "3467400.00", projected_balance: "3467400.00", gmf_exempt: false };
const cand = (entry_id: string, effect: string, description: string | null, number: number) => ({ entry_id, number, date: "2026-10-28", movement_id: null, description, effect });
const PREVIEW = {
  account_id: "acc-1", cutoff: "2026-10-31", statement_balance: "3512400.00", reconciled_balance: "0.00", marked: "0.00", difference: "3512400.00", can_reconcile: false, last: null,
  candidates: [cand("e1", "-182300.00", "Éxito", 1), cand("e2", "5200000.00", "Nómina", 2), cand("e3", "-1550300.00", null, 3)],
};
const EMPTY_HISTORY = { count: 0, page: 1, page_size: 20, results: [] };

let host: HTMLDivElement;
let root: Root;
const wait = (ms = 20) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
/** Lo que se ve, sin el texto solo para lectores de pantalla. */
function visible(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll(".visually-hidden").forEach((n) => n.remove());
  return copy.textContent ?? "";
}
function setValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => { setter.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
function submitFirst() {
  return act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
function button(text: string): HTMLButtonElement {
  return [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes(text))!;
}
function mount(routes: Record<string, { status: number; json?: unknown }>) {
  const mock = mockFetch({ "GET /api/fms/v1/accounts/acc-1": { status: 200, json: ACCOUNT }, "GET /api/fms/v1/reconciliations?account=acc-1&page_size=20": { status: 200, json: EMPTY_HISTORY }, ...routes });
  vi.stubGlobal("fetch", mock.fetch);
  document.cookie = "csrftoken=tok-test";
  root = createRoot(host);
  act(() => root.render(<I18nProvider locale="es" dict={es}><ReconcileScreen id="acc-1" /></I18nProvider>));
  return mock;
}
async function startReview() {
  await wait();
  const inputs = host.querySelectorAll<HTMLInputElement>("form input.input--amount");
  setValue(inputs[0], "3.512.400");
  await submitFirst();
  await wait();
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("conciliación", () => {
  it("la vista previa va sin montos en la URL, con todo marcado, y la diferencia se recalcula al desmarcar", async () => {
    const mock = mount({ "POST /api/fms/v1/reconciliations/preview": { status: 200, json: PREVIEW } });
    await startReview();
    const call = mock.calls.find((c) => c.url.endsWith("/reconciliations/preview"))!;
    expect(call.body).toMatchObject({ account_id: "acc-1", statement_balance: "3512400" });
    for (const c of mock.calls) expect(c.url).not.toMatch(/3512400/);
    const summary = visible(host.querySelector(".recon__summary")!);
    // Marcado: −182.300 + 5.200.000 − 1.550.300 = 3.467.400; diferencia = 3.512.400 − 3.467.400 = 45.000.
    expect(summary).toContain("$3.467.400");
    expect(summary).toContain("+$45.000");
    expect(host.querySelectorAll<HTMLInputElement>(".recon__row input:checked")).toHaveLength(3);
    // Desmarcar «Éxito» (−182.300): el marcado sube a 3.649.700 y la diferencia pasa a −137.300.
    act(() => host.querySelector<HTMLInputElement>(".recon__row input")!.click());
    const after = visible(host.querySelector(".recon__summary")!);
    expect(after).toContain("$3.649.700");
    expect(after).toContain("−$137.300");
  });

  it("con diferencia distinta de cero ofrece agregar el movimiento, crear el ajuste de ese valor y seguir luego; no deja conciliar", async () => {
    mount({ "POST /api/fms/v1/reconciliations/preview": { status: 200, json: PREVIEW } });
    await startReview();
    expect(host.textContent).toContain("Agregar movimiento faltante");
    expect(host.textContent).toContain("Guardar y seguir luego");
    expect(button("Crear ajuste de $45.000")).toBeDefined();
    expect(host.textContent).not.toContain("Conciliar 3 movimientos");
  });

  it("crear el ajuste manda Idempotency-Key, marca el asiento nuevo y deja la diferencia en cero; luego concilia", async () => {
    const adjustmentCandidate = cand("e4", "45000.00", "Ajuste de conciliación", 4);
    const adjusted = { ...PREVIEW, candidates: [...PREVIEW.candidates, adjustmentCandidate] };
    const mock = mount({
      "POST /api/fms/v1/reconciliations/preview": { status: 200, json: PREVIEW },
      "POST /api/fms/v1/reconciliations/adjust": { status: 201, json: { movement_id: "m4", entry_id: "e4", amount: "45000.00", type: "income", preview: adjusted } },
      "POST /api/fms/v1/reconciliations": { status: 201, json: { id: "r1" } },
    });
    await startReview();
    await act(async () => button("Crear ajuste").click());
    await wait();
    const adjust = mock.calls.find((c) => c.url.endsWith("/reconciliations/adjust"))!;
    expect(adjust.headers.get("Idempotency-Key")).toBeTruthy();
    expect(adjust.body).toMatchObject({ account_id: "acc-1", entry_ids: ["e1", "e2", "e3"] });
    expect(host.textContent).toContain("Ajuste creado y marcado");
    // El extracto está 45.000 por encima de lo marcado: el ajuste es un INGRESO de 45.000 y deja la diferencia en cero.
    expect(host.querySelectorAll<HTMLInputElement>(".recon__row input:checked")).toHaveLength(4);
    expect(visible(host.querySelector(".recon__summary")!)).toContain("$3.512.400");
    expect(host.textContent).toContain("La diferencia es cero");
    await act(async () => button("Conciliar 4 movimientos").click());
    await wait();
    const post = mock.calls.find((c) => c.method === "POST" && c.url === "/api/fms/v1/reconciliations")!;
    expect(post.body).toMatchObject({ entry_ids: ["e1", "e2", "e3", "e4"] });
    expect(host.textContent).toContain("Conciliación guardada");
  });

  it("con diferencia cero concilia N movimientos con los asientos marcados", async () => {
    const exact = { ...PREVIEW, statement_balance: "3467400.00", candidates: PREVIEW.candidates };
    const mock = mount({ "POST /api/fms/v1/reconciliations/preview": { status: 200, json: exact }, "POST /api/fms/v1/reconciliations": { status: 201, json: { id: "r1" } } });
    await wait();
    setValue(host.querySelectorAll<HTMLInputElement>("form input.input--amount")[0], "3.467.400");
    await submitFirst();
    await wait();
    expect(host.textContent).toContain("La diferencia es cero");
    await act(async () => button("Conciliar 3 movimientos").click());
    await wait();
    const post = mock.calls.find((c) => c.method === "POST" && c.url === "/api/fms/v1/reconciliations")!;
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(post.body).toEqual({ account_id: "acc-1", cutoff: exact.cutoff, statement_balance: "3467400.00", entry_ids: ["e1", "e2", "e3"] });
    expect(host.textContent).toContain("Conciliación guardada");
  });

  it("difference_not_zero del servidor se dice con su texto", async () => {
    const exact = { ...PREVIEW, statement_balance: "3467400.00" };
    mount({ "POST /api/fms/v1/reconciliations/preview": { status: 200, json: exact }, "POST /api/fms/v1/reconciliations": { status: 409, json: { code: "difference_not_zero" } } });
    await wait();
    setValue(host.querySelectorAll<HTMLInputElement>("form input.input--amount")[0], "3.467.400");
    await submitFirst();
    await wait();
    await act(async () => button("Conciliar 3 movimientos").click());
    await wait();
    expect(host.textContent).toContain("La diferencia no es cero: no se puede conciliar todavía");
  });

  it("reabrir la última conciliación pide el motivo y lo envía", async () => {
    const last = { id: "r9", account_id: "acc-1", cutoff: "2026-09-30", statement_balance: "1000000.00", marked_balance: "1000000.00", entry_count: 7, status: "closed", closed_at: "2026-10-01T15:00:00Z", reopened_at: null, reopen_reason: null, entry_ids: [] };
    const mock = mount({ "GET /api/fms/v1/reconciliations?account=acc-1&page_size=20": { status: 200, json: { count: 1, page: 1, page_size: 20, results: [last] } }, "POST /api/fms/v1/reconciliations/r9/reopen": { status: 200, json: { ...last, status: "reopened" } } });
    await wait();
    expect(visible(host)).toContain("Corte 30/09/2026");
    await act(async () => button("Reabrir").click());
    const reason = host.querySelector<HTMLTextAreaElement>("dialog textarea")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    act(() => { setter.call(reason, "Faltó un movimiento"); reason.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => button("Reabrir conciliación").click());
    await wait();
    const post = mock.calls.find((c) => c.url.endsWith("/r9/reopen"))!;
    expect(post.body).toEqual({ reason: "Faltó un movimiento" });
    expect(host.textContent).toContain("Conciliación reabierta");
  });

  it("una tarjeta de crédito no se concilia: lo dice y no ofrece el formulario", async () => {
    mount({ "GET /api/fms/v1/accounts/acc-1": { status: 200, json: { ...ACCOUNT, kind: "credit_card" } } });
    await wait();
    expect(host.textContent).toContain("Solo se concilian cuentas de activo");
    expect(host.querySelector("form")).toBeNull();
  });
});

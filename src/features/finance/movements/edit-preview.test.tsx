// @vitest-environment happy-dom
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditPreview } from "@/api/models";
import { en } from "@/i18n/dictionaries/en";
import { es } from "@/i18n/dictionaries/es";
import { I18nProvider } from "@/i18n/provider";
import { mockFetch } from "@/test/mock-fetch";
import { EditPreviewPanel } from "./edit-preview";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PREVIEW = {
  token: "tok-preview-123",
  expires_at: "2026-11-10T19:32:00Z",
  version: "v1",
  effects: {
    mode: "annul_and_recreate",
    changed_fields: ["amount", "date"],
    chained: ["gmf", "installments"],
    entries_annulled: [{ id: "e1", number: 1284, kind: "movement", date: "2026-10-31", status: "anulado", total: "180000.00" }],
    entries_created: [
      { id: "e2", number: 1290, kind: "reversal", date: "2026-11-10", status: "confirmado", total: "180000.00" },
      { id: "e3", number: 1291, kind: "movement", date: "2026-11-03", status: "confirmado", total: "170000.00" },
    ],
    balances: [{ account_id: "a1", name: "Ahorros Bancolombia", posted_before: "3240000.00", posted_after: "3250000.00", projected_before: "3240000.00", projected_after: "3250000.00" }],
    spent: [
      { period: "2026-10-01", before: "900000.00", after: "720000.00" },
      { period: "2026-11-01", before: "100000.00", after: "270000.00" },
    ],
    gmf: { before: "720.00", after: "680.00" },
    installments: {
      before: { installments: 6, purchase_value: "1200000.00", total_interest: "75969.00", total_real_cost: "1275969.00", first_payment: "221705.00" },
      after: { installments: 6, purchase_value: "1100000.00", total_interest: "69639.00", total_real_cost: "1169639.00", first_payment: "203230.00" },
    },
    notes: ["Los extractos ya emitidos no cambian."],
  },
} as unknown as EditPreview;

let host: HTMLDivElement;
let root: Root;

function mount(preview: EditPreview, locale: "es" | "en" = "es", extra: Parameters<typeof mockFetch>[0] = {}, onApplied = vi.fn()) {
  const mock = mockFetch(extra);
  vi.stubGlobal("fetch", mock.fetch);
  root = createRoot(host);
  act(() => root.render(<I18nProvider locale={locale} dict={locale === "es" ? es : en}><EditPreviewPanel movementId="m-1" preview={preview} onApplied={onApplied} onBack={() => undefined} /></I18nProvider>));
  return { mock, onApplied };
}
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
function typeText(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  document.cookie = "csrftoken=tok-test";
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("pantalla de confirmación de una edición", () => {
  it("muestra asientos que se anulan y nacen, saldos, «Gastado» por mes, 4x1000 y cuotas", () => {
    mount(PREVIEW);
    const text = host.textContent ?? "";
    expect(host.querySelector('[data-testid="edit-mode"]')?.textContent).toContain("reverso");
    expect(host.querySelector('[data-testid="entries-annulled"]')?.textContent).toContain("1284");
    expect(host.querySelectorAll('[data-testid="entries-created"] li')).toHaveLength(2);
    expect(host.querySelector('[data-testid="edit-balances"]')?.textContent).toContain("Ahorros Bancolombia");
    expect(host.querySelector('[data-testid="edit-balances"]')?.textContent).toContain("$3.240.000");
    expect(host.querySelector('[data-testid="edit-balances"]')?.textContent).toContain("$3.250.000");
    const spent = host.querySelector('[data-testid="edit-spent"]')?.textContent ?? "";
    expect(spent).toContain("Octubre 2026");
    expect(spent).toContain("Noviembre 2026");
    expect(spent).toContain("$720.000");
    expect(host.querySelector('[data-testid="edit-gmf"]')?.textContent).toMatch(/\$720.*\$680/);
    expect(text).toContain("El plan de cuotas");
    expect(text).toContain("$1.275.969");
    expect(text).toContain("$1.169.639");
    expect(text).toContain("Los extractos ya emitidos no cambian.");
    expect(text).toContain("Monto, Fecha");
  });

  it("una edición de una sola cifra se presenta como un asiento de ajuste; sin 4x1000 ni cuotas no inventa secciones", () => {
    const single = { ...PREVIEW, effects: { ...PREVIEW.effects, mode: "adjustment", chained: [], gmf: { before: null, after: null }, installments: null, entries_annulled: [], notes: [] } } as unknown as EditPreview;
    mount(single);
    expect(host.querySelector('[data-testid="edit-mode"]')?.textContent).toContain("asiento de ajuste");
    expect(host.querySelector('[data-testid="edit-gmf"]')).toBeNull();
    expect(host.querySelector('[data-testid="entries-annulled"]')).toBeNull();
    expect(host.textContent).not.toContain("El plan de cuotas");
  });

  it("en inglés", () => {
    mount(PREVIEW, "en");
    expect(host.textContent).toContain("Review the effect of the change");
    expect(host.textContent).toContain("October 2026");
  });

  it("«Aplicar» exige un motivo y manda el token con una Idempotency-Key; no hay montos en la URL", async () => {
    const { mock, onApplied } = mount(PREVIEW, "es", { "POST /api/fms/v1/movements/m-1/edit/apply": { status: 200, json: { movement: { id: "m-2" }, effects: PREVIEW.effects } } });
    const apply = () => [...host.querySelectorAll("button")].find((b) => b.type === "submit")!;
    expect(apply().disabled).toBe(true);
    typeText(host.querySelector("textarea")!, "Corrijo el monto del recibo");
    expect(apply().disabled).toBe(false);
    act(() => apply().click());
    await settle();
    const [call] = mock.calls.filter((c) => c.method === "POST");
    expect(call.url).toBe("/api/fms/v1/movements/m-1/edit/apply");
    expect(call.body).toEqual({ token: "tok-preview-123", reason: "Corrijo el monto del recibo" });
    expect(call.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(onApplied).toHaveBeenCalledOnce();
  });

  it("si el token caducó (409), muestra el error y no llama a onApplied; el reintento usa la misma clave", async () => {
    const { mock, onApplied } = mount(PREVIEW, "es", { "POST /api/fms/v1/movements/m-1/edit/apply": { status: 409, json: { code: "edit_token_expired" } } });
    typeText(host.querySelector("textarea")!, "motivo");
    const apply = () => [...host.querySelectorAll("button")].find((b) => b.type === "submit")!;
    act(() => apply().click());
    await settle();
    act(() => apply().click());
    await settle();
    expect(host.textContent).toContain(es.fin.errors.conflict);
    expect(onApplied).not.toHaveBeenCalled();
    const keys = mock.calls.filter((c) => c.method === "POST").map((c) => c.headers.get("Idempotency-Key"));
    expect(keys[0]).toBe(keys[1]);
  });
});

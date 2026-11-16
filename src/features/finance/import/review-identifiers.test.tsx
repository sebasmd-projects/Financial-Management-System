// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImportPreview, ImportPreviewRow } from "@/api/models";
import { mountScreen, wait, type Mounted } from "@/test/render";
import { ReviewStep } from "./review-step";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
  usePathname: () => "/es/finanzas/cuentas/importar",
  useSearchParams: () => new URLSearchParams(),
}));

const row = (number: number, extra: Partial<ImportPreviewRow>): ImportPreviewRow => ({
  number, date: "2026-11-03", amount: "-500000.00", description: "TRANSFERENCIAS A NEQUI", reference: "3000000001", match: "new", candidate_id: null, action: "import",
  counterparty: null, identifier: null, identifier_hint: null, recurrence: null, category_id: null, kind: null, installments: null, period_start: null, period_end: null,
  refund_of_id: null, refund_of_row: null, counter_account: null, issue: "", validity: "valid", reasons: [], ...extra,
});

const preview = (rows: ImportPreviewRow[]): ImportPreview => ({
  kind: "csv", needs_mapping: false, headers: [], sample: [], mapping: null, mapping_source: "saved", suggested_mapping: null,
  rows, recurrence_suggestions: [], errors: [], notes: [], meta: {}, counts: { new: rows.length },
  summary: { rows_read: rows.length, valid: rows.length, warnings: 0, errors: 0 }, target: "account", card: null, sign_detected: null, sign_used: null, kind_counts: {},
} as ImportPreview);

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});
const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
const click = (el: Element | undefined) => act(() => { (el as HTMLElement).click(); });

describe("vista previa con cuentas con nombre", () => {
  it("una cuenta con nombre muestra el nombre y «Nequi ··0001»; la que no, ofrece ponerle nombre con el valor del propio archivo", async () => {
    const onNamed = vi.fn();
    const rows = [
      row(1, { counterparty: "Mi Madre", identifier: { id: "i-1", channel: "nequi", last4: "0001" } }),
      row(2, { description: "PAGO QR TIERRA QUERIDA", reference: "", identifier_hint: { channel: "qr", value: "tierra querida", last4: "", name_hint: "Tierra Querida" } }),
      row(3, { match: "matches_pending", action: "confirm", description: "ARRIENDO", recurrence: { id: "r-1", name: "Arriendo" } }),
    ];
    view = await mountScreen(<ReviewStep preview={preview(rows)} choices={new Map()} onToggle={() => undefined} onNamed={onNamed} />, {
      "GET /api/fms/v1/counterparties?page_size=100": { status: 200, json: { count: 0, page: 1, page_size: 100, results: [] } },
      "POST /api/fms/v1/counterparties/name": { status: 200, json: { counterparty: { id: "p", name: "Salchi Papas", archived: false, identifiers: [], movements: 0 }, identifier: { id: "i", channel: "qr", last4: "" }, updated: 0 } },
    });
    const text = view.visible();
    expect(text).toContain("Mi Madre");
    expect(text).toContain("Nequi ··0001");
    expect(text).toContain("Confirma el pendiente de «Arriendo»");
    expect(text).toContain("Cuenta sin nombre: QR");
    click(button("Ponerle nombre"));
    await wait();
    const input = document.querySelector<HTMLInputElement>("input[type=text]")!;
    expect(input.value).toBe("Tierra Querida"); // el comercio del QR se propone como nombre
    click(button("Guardar nombre"));
    await wait();
    const call = view.mock.calls.find((c) => c.url.endsWith("/counterparties/name"));
    expect(call?.body).toEqual({ name: "Tierra Querida", channel: "qr", value: "tierra querida" });
    expect(onNamed).toHaveBeenCalledWith("Listo: Tierra Querida.");
  });

  it("no ofrece ponerle nombre si la pantalla no sabe volver a calcular la vista previa", async () => {
    const rows = [row(1, { identifier_hint: { channel: "nequi", value: "3000000001", last4: "0001", name_hint: "" } })];
    view = await mountScreen(<ReviewStep preview={preview(rows)} choices={new Map()} onToggle={() => undefined} />, {});
    expect(button("Ponerle nombre")).toBeUndefined();
  });
});

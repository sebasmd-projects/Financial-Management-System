// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { AuditScreen, MovementHistory } from "./audit-screen";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/es/finanzas/configuracion/auditoria",
}));

const ENTRY = {
  id: "e1",
  at: "2026-11-10T15:30:00Z",
  actor: "Ana",
  action: "change",
  object: "finance_moves.movement",
  object_id: "m-1",
  changed_fields: ["amount", "notes"],
  before: { amount: "180000.00" },
  after: { amount: "190000.00" },
  by_me: true,
  changes: [
    { field: "amount", before: "180000.00", after: "190000.00" },
    { field: "notes", before: null, after: "Ajuste de la tasa del banco" },
  ],
};
const ADMIN = { ...ENTRY, id: "e2", actor: "Soporte", action: "adjust", by_me: false, changes: [{ field: "name", before: "Viejo", after: "Nuevo" }], changed_fields: ["name"], object: "finance_ledger.exchangerate" };
const audit = (entries: unknown[]) => ({ status: 200, json: { count: entries.length, page: 1, page_size: 25, entries } });

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
});

describe("auditoría", () => {
  it("muestra antes y después de cada campo, quién lo hizo y cuándo (hora de Bogotá)", async () => {
    view = await mountScreen(<AuditScreen />, { "GET /api/fms/v1/audit?page_size=25": audit([ENTRY, ADMIN]) });
    const text = view.visible();
    expect(text).toContain("Cambió Movimiento");
    expect(text).toContain("10/11/2026 · 10:30");
    expect(text).toContain("Tú");
    expect(text).toContain("Administrador: Soporte");
    const rows = [...view.host.querySelectorAll("article")[0].querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((c) => c.textContent));
    expect(rows).toEqual([
      ["Monto", "180000.00", "190000.00"],
      ["Notas", "—", "Ajuste de la tasa del banco"],
    ]);
    expect(view.visible()).toContain("2 cambios");
  });

  it("los filtros viajan como parámetros (sin montos) y se pueden quitar", async () => {
    view = await mountScreen(<AuditScreen />, {
      "GET /api/fms/v1/audit?page_size=25": audit([ENTRY, ADMIN]),
      "GET /api/fms/v1/audit?page_size=25&action=adjust&by=admin&field=name&from=2026-11-01": audit([ADMIN]),
    });
    const selects = [...view.host.querySelectorAll<HTMLSelectElement>("form select")];
    typeInto(selects[1], "adjust");
    typeInto(selects[2], "admin");
    const texts = [...view.host.querySelectorAll<HTMLInputElement>("form input")];
    typeInto(texts[0], "name");
    typeInto(texts[1], "2026-11-01");
    click(byText(view.host, "form button", "Filtros"));
    await wait();
    const urls = view.mock.calls.map((c) => c.url);
    expect(urls).toContain("/api/fms/v1/audit?page_size=25&action=adjust&by=admin&field=name&from=2026-11-01");
    expect(urls.every((u) => !/amount|total|balance/i.test(u))).toBe(true);
    expect(view.visible()).toContain("1 cambios");
    click(byText(view.host, "button", "Quitar filtros"));
    await wait();
    expect(view.visible()).toContain("2 cambios");
  });

  it("una fecha inicial posterior a la final no se aplica", async () => {
    view = await mountScreen(<AuditScreen />, { "GET /api/fms/v1/audit?page_size=25": audit([ENTRY]) });
    const dates = [...view.host.querySelectorAll<HTMLInputElement>("form input[type=date]")];
    typeInto(dates[0], "2026-11-10");
    typeInto(dates[1], "2026-11-01");
    expect(view.visible()).toContain("La fecha inicial no puede ser posterior");
    expect(byText<HTMLButtonElement>(view.host, "form button", "Filtros").disabled).toBe(true);
  });

  it("vacío con y sin filtros, sin inventar nada", async () => {
    view = await mountScreen(<AuditScreen />, { "GET /api/fms/v1/audit?page_size=25": audit([]) });
    expect(view.visible()).toContain("Aún no hay cambios registrados");
  });

  it("el historial de un movimiento fija el objeto y su id", async () => {
    view = await mountScreen(<MovementHistory id="m-1" />, { "GET /api/fms/v1/audit?page_size=25&object=finance_moves.movement&object_id=m-1": audit([ENTRY]) });
    expect(view.visible()).toContain("Historial de cambios del movimiento");
    expect(view.visible()).toContain("Monto");
    expect(view.host.querySelector("form select option[value='finance_ledger.exchangerate']")).toBeNull(); // sin filtro de objeto
  });

  it("en inglés", async () => {
    view = await mountScreen(<AuditScreen />, { "GET /api/fms/v1/audit?page_size=25": audit([ENTRY]) }, "en");
    expect(view.visible()).toContain("Changed Movement");
    expect(view.visible()).toContain("Before");
  });
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import type { DeletionPreview } from "../../../../core/trash";
import { RemoveDialog } from "../shared/remove";
import { DeleteDialog } from "./delete-dialog";
import { TrashScreen } from "./trash-screen";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas" }));
const saved = vi.hoisted(() => vi.fn());
vi.mock("@/api/download", async (original) => ({ ...(await original<typeof import("@/api/download")>()), saveBlob: saved }));

const BASE: DeletionPreview = {
  kind: "account", id: "acc-1", label: "Nequi", retention_days: 30, affected: {}, items: {}, movements: 0,
  reconciled: { entries: 0, reconciliations: [] },
  export: { available: false, formats: [], preferred: null, count: 0 },
  returns_to: [], digest: "d1",
};
const PREVIEW = "GET /api/fms/v1/deletions/preview?kind=account&id=acc-1";
const DELETION = { id: "del-1", kind: "account", object_id: "acc-1", label: "Nequi", deleted_at: "2026-11-14T15:00:00Z", purge_after: "2026-12-14T15:00:00Z", days_left: 30, affected: { movements: 3 }, deleted_by: { id: "1", name: "Ana" } };

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  saved.mockReset();
});
const dialog = () => document.querySelector("dialog")?.textContent ?? "";

describe("eliminar con vista previa", () => {
  it("lista lo que cae, y al confirmar manda el digest con una Idempotency-Key", async () => {
    const done = vi.fn();
    const preview = { ...BASE, affected: { movements: 3, cards: 1, payment_methods: 2 }, items: { cards: [{ id: "c1", label: "Visa" }] }, movements: 3 };
    mounted = await mountScreen(<RemoveDialog open kind="account" id="acc-1" name="Nequi" onClose={() => undefined} onDone={done} />, {
      [PREVIEW]: { status: 200, json: preview },
      "POST /api/fms/v1/deletions": { status: 201, json: DELETION },
    });
    expect(dialog()).toContain("¿Eliminar «Nequi»?");
    expect(dialog()).toContain("3 movimientos");
    expect(dialog()).toContain("1 tarjeta");
    expect(dialog()).toContain("2 medios de pago");
    expect(dialog()).toContain("Visa");
    click(byText(document.body, "button", "Sí, eliminar todo"));
    await wait();
    const post = mounted.mock.calls.find((c) => c.method === "POST");
    expect(post?.body).toEqual({ kind: "account", id: "acc-1", digest: "d1" });
    expect(post?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(done).toHaveBeenCalled();
  });

  it("sin nada más que arrastrar, la confirmación es corta", async () => {
    mounted = await mountScreen(<DeleteDialog open kind="account" id="acc-1" name="Nequi" onClose={() => undefined} onDone={() => undefined} />, { [PREVIEW]: { status: 200, json: BASE } });
    expect(dialog()).toContain("No arrastra nada más");
    expect(dialog()).toContain("Sí, eliminar");
    expect(dialog()).not.toContain("Sí, eliminar todo");
  });

  it("cancelar no escribe nada", async () => {
    const close = vi.fn();
    mounted = await mountScreen(<DeleteDialog open kind="account" id="acc-1" name="Nequi" onClose={close} onDone={() => undefined} />, { [PREVIEW]: { status: 200, json: BASE } });
    click(byText(document.body, "button", "Cancelar"));
    expect(mounted.mock.calls.filter((c) => c.method !== "GET")).toEqual([]);
    expect(close).toHaveBeenCalled();
  });

  it("si lo que caería cambió (409 preview_stale) no cierra: vuelve a pedir la vista previa y avisa", async () => {
    const done = vi.fn();
    mounted = await mountScreen(<DeleteDialog open kind="account" id="acc-1" name="Nequi" onClose={() => undefined} onDone={done} />, {
      [PREVIEW]: { status: 200, json: BASE },
      "POST /api/fms/v1/deletions": { status: 409, json: { code: "preview_stale" } },
    });
    click(byText(document.body, "button", "Sí, eliminar"));
    await wait();
    await wait();
    expect(done).not.toHaveBeenCalled();
    expect(dialog()).toContain("ya está actualizado");
    expect(mounted.mock.calls.filter((c) => c.method === "GET" && c.url.includes("deletions/preview"))).toHaveLength(2);
  });

  it("un fallo al pedir la vista previa se dice y se puede reintentar", async () => {
    mounted = await mountScreen(<DeleteDialog open kind="account" id="acc-1" name="Nequi" onClose={() => undefined} onDone={() => undefined} />, { [PREVIEW]: { status: 500, json: {} } });
    expect(dialog()).toContain("Reintentar");
    expect(dialog()).not.toContain("Sí, eliminar");
  });
});

describe("conciliados", () => {
  const withRec = { ...BASE, affected: { movements: 1 }, movements: 1, reconciled: { entries: 1, reconciliations: [{ id: "rec-1", account_id: "acc-1", cutoff: "2026-10-31" }] } };
  it("avisa que quedaría «descuadrada» y deja eliminar sin reabrir", async () => {
    const done = vi.fn();
    mounted = await mountScreen(<DeleteDialog open kind="account" id="acc-1" name="Nequi" onClose={() => undefined} onDone={done} />, {
      [PREVIEW]: { status: 200, json: withRec },
      "POST /api/fms/v1/deletions": { status: 201, json: DELETION },
    });
    expect(dialog()).toContain("Hay movimientos conciliados");
    expect(dialog()).toContain("«descuadrada»");
    click(byText(document.body, "button", "Sí, eliminar todo"));
    await wait();
    expect(done).toHaveBeenCalled();
    expect(mounted.mock.calls.some((c) => c.url.includes("/reopen"))).toBe(false);
  });

  it("«Reabrir la conciliación» pide un motivo, la reabre y vuelve a revisar", async () => {
    let reopened = false;
    mounted = await mountScreen(<DeleteDialog open kind="account" id="acc-1" name="Nequi" onClose={() => undefined} onDone={() => undefined} />, {
      [PREVIEW]: () => ({ status: 200, json: reopened ? { ...withRec, reconciled: { entries: 0, reconciliations: [] } } : withRec }),
      "POST /api/fms/v1/reconciliations/rec-1/reopen": () => {
        reopened = true;
        return { status: 200, json: {} };
      },
    });
    const button = byText<HTMLButtonElement>(document.body, "button", "Reabrir la conciliación");
    expect(button.disabled).toBe(true);
    const reason = document.querySelector<HTMLInputElement>("dialog input[type='text']")!;
    typeInto(reason, "Corregir el extracto");
    click(byText(document.body, "button", "Reabrir la conciliación"));
    await wait();
    await wait();
    const reopen = mounted.mock.calls.find((c) => c.url.includes("/reopen"));
    expect(reopen?.body).toEqual({ reason: "Corregir el extracto" });
    expect(dialog()).not.toContain("Hay movimientos conciliados");
  });
});

describe("exportar antes", () => {
  const withMoves = { ...BASE, affected: { movements: 5 }, movements: 5, export: { available: true, formats: ["csv", "json"], preferred: "csv", count: 5 } };
  it("ofrece el CSV y el JSON, y descarga el archivo que el servidor arma", async () => {
    mounted = await mountScreen(<DeleteDialog open kind="account" id="acc-1" name="Nequi" onClose={() => undefined} onDone={() => undefined} />, {
      [PREVIEW]: { status: 200, json: withMoves },
      "POST /api/fms/v1/deletions/export": { status: 200, body: "Fecha,Descripcion,Valor,Referencia\n" },
    });
    expect(dialog()).toContain("Exportar antes de eliminar");
    expect(dialog()).toContain("5 movimientos");
    click(byText(document.body, "button", "Descargar CSV"));
    await wait();
    await wait();
    const post = mounted.mock.calls.find((c) => c.url.endsWith("/deletions/export"));
    expect(post?.body).toEqual({ kind: "account", id: "acc-1", format: "csv" });
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.calls[0][1]).toMatch(/^account-movimientos-\d{4}-\d{2}-\d{2}\.csv$/);
  });
  it("sin movimientos no hay nada que exportar", async () => {
    mounted = await mountScreen(<DeleteDialog open kind="account" id="acc-1" name="Nequi" onClose={() => undefined} onDone={() => undefined} />, { [PREVIEW]: { status: 200, json: BASE } });
    expect(dialog()).not.toContain("Exportar antes de eliminar");
  });
});

describe("la Papelera", () => {
  it("lista lo eliminado con los días que quedan y restaura", async () => {
    let restored = false;
    mounted = await mountScreen(<TrashScreen />, {
      "GET /api/fms/v1/deletions": () => ({ status: 200, json: restored ? [] : [DELETION] }),
      "POST /api/fms/v1/deletions/del-1/restore": () => {
        restored = true;
        return { status: 200, json: DELETION };
      },
    });
    const text = mounted.visible();
    expect(text).toContain("Nequi");
    expect(text).toContain("Cuenta");
    expect(text).toContain("Eliminado por Ana el 14/11/2026");
    expect(text).toContain("Quedan 30 días para restaurarlo");
    expect(text).toContain("3 movimientos");
    click(byText(mounted.host, "button", "Restaurar"));
    await wait();
    await wait();
    expect(mounted.visible()).toContain("Restaurado");
    expect(mounted.visible()).toContain("La papelera está vacía");
  });
  it("vacía, lo dice", async () => {
    mounted = await mountScreen(<TrashScreen />, { "GET /api/fms/v1/deletions": { status: 200, json: [] } });
    expect(mounted.visible()).toContain("La papelera está vacía");
  });
});

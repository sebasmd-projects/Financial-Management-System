import { describe, expect, it } from "vitest";
import type { ApiResult } from "./api/client";
import { affectedRows, daysLeft, deletionBody, exportChoices, exportFileName, hasReconciled, isSimple, reopenReason, shouldRefetchPreview, trashApi, trashPaths, type Deletion, type DeletionPreview, type TrashClient } from "./trash";

const PREVIEW: DeletionPreview = {
  kind: "account",
  id: "acc-1",
  label: "Nequi",
  retention_days: 30,
  affected: { cards: 1, movements: 12, budgets: 0, payment_methods: 2, movements_uncategorized: 0, something_new: 3 },
  items: {},
  movements: 12,
  reconciled: { entries: 0, reconciliations: [] },
  export: { available: true, formats: ["csv", "json"], preferred: "csv", count: 12 },
  returns_to: [],
  digest: "abc123",
};

describe("rutas", () => {
  it("la vista previa lleva solo tipo e id (nunca montos) y los escapa", () => {
    expect(trashPaths.preview("account", "a b/c")).toBe("/deletions/preview?kind=account&id=a%20b%2Fc");
    expect(trashPaths.restore("x/y")).toBe("/deletions/x%2Fy/restore");
    expect(trashPaths.list).toBe("/deletions");
  });
});

describe("lo que se verá afectado", () => {
  it("ordena lo conocido primero, descarta los ceros y deja lo nuevo al final", () => {
    expect(affectedRows(PREVIEW)).toEqual([
      { key: "movements", count: 12 },
      { key: "cards", count: 1 },
      { key: "payment_methods", count: 2 },
      { key: "something_new", count: 3 },
    ]);
  });
  it("una confirmación es simple solo si no cae nada más, no hay conciliados ni exportación", () => {
    expect(isSimple(PREVIEW)).toBe(false);
    expect(isSimple({ affected: { movements: 0 }, reconciled: { entries: 0, reconciliations: [] }, export: { available: false, formats: [], preferred: null, count: 0 } })).toBe(true);
    expect(isSimple({ affected: {}, reconciled: { entries: 1, reconciliations: [] }, export: { available: false, formats: [], preferred: null, count: 0 } })).toBe(false);
  });
  it("detecta lo conciliado", () => {
    expect(hasReconciled(PREVIEW)).toBe(false);
    expect(hasReconciled({ reconciled: { entries: 2, reconciliations: [] } })).toBe(true);
  });
});

describe("exportar antes", () => {
  it("ofrece el CSV primero en una cuenta de activo y solo JSON en el resto", () => {
    expect(exportChoices(PREVIEW)).toEqual({ available: true, formats: ["csv", "json"], preferred: "csv" });
    expect(exportChoices({ export: { available: true, formats: ["json"], preferred: "json", count: 3 } })).toEqual({ available: true, formats: ["json"], preferred: "json" });
  });
  it("sin movimientos no ofrece nada, y un formato desconocido se ignora", () => {
    expect(exportChoices({ export: { available: false, formats: [], preferred: null, count: 0 } }).available).toBe(false);
    expect(exportChoices({ export: { available: true, formats: ["xml"], preferred: "xml", count: 1 } })).toEqual({ available: false, formats: [], preferred: null });
  });
  it("el nombre del archivo lleva el tipo, el formato y la fecha", () => {
    expect(exportFileName("account", "csv", "2026-11-14")).toBe("account-movimientos-2026-11-14.csv");
  });
});

describe("confirmar", () => {
  it("el cuerpo lleva el digest de lo que se vio; sin vista previa, no", () => {
    expect(deletionBody("movement", "m-1", PREVIEW)).toEqual({ kind: "movement", id: "m-1", digest: "abc123" });
    expect(deletionBody("movement", "m-1", null)).toEqual({ kind: "movement", id: "m-1" });
  });
  it("solo preview_stale pide volver a revisar", () => {
    expect(shouldRefetchPreview("preview_stale")).toBe(true);
    expect(shouldRefetchPreview("network")).toBe(false);
  });
  it("el motivo de reabrir una conciliación no puede estar vacío ni pasar de 200", () => {
    expect(reopenReason("  ")).toBeNull();
    expect(reopenReason(" corregir ")).toBe("corregir");
    expect(reopenReason("x".repeat(201))).toBeNull();
  });
  it("los días restantes se acotan a 0..30", () => {
    expect(daysLeft({ days_left: 45 })).toBe(30);
    expect(daysLeft({ days_left: -2 })).toBe(0);
    expect(daysLeft({ days_left: 12.7 })).toBe(12);
  });
});

describe("el cliente", () => {
  function fake() {
    const calls: { method: string; path: string; body?: unknown; options?: Record<string, unknown> }[] = [];
    const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, status: 200, data });
    const client: TrashClient = {
      get: async <T,>(path: string, options?: Record<string, unknown>) => {
        calls.push({ method: "GET", path, options });
        return ok({} as T);
      },
      post: async <T,>(path: string, body?: unknown, options?: Record<string, unknown>) => {
        calls.push({ method: "POST", path, body, options });
        return ok({} as T);
      },
    };
    return { calls, api: trashApi(client) };
  }
  it("pide la vista previa, elimina con Idempotency-Key y digest, lista y restaura", async () => {
    const { calls, api } = fake();
    await api.preview("loan", "l-1");
    await api.remove("loan", "l-1", PREVIEW, "key-1");
    await api.list();
    await api.restore("d-1");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /deletions/preview?kind=loan&id=l-1", "POST /deletions", "GET /deletions", "POST /deletions/d-1/restore"]);
    expect(calls[1].body).toEqual({ kind: "loan", id: "l-1", digest: "abc123" });
    expect(calls[1].options?.idempotencyKey).toBe("key-1");
  });
  it("exporta como archivo (asBlob) con el formato en el cuerpo, y reabre con motivo", async () => {
    const { calls, api } = fake();
    await api.exportFile("account", "a-1", "csv");
    await api.reopenReconciliation("r-1", "corregir");
    expect(calls[0]).toMatchObject({ path: "/deletions/export", body: { kind: "account", id: "a-1", format: "csv" } });
    expect(calls[0].options?.asBlob).toBe(true);
    expect(calls[1]).toMatchObject({ path: "/reconciliations/r-1/reopen", body: { reason: "corregir" } });
  });
  it("un tipo de eliminado de la lista tiene su forma", () => {
    const row: Deletion = { id: "d", kind: "movement", object_id: "o", label: "x", deleted_at: "2026-11-14T10:00:00Z", purge_after: "2026-12-14T10:00:00Z", days_left: 30, affected: {}, deleted_by: null };
    expect(daysLeft(row)).toBe(30);
  });
});

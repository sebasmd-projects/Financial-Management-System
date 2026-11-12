import { describe, expect, it } from "vitest";
import { blockerItems, moveBlocker, shareable } from "./blockers";

describe("bloqueos estructurados (blockers del 409)", () => {
  it("lee la lista tal cual, en el orden del servidor", () => {
    expect(blockerItems({ blockers: [{ kind: "goal", count: 2 }, { kind: "reconciliation", count: 1 }] })).toEqual([
      { kind: "goal", count: 2 },
      { kind: "reconciliation", count: 1 },
    ]);
  });
  it("suma un tipo repetido, manda lo desconocido a «other» y descarta lo que no es una lista válida", () => {
    expect(blockerItems({ blockers: [{ kind: "budget", count: 1 }, { kind: "budget", count: 2 }, { kind: "algo_nuevo", count: 4 }, null, { count: 3 }] })).toEqual([
      { kind: "budget", count: 3 },
      { kind: "other", count: 4 },
    ]);
    expect(blockerItems(undefined)).toEqual([]);
    expect(blockerItems({ blockers: "x" })).toEqual([]);
    expect(blockerItems({ detail: "finance_planning.goal" })).toEqual([]);
  });
});

describe("bloqueos de pasar o sacar una cuenta", () => {
  it.each(["pending_entries", "linked_transfers", "reconciled_entries", "account_not_movable", "not_your_shared_account", "household_read_only"])("%s", (code) => {
    expect(moveBlocker({ code, data: { code, detail: "x" } })).toEqual({ code, items: [] });
  });
  it("account_in_use trae los tipos de blockers", () => {
    expect(moveBlocker({ code: "account_in_use", data: { code: "account_in_use", detail: "x", blockers: [{ kind: "recurrence", count: 1 }] } })).toEqual({ code: "account_in_use", items: [{ kind: "recurrence", count: 1 }] });
  });
  it("otro fallo (red, sesión) no es un bloqueo", () => {
    expect(moveBlocker({ code: "network", data: undefined })).toBeNull();
    expect(moveBlocker({ code: "http_500", data: {} })).toBeNull();
  });
  it("solo bancos y efectivo sin padre se ofrecen", () => {
    const base = { type: "asset", system_key: "", parent_id: null };
    expect(shareable({ ...base, kind: "savings" })).toBe(true);
    expect(shareable({ ...base, kind: "cash" })).toBe(true);
    expect(shareable({ ...base, kind: "pocket", parent_id: "p" })).toBe(false);
    expect(shareable({ ...base, kind: "credit_card", type: "liability" })).toBe(false);
    expect(shareable({ ...base, kind: "vehicle" })).toBe(false);
    expect(shareable({ ...base, kind: "savings", system_key: "household_clearing" })).toBe(false);
  });
});

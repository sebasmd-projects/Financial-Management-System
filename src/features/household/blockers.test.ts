import { describe, expect, it } from "vitest";
import { inUseKinds, moveBlocker, shareable } from "./blockers";

describe("módulos personales que usan la cuenta (account_in_use)", () => {
  it("los clasifica y los ordena", () => {
    expect(inUseKinds("finance_planning.goal, finance_reconcile.reconciliation, finance_recurring.recurrence")).toEqual(["reconciliations", "recurrences", "goals"]);
    expect(inUseKinds("finance_planning.budget,finance_imports.importbatch")).toEqual(["budgets", "imports"]);
  });
  it("lo desconocido o ausente cae en «otros módulos»", () => {
    expect(inUseKinds("finance_credit.loan")).toEqual(["other"]);
    expect(inUseKinds(undefined)).toEqual(["other"]);
    expect(inUseKinds("")).toEqual(["other"]);
  });
});

describe("bloqueos de pasar o sacar una cuenta", () => {
  it.each(["pending_entries", "linked_transfers", "reconciled_entries", "account_not_movable", "not_your_shared_account", "household_read_only"])("%s", (code) => {
    expect(moveBlocker({ code, data: { code, detail: "x" } })).toEqual({ code, kinds: [] });
  });
  it("account_in_use trae los módulos del detalle", () => {
    expect(moveBlocker({ code: "account_in_use", data: { code: "account_in_use", detail: "finance_recurring.recurrence" } })).toEqual({ code: "account_in_use", kinds: ["recurrences"] });
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

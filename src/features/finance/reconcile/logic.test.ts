import { describe, expect, it } from "vitest";
import type { Candidate, Reconciliation } from "@/api/models";
import { canReconcile, differenceOf, markedBalance, reopenable, signedStatementBalance } from "./logic";

const c = (entry_id: string, effect: string) => ({ entry_id, effect }) as Candidate;

describe("conciliación: cuentas", () => {
  // Ejemplo del diseño §3.6: extracto 3.512.400; marcado 3.467.400; diferencia −45.000.
  const candidates = [c("a", "-182300.00"), c("b", "5200000.00"), c("c", "-200000.00")];
  it("marcado = ya conciliado + efecto de lo marcado, y la diferencia es extracto − marcado", () => {
    const marked = markedBalance("-1350300.00", candidates, new Set(["a", "b"]));
    expect(marked).toBe("3667400.00");
    expect(differenceOf("3512400.00", marked)).toBe("-155000.00");
    expect(differenceOf("3512400", markedBalance("0", [c("x", "3467400")], new Set(["x"])))).toBe("45000.00");
  });
  it("sin marcar nada, el marcado es lo ya conciliado", () => {
    expect(markedBalance("100.00", candidates, new Set())).toBe("100.00");
  });
  it("centavos exactos, sin Number", () => {
    expect(markedBalance("0", [c("a", "0.10"), c("b", "0.20")], new Set(["a", "b"]))).toBe("0.30");
  });
  it("solo se concilia con diferencia cero y al menos un movimiento marcado", () => {
    expect(canReconcile("0.00", 3)).toBe(true);
    expect(canReconcile("0.00", 0)).toBe(false);
    expect(canReconcile("-45000.00", 3)).toBe(false);
  });
  it("saldo negativo del extracto", () => {
    expect(signedStatementBalance("1500", true)).toBe("-1500.00");
    expect(signedStatementBalance("1500", false)).toBe("1500");
    expect(signedStatementBalance("0", true)).toBe("0");
    expect(signedStatementBalance(null, true)).toBeNull();
  });
  it("solo la última conciliación cerrada se puede reabrir", () => {
    const r = (id: string, cutoff: string, status: Reconciliation["status"], closed_at = "2026-01-01T00:00:00Z") => ({ id, cutoff, status, closed_at }) as Reconciliation;
    expect(reopenable([r("1", "2026-09-30", "closed"), r("2", "2026-10-31", "closed"), r("3", "2026-08-31", "closed")])?.id).toBe("2");
    expect(reopenable([r("1", "2026-10-31", "reopened"), r("2", "2026-09-30", "closed")])?.id).toBe("2");
    expect(reopenable([r("1", "2026-10-31", "reopened")])).toBeNull();
    expect(reopenable([])).toBeNull();
    // «descuadrada» (se eliminó un movimiento conciliado): también se reabre, para volver a conciliar
    expect(reopenable([r("1", "2026-09-30", "closed"), r("2", "2026-10-31", "unbalanced")])?.id).toBe("2");
  });
});

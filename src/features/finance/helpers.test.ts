import { describe, expect, it } from "vitest";
import type { AccountKind } from "@/api/models";
import { es } from "@/i18n/dictionaries/es";
import { formatCop } from "@/lib/money";
import { accountGroup, dayNet, effectPhrase, fill, groupByDate, movementAccounts, netContribution, relativeDays, signedAmount, topByFrequency, wouldOverdraw } from "./helpers";

const m = (type: "income" | "expense" | "transfer", amount: string, status: "pendiente" | "confirmado" | "anulado" = "confirmado", voided = false) => ({ type, amount, status, voided });

describe("montos con signo en las listas", () => {
  it("egreso negativo, ingreso con +, transferencia sin signo", () => {
    expect(signedAmount(m("expense", "180000.00"))).toEqual({ value: "-180000.00", sign: "auto" });
    expect(signedAmount(m("income", "5200000.00"))).toEqual({ value: "5200000.00", sign: "always" });
    expect(signedAmount(m("transfer", "100.00"))).toEqual({ value: "100.00", sign: "auto" });
  });
  it("no depende de que la API mande el monto con signo", () => {
    expect(signedAmount(m("expense", "-180000.00")).value).toBe("-180000.00");
  });
});

describe("neto del día", () => {
  it("ingresos suman, egresos restan; pendientes, anulados y transferencias no cuentan; exacto al centavo", () => {
    const items = [m("income", "0.10"), m("expense", "0.30"), m("expense", "999999.00", "pendiente"), m("expense", "50.00", "anulado"), m("expense", "70.00", "confirmado", true), m("transfer", "1000.00")];
    expect(dayNet(items)).toBe("-0.20");
    expect(netContribution(m("transfer", "5.00"))).toBe("0.00");
  });
});

describe("agrupar por día conservando el orden", () => {
  it("agrupa consecutivos", () => {
    const groups = groupByDate([{ date: "2026-11-10", id: 1 }, { date: "2026-11-10", id: 2 }, { date: "2026-11-09", id: 3 }]);
    expect(groups.map((g) => [g.date, g.items.length])).toEqual([["2026-11-10", 2], ["2026-11-09", 1]]);
  });
});

describe("cuentas", () => {
  const acc = (kind: string, status = "active") => ({ kind, status }) as never;
  it("grupos y cuentas con las que se puede mover plata", () => {
    expect(accountGroup({ kind: "savings" })).toBe("bancos");
    expect(accountGroup({ kind: "cash" })).toBe("efectivo");
    expect(accountGroup({ kind: "credit_card" })).toBe("credito");
    expect(accountGroup({ kind: "loan" })).toBe("prestamo");
    expect(movementAccounts([acc("savings"), acc("loan"), acc("credit_card"), acc("cash", "closed")]).map((a) => a.kind)).toEqual(["savings", "credit_card"]);
  });
  it("saldo insuficiente: aviso si quedaría por debajo de cero; una tarjeta no", () => {
    expect(wouldOverdraw({ kind: "savings" as AccountKind, posted_balance: "100000.00" }, "120000")).toBe(true);
    expect(wouldOverdraw({ kind: "savings" as AccountKind, posted_balance: "100000.00" }, "100000")).toBe(false);
    expect(wouldOverdraw({ kind: "credit_card" as AccountKind, posted_balance: "0.00" }, "120000")).toBe(false);
  });
});

describe("frases de efecto (diseño §3.2)", () => {
  const t = es.fin.form.effect;
  const savings = { name: "Ahorros Bancolombia", kind: "savings" as AccountKind, posted_balance: "3420000.00" };
  const visa = { name: "Visa", kind: "credit_card" as AccountKind, posted_balance: "0.00" };
  it("egreso de una cuenta: dice cuánto queda", () => {
    expect(effectPhrase({ type: "expense", pending: false, account: savings, toAccount: null, amount: "180000" }, t, formatCop)).toBe("Sale de Ahorros Bancolombia. Quedan $3.240.000.");
  });
  it("egreso con tarjeta: se suma a la deuda; transferencia a tarjeta: baja la deuda", () => {
    expect(effectPhrase({ type: "expense", pending: false, account: visa, toAccount: null, amount: "1" }, t, formatCop)).toContain("Se suma a la deuda de Visa");
    expect(effectPhrase({ type: "transfer", pending: false, account: savings, toAccount: visa, amount: "1" }, t, formatCop)).toBe("Pagas Visa desde Ahorros Bancolombia. Baja la deuda; no es un gasto nuevo.");
  });
  it("transferencia entre cuentas, ingreso y pendiente", () => {
    const nequi = { name: "Nequi", kind: "wallet" as AccountKind };
    expect(effectPhrase({ type: "transfer", pending: false, account: savings, toAccount: nequi, amount: null }, t, formatCop)).toBe("Pasa de Ahorros Bancolombia a Nequi. No cambia cuánto tienes.");
    expect(effectPhrase({ type: "income", pending: false, account: savings, toAccount: null, amount: null }, t, formatCop)).toBe("Entra a Ahorros Bancolombia.");
    expect(effectPhrase({ type: "expense", pending: true, account: savings, toAccount: null, amount: "1" }, t, formatCop)).toBe(t.pending);
  });
});

describe("utilidades", () => {
  it("fill sustituye lo que conoce y deja el resto", () => {
    expect(fill("{a} y {b}", { a: "1" })).toBe("1 y {b}");
  });
  it("relativeDays", () => {
    const t = es.fin.relative;
    expect([0, 1, 6, -1, -2].map((d) => relativeDays(d, t))).toEqual(["hoy", "mañana", "en 6 días", "hace 1 día", "hace 2 días"]);
  });
  it("topByFrequency: por frecuencia y, en empate, el más reciente (primero)", () => {
    expect(topByFrequency(["b", "a", "a", "c", "b", "d"], (x) => x, 3)).toEqual(["b", "a", "c"]);
    expect(topByFrequency([null, "x"], (x) => x, 5)).toEqual(["x"]);
  });
});

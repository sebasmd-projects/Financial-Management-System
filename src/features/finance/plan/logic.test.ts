import { describe, expect, it } from "vitest";
import type { Account, Category, Named } from "@/api/models";
import { budgetBody, budgetName, EMPTY_BUDGET, EMPTY_GOAL, goalBody, goalTab, parseThresholds, targetOptions } from "./logic";

const cat = (id: string, name: string, parent_id: string | null, kind = "expense"): Category => ({ id, name, kind, parent_id, path: parent_id ? ["Comida", name] : [name], account_id: "a", default_nature: "", default_classification: "", archived: false }) as Category;
const lookups = {
  categories: [cat("c1", "Comida", null), cat("c2", "Mercado", "c1"), cat("c3", "Salario", null, "income")],
  accounts: [{ id: "acc1", name: "Ahorros", status: "active" }, { id: "acc2", name: "Vieja", status: "closed" }] as Account[],
  tags: [{ id: "t1", name: "Viaje", archived: false }] as Named[],
  costCenters: [{ id: "cc1", name: "Casa", archived: false }] as Named[],
};

describe("presupuestos: las 5 dimensiones", () => {
  it("cada dimensión ofrece lo suyo (egresos raíz, subcategorías, cuentas abiertas, centros, etiquetas)", () => {
    expect(targetOptions("category", lookups).map((o) => o.value)).toEqual(["c1"]);
    expect(targetOptions("subcategory", lookups)).toEqual([{ value: "c2", label: "Comida › Mercado" }]);
    expect(targetOptions("account", lookups).map((o) => o.value)).toEqual(["acc1"]);
    expect(targetOptions("cost_center", lookups).map((o) => o.label)).toEqual(["Casa"]);
    expect(targetOptions("tag", lookups).map((o) => o.label)).toEqual(["Viaje"]);
  });
  it("el nombre es la etiqueta propia o lo presupuestado", () => {
    expect(budgetName({ label: "Súper", dimension: "category", target_id: "c1" }, lookups)).toBe("Súper");
    expect(budgetName({ label: null, dimension: "category", target_id: "c1" }, lookups)).toBe("Comida");
    expect(budgetName({ label: null, dimension: "account", target_id: "acc2" }, lookups)).toBe("Vieja");
    expect(budgetName({ label: null, dimension: "tag", target_id: "zz" }, lookups)).toBe("—");
  });
  it("el alta pide objetivo y límite positivo; el límite va como cadena decimal", () => {
    expect(budgetBody(EMPTY_BUDGET).problems).toEqual({ target: true, limit: true });
    const ok = budgetBody({ ...EMPTY_BUDGET, target: "c1", limit: "800.000" });
    expect(ok.body).toEqual({ dimension: "category", target_id: "c1", limit: "800000", period: "monthly", warn_percent: 80, exceed_percent: 100 });
  });
  it("periodo personalizado necesita las dos fechas en orden", () => {
    const base = { ...EMPTY_BUDGET, target: "c1", limit: "1", period: "custom" as const };
    expect(budgetBody(base).problems.dates).toBe(true);
    expect(budgetBody({ ...base, customStart: "2026-12-01", customEnd: "2026-11-01" }).problems.dates).toBe(true);
    expect(budgetBody({ ...base, customStart: "2026-11-01", customEnd: "2026-11-15" }).body).toMatchObject({ custom_start: "2026-11-01", custom_end: "2026-11-15" });
  });
  it("umbrales: la atención va antes que el exceso", () => {
    expect(parseThresholds("80", "100")).toEqual({ warn: 80, exceed: 100 });
    expect(parseThresholds("100", "80")).toBeNull();
    expect(parseThresholds("x", "100")).toBeNull();
  });
});

describe("metas", () => {
  it("Ahorro y Objetivos reparten los tipos", () => {
    expect(goalTab("emergency_fund")).toBe("ahorro");
    expect(goalTab("pay_debt")).toBe("objetivos");
    expect(goalTab("vehicle")).toBe("objetivos");
  });
  it("crear una meta pide nombre y objetivo; sin cuenta crea el fondo, con cuenta lo enlaza", () => {
    expect(goalBody(EMPTY_GOAL).problems).toEqual({ name: true, target: true });
    expect(goalBody({ ...EMPTY_GOAL, name: "Vacaciones", kind: "vacation", target: "12.000.000", date: "2027-11-30", planned: "733.000" }).body).toEqual({
      name: "Vacaciones",
      kind: "vacation",
      target_amount: "12000000",
      target_date: "2027-11-30",
      planned_contribution: "733000",
    });
    expect(goalBody({ ...EMPTY_GOAL, name: "x", target: "5", account: "acc1" }).body?.account_id).toBe("acc1");
  });
  it("pagar una deuda enlaza un pasivo (obligatorio)", () => {
    expect(goalBody({ ...EMPTY_GOAL, name: "Tarjeta", kind: "pay_debt", target: "1000" }).problems.debt).toBe(true);
    expect(goalBody({ ...EMPTY_GOAL, name: "Tarjeta", kind: "pay_debt", target: "1000", debtAccount: "p1", account: "ignorada" }).body).toMatchObject({ debt_account_id: "p1" });
    expect(goalBody({ ...EMPTY_GOAL, name: "Tarjeta", kind: "pay_debt", target: "1000", debtAccount: "p1" }).body).not.toHaveProperty("account_id");
  });
  it("un aporte planeado inválido se señala", () => {
    expect(goalBody({ ...EMPTY_GOAL, name: "x", target: "5", planned: "abc" }).problems.planned).toBe(true);
  });
});

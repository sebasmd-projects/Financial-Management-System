import { describe, expect, it } from "vitest";
import { ROUTES } from "@/nav/routes";
import { assignableRoles, blockedInScope, canManageRole, canRemove, canWriteRole, invitableRoles, isPersonalOnlyRoute, reportScopeFields, sameScope, scopedPath, scopeKey, type Scope } from "./scope";

const HID = "7b0a6f0e-0000-4000-8000-000000000001";
const household: Scope = { kind: "household", id: HID };
const both: Scope = { kind: "both", id: HID };
const personal: Scope = { kind: "personal" };

describe("ruta de la API según el ámbito", () => {
  it("personal y «Ambos» no cambian la ruta (las listas de «Ambos» son las personales)", () => {
    expect(scopedPath("/accounts?page_size=100", personal)).toBe("/accounts?page_size=100");
    expect(scopedPath("/accounts?page_size=100", both)).toBe("/accounts?page_size=100");
  });
  it.each([
    ["/accounts?page_size=100", `/households/${HID}/accounts?page_size=100`],
    ["/accounts/a1", `/households/${HID}/accounts/a1`],
    ["/movements/search", `/households/${HID}/movements/search`],
    ["/movements/m1/annul", `/households/${HID}/movements/m1/annul`],
    ["/transfers", `/households/${HID}/transfers`],
    ["/reports/statistics/query", `/households/${HID}/reports/statistics/query`],
    ["/reports", `/households/${HID}/reports`],
    ["/dashboard?period=2026-10", `/households/${HID}/dashboard?period=2026-10`],
    ["/summary", `/households/${HID}/summary`],
    ["/categories?page_size=200", `/households/${HID}/categories?page_size=200`],
    ["/payment-methods", `/households/${HID}/payment-methods`],
  ])("en el hogar %s → hogar", (path, expected) => {
    expect(scopedPath(path, household)).toBe(expected);
  });
  it.each(["/cards?page_size=100", "/loans", "/recurrences", "/budgets", "/goals", "/imports", "/assets", "/automation/rules", "/custom-attributes", "/institutions", "/notifications", "/households", "/household-invitations/i1/accept", `/households/${HID}/leave`])(
    "%s sigue siendo personal / de gestión en el hogar",
    (path) => {
      expect(scopedPath(path, household)).toBe(path);
    },
  );
  it("pasar una cuenta al hogar es personal aunque empiece por «accounts»", () => {
    expect(scopedPath("/accounts/a1/share", household)).toBe("/accounts/a1/share");
    expect(scopedPath("/accounts/a1", household)).not.toBe("/accounts/a1");
  });
  it("el consolidado de informes va en el cuerpo, solo en «Ambos»", () => {
    expect(reportScopeFields(both)).toEqual({ scope: "both", household_id: HID });
    expect(reportScopeFields(household)).toEqual({});
    expect(reportScopeFields(personal)).toEqual({});
  });
});

describe("pantallas solo personales", () => {
  it.each(["cuentas-credito", "tarjeta", "pagos-fijos", "pagos-recurrencia", "creditos", "plan-presupuestos", "plan-objetivos", "cuentas-importar", "informes-patrimonio", "config-reglas", "informes-proyecciones", "cuenta-conciliar", "movimiento-historial"] as const)("%s se sustituye por el aviso en el hogar", (id) => {
    expect(blockedInScope(id, household)).toBe(true);
    expect(blockedInScope(id, personal)).toBe(false);
    expect(blockedInScope(id, both)).toBe(false);
  });
  it.each(["resumen", "cuentas", "cuenta", "movimientos", "movimiento-nuevo", "movimiento", "informes", "informe", "hogares", "hogar", "hogar-invitaciones"] as const)("%s funciona en el hogar", (id) => {
    expect(isPersonalOnlyRoute(id)).toBe(false);
  });
  it("toda ruta de la tabla está clasificada (el resto es solo personal)", () => {
    for (const route of ROUTES) expect(typeof isPersonalOnlyRoute(route.id)).toBe("boolean");
  });
});

describe("ámbitos y roles", () => {
  it("claves y comparación", () => {
    expect(scopeKey(personal)).toBe("personal");
    expect(scopeKey(household)).toBe(`household:${HID}`);
    expect(sameScope(household, { kind: "household", id: HID })).toBe(true);
    expect(sameScope(household, both)).toBe(false);
  });
  it("el visor lee y no escribe; propietario y administrador gestionan", () => {
    expect(canWriteRole("viewer")).toBe(false);
    expect(canWriteRole(null)).toBe(false);
    expect(canWriteRole("editor")).toBe(true);
    expect(canManageRole("editor")).toBe(false);
    expect(canManageRole("admin")).toBe(true);
  });
  it("el administrador solo toca editores y visores", () => {
    expect(assignableRoles("admin", "editor")).toEqual(["editor", "viewer"]);
    expect(assignableRoles("admin", "admin")).toEqual([]);
    expect(assignableRoles("owner", "editor")).toEqual(["admin", "editor", "viewer"]);
    expect(assignableRoles("owner", "owner")).toEqual([]);
    expect(invitableRoles("admin")).toEqual(["editor", "viewer"]);
    expect(invitableRoles("editor")).toEqual([]);
  });
  it("quién puede expulsar a quién", () => {
    expect(canRemove("owner", "viewer", false)).toBe(true);
    expect(canRemove("owner", "owner", false)).toBe(false);
    expect(canRemove("owner", "viewer", true)).toBe(false);
    expect(canRemove("admin", "admin", false)).toBe(false);
    expect(canRemove("admin", "editor", false)).toBe(true);
    expect(canRemove("editor", "viewer", false)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { Asset } from "@/api/models";
import { assetBody, assetProblems, compositionRows, groupAssetsByKind, hasWealth, maintenanceRule, normalizePlate, odometerGoesBack, parseKm, valuationDelta, type AssetForm } from "./logic";

const FORM: AssetForm = { kind: "vehicle", name: "Mazda 3", value: "42.000.000", acquiredOn: "2024-03-01", purchaseValue: "", notes: "", loanId: "", plate: "abc-123", brand: "Mazda", model: "3 Touring", year: "2022", odometer: "25000" };
const RULE = { everyMonths: "{months} meses", everyKm: "{km} km", both: "Cada {months} o {km}, lo que ocurra primero" };
const km = (v: string) => v.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

describe("composición del patrimonio", () => {
  it("orden del diseño, sin grupos en cero y conservando los desconocidos", () => {
    const rows = compositionRows({ vehicles: "42000000.00", liquid: "3420000.00", savings: "0.00", mystery: "5.00" }, ["liquid", "savings", "receivable", "vehicles"]);
    expect(rows.map((r) => r.key)).toEqual(["liquid", "vehicles", "mystery"]);
  });
  it("sin nada en ningún grupo no hay patrimonio que mostrar", () => {
    expect(hasWealth({ assets: { liquid: "0.00" }, liabilities: { cards: "0" } })).toBe(false);
    expect(hasWealth({ assets: { liquid: "0.00" }, liabilities: { cards: "10.00" } })).toBe(true);
  });
});

describe("avalúos y activos", () => {
  it("la diferencia con el avalúo anterior lleva signo y es exacta", () => {
    expect(valuationDelta("45000000.00", "42000000.00")).toBe("3000000.00");
    expect(valuationDelta("41999999.99", "42000000.00")).toBe("-0.01");
  });
  it("agrupa por tipo en orden y omite los vacíos", () => {
    const assets = [{ id: "1", kind: "other" }, { id: "2", kind: "vehicle" }, { id: "3", kind: "vehicle" }] as Asset[];
    expect(groupAssetsByKind(assets).map((g) => [g.kind, g.items.length])).toEqual([["vehicle", 2], ["other", 1]]);
  });
  it("el cuerpo del vehículo lleva placa normalizada, valor decimal y kilometraje entero", () => {
    expect(assetProblems(FORM, "2026-11-11")).toEqual([]);
    expect(assetBody(FORM)).toEqual({ kind: "vehicle", name: "Mazda 3", value: "42000000", acquired_on: "2024-03-01", vehicle: { plate: "ABC123", brand: "Mazda", model: "3 Touring", year: 2022, odometer_km: "25000" } });
    expect(normalizePlate(" ab c-12 ")).toBe("ABC12");
  });
  it("problemas: nombre, valor, fecha futura, placa y año", () => {
    expect(assetProblems({ ...FORM, name: " ", value: "0", acquiredOn: "2027-01-01", plate: "", year: "1800" }, "2026-11-11")).toEqual(["name", "value", "date", "plate", "year"]);
    expect(assetProblems({ ...FORM, kind: "property", plate: "", year: "x" }, "2026-11-11")).toEqual([]);
  });
  it("sin odómetro inicial va en cero", () => {
    expect(assetBody({ ...FORM, odometer: "" }).vehicle?.odometer_km).toBe("0");
  });
});

describe("mantenimiento y odómetro", () => {
  it("«cada 6 meses o 5.000 km, lo que ocurra primero» y las reglas de una sola condición", () => {
    expect(maintenanceRule({ every_months: 6, every_km: 5000 }, RULE, km)).toBe("Cada 6 meses o 5.000 km, lo que ocurra primero");
    expect(maintenanceRule({ every_months: 12, every_km: null }, RULE, km)).toBe("12 meses");
    expect(maintenanceRule({ every_months: null, every_km: 10000 }, RULE, km)).toBe("10.000 km");
  });
  it("kilometraje entero; retroceder se detecta", () => {
    expect(parseKm("185.400")).toBe("185400");
    expect(parseKm("18,5")).toBeNull();
    expect(odometerGoesBack("185400.00", "185000")).toBe(true);
    expect(odometerGoesBack("185400.00", "185400")).toBe(false);
  });
});

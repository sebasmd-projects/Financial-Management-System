import type { Asset, AssetCreate, AssetKind, Maintenance, NetWorth, VehicleCostKind } from "@/api/models";
import { parsePositiveAmount } from "@/lib/amount-input";
import { toInt } from "@/lib/ints";
import { addAmounts, compareAmounts, isZeroAmount, negateAmount } from "@/lib/money";

export const ASSET_KINDS: readonly AssetKind[] = ["vehicle", "property", "investment", "other"];
export const VEHICLE_COST_KINDS: readonly VehicleCostKind[] = ["soat", "technomechanical", "vehicle_tax", "insurance", "other"];

/** Los grupos de la composición del patrimonio, en el orden del diseño (§3.13). */
export const ASSET_GROUPS = ["liquid", "savings", "receivable", "vehicles", "property", "investments", "other_assets"] as const;
export const LIABILITY_GROUPS = ["cards", "loans", "personal_debts"] as const;

export interface CompositionRow {
  key: string;
  amount: string;
}

/** Las filas con valor de un grupo (un grupo en cero no se pinta: no hay nada que decir). Los desconocidos del servidor se conservan al final. */
export function compositionRows(values: Record<string, string>, order: readonly string[]): CompositionRow[] {
  const known = order.filter((key) => key in values).map((key) => ({ key, amount: values[key] }));
  const extra = Object.keys(values)
    .filter((key) => !order.includes(key))
    .sort()
    .map((key) => ({ key, amount: values[key] }));
  return [...known, ...extra].filter((row) => !isZeroAmount(row.amount));
}

export function hasWealth(worth: Pick<NetWorth, "assets" | "liabilities">): boolean {
  return Object.values(worth.assets).some((v) => !isZeroAmount(v)) || Object.values(worth.liabilities).some((v) => !isZeroAmount(v));
}

/** Cuánto cambió un avalúo frente al anterior (con signo). */
export function valuationDelta(value: string, previous: string): string {
  return addAmounts(value, negateAmount(previous));
}

export function groupAssetsByKind(assets: readonly Asset[]): { kind: AssetKind; items: Asset[] }[] {
  return ASSET_KINDS.map((kind) => ({ kind, items: assets.filter((a) => a.kind === kind) })).filter((group) => group.items.length > 0);
}

export interface RuleTexts {
  everyMonths: string;
  everyKm: string;
  both: string;
}

/** «Cada 6 meses o 5.000 km, lo que ocurra primero». */
export function maintenanceRule(item: Pick<Maintenance, "every_months" | "every_km">, t: RuleTexts, formatKm: (km: string) => string): string {
  const months = item.every_months ? t.everyMonths.replace("{months}", String(item.every_months)) : null;
  const km = item.every_km ? t.everyKm.replace("{km}", formatKm(String(item.every_km))) : null;
  if (months && km) return t.both.replace("{months}", months).replace("{km}", km);
  return months ?? km ?? "";
}

export interface AssetForm {
  kind: AssetKind;
  name: string;
  value: string;
  acquiredOn: string;
  purchaseValue: string;
  notes: string;
  loanId: string;
  plate: string;
  brand: string;
  model: string;
  year: string;
  odometer: string;
}

export type AssetProblem = "name" | "value" | "date" | "purchase" | "plate" | "year" | "odometer";

export function assetProblems(form: AssetForm, today: string): AssetProblem[] {
  const out: AssetProblem[] = [];
  if (form.name.trim() === "") out.push("name");
  if (parsePositiveAmount(form.value) === null) out.push("value");
  if (form.acquiredOn === "" || form.acquiredOn > today) out.push("date");
  if (form.purchaseValue.trim() !== "" && parsePositiveAmount(form.purchaseValue) === null) out.push("purchase");
  if (form.kind === "vehicle") {
    if (normalizePlate(form.plate) === "") out.push("plate");
    if (form.year.trim() !== "" && toInt(form.year, 1900, 2100) === null) out.push("year");
    if (form.odometer.trim() !== "" && toInt(form.odometer) === null) out.push("odometer");
  }
  return out;
}

export function normalizePlate(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase().slice(0, 12);
}

/** El cuerpo de `POST assets` (el servidor valida de nuevo: aquí solo se evita enviar lo evidentemente malo). */
export function assetBody(form: AssetForm): AssetCreate {
  const purchase = parsePositiveAmount(form.purchaseValue);
  const year = toInt(form.year, 1900, 2100);
  return {
    kind: form.kind,
    name: form.name.trim(),
    value: parsePositiveAmount(form.value)!,
    acquired_on: form.acquiredOn,
    ...(purchase ? { purchase_value: purchase } : {}),
    ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    ...(form.loanId ? { loan_id: form.loanId } : {}),
    ...(form.kind === "vehicle"
      ? {
          vehicle: {
            plate: normalizePlate(form.plate),
            ...(form.brand.trim() ? { brand: form.brand.trim() } : {}),
            ...(form.model.trim() ? { model: form.model.trim() } : {}),
            ...(year !== null ? { year } : {}),
            odometer_km: form.odometer.trim() === "" ? "0" : String(toInt(form.odometer)!),
          },
        }
      : {}),
  };
}

/** Un kilometraje escrito por la persona (entero, sin separadores de miles) → la cadena de la API. */
export function parseKm(raw: string): string | null {
  const text = raw.replace(/[.\s]/g, "");
  const value = toInt(text);
  return value === null ? null : String(value);
}

/** ¿El nuevo kilometraje retrocede respecto del actual? (el servidor lo rechaza igual: `odometer_cannot_go_back`). */
export function odometerGoesBack(current: string, next: string): boolean {
  return compareAmounts(next, current) < 0;
}

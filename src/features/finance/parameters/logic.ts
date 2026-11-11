/** Parámetros de Colombia (sin React): cómo se muestra y se captura un valor según su unidad. Solo cadenas, nunca `Number`. */
import type { ParameterCatalog } from "@/api/models";
import { fractionToPercent, normalizeAmountInput, percentToFraction } from "@/lib/amount-input";
import { isBusinessDate } from "@/lib/dates";
import { formatDecimal, parseIndexValue } from "@/lib/decimal";
import { toInt } from "@/lib/ints";
import { formatCop } from "@/lib/money";

export type Unit = ParameterCatalog["unit"];

/** La UVR: un valor en pesos con hasta 6 decimales (no un monto de 2). */
export const UVR_PARAMETER = "UVR_VALUE";

/** La cantidad sin ceros de más: `"4.00"` → `"4"`. */
function plainCount(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/** Un valor vigente tal como se lee: fracción → porcentaje, monto → pesos, cantidad → entero. */
export function displayValue(unit: Unit, value: string, locale: "es" | "en", key?: string): string {
  // La UVR vale ~$390 con 4 a 6 decimales: redondearla a pesos (o a centavos) cambiaría el saldo de un crédito en UVR.
  if (key === UVR_PARAMETER) return `$${formatDecimal(value, 0, 6)}`;
  if (unit === "fraction") {
    const percent = fractionToPercent(value);
    return `${locale === "es" ? percent.replace(".", ",") : percent} %`;
  }
  if (unit === "amount") return formatCop(value);
  return plainCount(value);
}

/** Lo que escribió la persona → la cadena que espera la API (la fracción de un porcentaje, el monto, el entero); `null` si no vale. */
export function parseValue(unit: Unit, text: string, key?: string): string | null {
  if (key === UVR_PARAMETER) return parseIndexValue(text);
  if (unit === "fraction") return percentToFraction(text);
  if (unit === "amount") {
    const amount = normalizeAmountInput(text);
    return amount !== null && !/^0*(\.0*)?$/.test(amount) ? amount : null;
  }
  const count = toInt(text, 0, 1_000_000);
  return count === null ? null : String(count);
}

export interface NewValueInput {
  unit: Unit;
  /** La clave del parámetro: la UVR se captura con más decimales que un monto. */
  key?: string;
  value: string;
  validFrom: string;
  validTo: string;
  source: string;
}

export type NewValueProblems = Partial<Record<"value" | "validFrom" | "range" | "source", true>>;

export function newValueBody(input: NewValueInput): { body: { value: string; valid_from: string; valid_to?: string; source: string } | null; problems: NewValueProblems } {
  const problems: NewValueProblems = {};
  const value = parseValue(input.unit, input.value, input.key);
  if (value === null) problems.value = true;
  if (!isBusinessDate(input.validFrom)) problems.validFrom = true;
  if (input.validTo !== "" && !isBusinessDate(input.validTo)) problems.range = true;
  if (input.validTo !== "" && isBusinessDate(input.validFrom) && input.validTo < input.validFrom) problems.range = true;
  const source = input.source.trim();
  if (source === "" || source.length > 500) problems.source = true;
  if (Object.keys(problems).length > 0 || value === null) return { body: null, problems };
  return { body: { value, valid_from: input.validFrom, ...(input.validTo ? { valid_to: input.validTo } : {}), source }, problems };
}

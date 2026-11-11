/** Lógica pura de los créditos en UVR y de tasa variable (FMS-3a, corte 3.3). Solo cadenas decimales: nunca `Number`. */
import type { Loan, LoanIndex } from "@/api/models";
import { percentToFraction } from "@/lib/amount-input";
import { convertToPesos, parseUnitsInput } from "@/lib/decimal";

export const INDEX_KEYS: readonly LoanIndex[] = ["DTF_EA", "IBR_EA", "IPC_ANNUAL"];

/** ¿El crédito está en unidades UVR? Entonces principal, seguro, otros cargos y la tabla de cuotas NO son pesos. */
export function isUvr(loan: Pick<Loan, "unit">): boolean {
  return loan.unit === "UVR";
}

/** ¿Tasa variable (índice + margen)? */
export function indexOf(loan: Pick<Loan, "index_key">): LoanIndex | null {
  return loan.index_key ? (loan.index_key as LoanIndex) : null;
}

/**
 * Los pesos que valen unas unidades a una UVR: producto exacto redondeado al centavo UNA vez. Es una ESTIMACIÓN para mostrar
 * (lo que vale es lo que asienta el servidor con la UVR de la fecha del pago); sin UVR no hay cifra: `null`, nunca cero.
 */
export function pesoEstimate(units: string, uvrValue: string | null | undefined): string | null {
  if (!uvrValue) return null;
  return convertToPesos(units, uvrValue);
}

/** Las unidades de un crédito en UVR (hasta 4 decimales), o `null` si el texto no vale. En pesos se usa `normalizeAmountInput`. */
export function parseUnits(text: string): string | null {
  return parseUnitsInput(text);
}

/** Lo que la tasa variable agrega al cuerpo del alta: el índice y el margen (fracción). La tasa se ignora en el servidor; se envía 0 en EA. */
export function variableRateBody(variable: boolean, index: LoanIndex, margin: string): { problem: "margin" | null; body: { index_key?: LoanIndex; margin?: string } } {
  if (!variable) return { problem: null, body: {} };
  const fraction = percentToFraction(margin);
  if (fraction === null) return { problem: "margin", body: {} };
  return { problem: null, body: { index_key: index, margin: fraction } };
}

/**
 * Lógica pura del simulador de pagos de la app (una versión simple del de la web): de lo que la persona escribe a la petición de la API.
 * Solo cadenas decimales: nunca `Number`/`parseFloat` con dinero. Nada de montos en la URL: van en el cuerpo.
 */
import type { components } from "@core/api/schema.gen";
import { parsePositiveAmount } from "@core/amount-input";

type S = components["schemas"];

/** El plazo con que se compara «diferir» en la app (la web deja elegir varios). */
export const DEFER_TERMS = [6, 12, 24] as const;

/** `POST cards/{id}/simulators/payment-strategy`: pagar X (opcional) frente al total, el mínimo y diferir. `null` si X está escrito pero no es válido. */
export function cardBody(payText: string): S["PayStrategyRequest"] | null {
  const pay = payText.trim() === "" ? undefined : (parsePositiveAmount(payText) ?? false);
  if (pay === false) return null;
  return { ...(pay !== undefined ? { pay_amount: pay, pay_now: pay } : {}), continue_with: "same", defer_terms: [...DEFER_TERMS], defer_scope: "statement", horizon_months: 120 };
}

/** `POST loans/{id}/simulators/payment-strategy`: un abono extra opcional. */
export function loanBody(extraText: string): S["LoanPayRequest"] | null {
  const extra = extraText.trim() === "" ? undefined : (parsePositiveAmount(extraText) ?? false);
  if (extra === false) return null;
  return extra === undefined ? {} : { extra };
}

export type StrategyKey = S["StrategyOutcome"]["key"];

/** La clave del texto de una estrategia: «diferir» se distingue por su plazo. */
export function strategyTitleKey(o: S["StrategyOutcome"]): { key: "total" | "minimum" | "amount" | "defer"; terms: number | null } {
  return { key: o.key, terms: o.params.defer_terms ?? null };
}

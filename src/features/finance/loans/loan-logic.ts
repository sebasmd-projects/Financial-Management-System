/** Lógica pura del alta de un préstamo (sin React): la tabla personalizada. Solo cadenas decimales, nunca `Number`. */
import { normalizeAmountInput } from "@/lib/amount-input";
import { addAmounts, compareAmounts } from "@/lib/money";

export type CustomProblem = "empty" | "invalid" | "count" | "sum";

/**
 * «Personalizado»: la persona define el capital de cada cuota, uno por línea. Tiene que haber exactamente `term` valores y
 * sumar el capital inicial (el servidor lo vuelve a comprobar; aquí se avisa antes de enviar).
 */
export function parseCustomCapitals(text: string, term: number | null, principal: string | null): { capitals: string[] | null; problem: CustomProblem | null } {
  const lines = text
    .split(/[\n;]/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length === 0) return { capitals: null, problem: "empty" };
  const capitals: string[] = [];
  for (const line of lines) {
    const value = normalizeAmountInput(line);
    if (value === null) return { capitals: null, problem: "invalid" };
    capitals.push(value);
  }
  if (term !== null && capitals.length !== term) return { capitals: null, problem: "count" };
  if (principal !== null && compareAmounts(addAmounts(...capitals), principal) !== 0) return { capitals: null, problem: "sum" };
  return { capitals, problem: null };
}

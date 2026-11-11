/** Anchos de barra para las gráficas, calculados con BigInt sobre cadenas decimales (nunca `Number`): solo para dibujar. */
import { absAmount, compareAmounts, percentOfTotal } from "@/lib/money";

/** El ancho (0 a 100) de cada monto respecto del mayor valor absoluto del conjunto. Un conjunto en cero da todo 0. */
export function scaleWidths(amounts: readonly (string | null)[]): number[] {
  const values = amounts.map((a) => (a === null ? "0" : absAmount(a)));
  let max = "0";
  for (const value of values) if (compareAmounts(value, max) > 0) max = value;
  return values.map((value) => percentOfTotal(value, max));
}

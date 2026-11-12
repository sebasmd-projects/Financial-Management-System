/**
 * Porcentajes que la API entrega como TEXTO decimal (`"88.00"`, `"1.8088"`). Se leen y se redondean sobre el texto con
 * `BigInt`: nunca `Number`/`parseFloat` (son cifras financieras, regla 1 del propietario).
 */
const DECIMAL = /^([+-]?)(\d+)(?:\.(\d+))?$/;

export function isDecimalText(value: unknown): value is string {
  return typeof value === "string" && DECIMAL.test(value);
}

/** `"88.00"` → `"88"`, `"1.80875825"` → `"1,81"` (es) o `"1.81"` (en). `max` decimales como mucho, sin ceros de relleno. */
export function formatPercent(value: string, locale: "es" | "en" = "es", max = 2): string {
  const match = DECIMAL.exec(value);
  if (!match) return value;
  const [, sign, whole, fraction = ""] = match;
  const scale = 10n ** BigInt(max);
  const digits = BigInt(whole + fraction.padEnd(max, "0").slice(0, max));
  // Redondeo mitad hacia arriba al último decimal que se muestra.
  const rest = fraction.length > max ? BigInt(fraction.slice(max, max + 1)) : 0n;
  const scaled = digits + (rest >= 5n ? 1n : 0n);
  const integer = scaled / scale;
  const decimals = (scaled % scale).toString().padStart(max, "0").replace(/0+$/, "");
  const negative = sign === "-" && scaled !== 0n;
  const point = locale === "es" ? "," : ".";
  const body = decimals ? `${integer}${point}${decimals}` : `${integer}`;
  return `${negative ? "−" : ""}${body} %`;
}

/** La parte entera de un porcentaje de texto, acotada a 0..100, para el ancho de una barra (`"88.60"` → 88). */
export function percentWidth(value: string): number {
  const match = DECIMAL.exec(value);
  if (!match || match[1] === "-") return 0;
  const whole = match[2].length > 3 ? 100 : +match[2];
  return Math.min(100, whole);
}

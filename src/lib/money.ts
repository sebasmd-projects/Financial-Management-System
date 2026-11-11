/**
 * Dinero. Los montos llegan de la API como CADENAS decimales (`"-180000.00"`) y así se quedan: aquí se leen con
 * `BigInt` sobre el texto y se escriben con aritmética entera. Nunca `Number` ni `parseFloat` (regla 1 del
 * propietario; ESLint lo prohíbe en este fichero y `src/guards.test.ts` en el resto del dinero).
 *
 * Una sola función de formato para toda la app (diseño §4.4); no se usa la salida de `Intl`, que varía entre motores.
 *
 *   COP            `$1.200.000`     sin decimales, punto de miles
 *   con centavos   `$21.704,98`     solo si los centavos no son cero
 *   negativo       `−$180.000`      U+2212 antes del símbolo
 *   con signo      `+$5.200.000`    ingresos en listas
 *   abreviado      `$1,2 M` `$450 mil` `$8.500`
 *   estimado       `~$130.000`
 */

const MINUS = "−";
/** Máximo de cifras enteras al capturar (diseño §4.4). */
export const MAX_INTEGER_DIGITS = 13;
const DECIMAL = /^([+-]?)(\d+)(?:\.(\d+))?$/;

export const HIDDEN_AMOUNT = "•••••";

interface Parsed {
  negative: boolean;
  /** Valor absoluto en centavos, ya redondeado mitad-al-par al centavo. */
  cents: bigint;
}

/** ¿Es una cadena decimal válida (`"12"`, `"-12.5"`, `"0.05"`)? Sin separadores de miles, sin notación científica. */
export function isDecimalString(value: unknown): value is string {
  return typeof value === "string" && DECIMAL.test(value);
}

/** Cociente entero de `n / d` (n ≥ 0, d > 0) redondeado mitad-al-par. */
function divRoundHalfEven(n: bigint, d: bigint): bigint {
  const quotient = n / d;
  const twice = (n % d) * 2n;
  if (twice > d || (twice === d && quotient % 2n === 1n)) return quotient + 1n;
  return quotient;
}

function parse(value: string): Parsed {
  const match = DECIMAL.exec(value);
  if (!match) throw new RangeError("Monto inválido: se espera una cadena decimal");
  const [, sign, whole, fraction = ""] = match;
  const cents = BigInt(whole) * 100n + (fraction.length <= 2 ? BigInt(fraction.padEnd(2, "0")) : 0n);
  let total = cents;
  if (fraction.length > 2) {
    // Más de 2 decimales (no debería llegar de la API: `Decimal(18,2)`): al centavo, mitad-al-par, sobre el texto.
    const scale = 10n ** BigInt(fraction.length - 2);
    total = BigInt(whole) * 100n + divRoundHalfEven(BigInt(fraction), scale);
  }
  return { negative: sign === "-" && total !== 0n, cents: total };
}

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export interface FormatOptions {
  /** `"always"` pone `+` a los positivos (ingresos en listas). Por defecto solo se marca el negativo. */
  sign?: "auto" | "always";
  /** Prefijo `~` de un monto estimado. */
  estimated?: boolean;
}

function decorate(body: string, negative: boolean, isZero: boolean, options: FormatOptions): string {
  const sign = isZero ? "" : negative ? MINUS : options.sign === "always" ? "+" : "";
  return `${options.estimated ? "~" : ""}${sign}$${body}`;
}

/** `"1200000.00"` → `$1.200.000`; `"-180000"` → `−$180.000`; `"21704.98"` → `$21.704,98`; cero → `$0`. */
export function formatCop(value: string, options: FormatOptions = {}): string {
  const { negative, cents } = parse(value);
  const pesos = cents / 100n;
  const rest = cents % 100n;
  const body = rest === 0n ? group(pesos.toString()) : `${group(pesos.toString())},${rest.toString().padStart(2, "0")}`;
  return decorate(body, negative, cents === 0n, options);
}

/**
 * Abreviado, solo para fichas, riel y KPI estrechos: ≥ 1.000.000 → un decimal y «M» (`$1,2 M`, y `$1.250,4 M` con miles);
 * ≥ 10.000 → miles enteros y «mil» (`$450 mil`); menos → completo (`$8.500`). Los centavos se descartan: es un
 * resumen, el detalle y el lector de pantalla dan el valor exacto (`spokenCop`).
 */
export function formatCopCompact(value: string, options: FormatOptions = {}): string {
  const { negative, cents } = parse(value);
  const pesos = divRoundHalfEven(cents, 100n);
  const isZero = pesos === 0n;
  if (pesos < 10_000n) return decorate(group(pesos.toString()), negative, isZero, options);

  const thousands = divRoundHalfEven(cents, 100_000n);
  // 999.999,50 se redondea a «1000 mil»: eso ya es un millón.
  if (thousands < 1000n) return decorate(`${thousands.toString()} mil`, negative, false, options);

  const tenthsOfMillion = divRoundHalfEven(cents, 10_000_000n);
  const millions = tenthsOfMillion / 10n;
  return decorate(`${group(millions.toString())},${(tenthsOfMillion % 10n).toString()} M`, negative, false, options);
}

/** Lo que dice un lector de pantalla (diseño §6): el valor completo, sin separadores y nunca la abreviatura. */
export function spokenCop(value: string, kind?: "egreso" | "ingreso" | "transferencia", locale: "es" | "en" = "es"): string {
  const { negative, cents } = parse(value);
  const pesos = cents / 100n;
  const rest = cents % 100n;
  if (locale === "en") {
    const amount = rest === 0n ? pesos.toString() : `${pesos.toString()}.${rest.toString().padStart(2, "0")}`;
    const unit = `${amount} Colombian ${cents === 100n ? "peso" : "pesos"}`;
    const label = kind === "egreso" ? "expense" : kind === "ingreso" ? "income" : kind === "transferencia" ? "transfer" : null;
    if (label) return `${label} of ${unit}`;
    return negative ? `minus ${unit}` : unit;
  }
  const amount = rest === 0n ? pesos.toString() : `${pesos.toString()},${rest.toString().padStart(2, "0")}`;
  const unit = `${amount} ${cents === 100n ? "peso" : "pesos"}`;
  if (kind) return `${kind} de ${unit}`;
  return negative ? `menos ${unit}` : unit;
}

/** Quita el signo: el valor absoluto de un monto, como cadena con la escala original. */
export function absAmount(value: string): string {
  return value.startsWith("-") || value.startsWith("+") ? value.slice(1) : value;
}

/** El mismo monto con el signo cambiado (`"12.50"` → `"-12.50"`, `"-3"` → `"3"`, cero sigue siendo cero). */
export function negateAmount(value: string): string {
  const { negative, cents } = parse(value);
  if (cents === 0n) return "0.00";
  const body = `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
  return negative ? body : `-${body}`;
}

export function isZeroAmount(value: string): boolean {
  return parse(value).cents === 0n;
}

/** Valida lo que escribe el usuario: dígitos, hasta 13 enteros y hasta 2 decimales. */
export function isValidAmountInput(value: string): boolean {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  return match !== null && match[1].replace(/^0+(?=\d)/, "").length <= MAX_INTEGER_DIGITS;
}

/** Suma exacta de montos decimales (en centavos), devuelta como cadena con 2 decimales: `"0.10" + "0.20"` = `"0.30"`. */
export function addAmounts(...values: string[]): string {
  let total = 0n;
  for (const value of values) {
    const { negative, cents } = parse(value);
    total += negative ? -cents : cents;
  }
  const negative = total < 0n;
  const abs = negative ? -total : total;
  return `${negative ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/** Compara dos montos: negativo si a < b, 0 si iguales, positivo si a > b. */
export function compareAmounts(a: string, b: string): number {
  const signed = (value: string) => {
    const { negative, cents } = parse(value);
    return negative ? -cents : cents;
  };
  const left = signed(a);
  const right = signed(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isNegativeAmount(value: string): boolean {
  return parse(value).negative;
}

/**
 * Decimales que NO son pesos del libro: tasas de cambio («pesos por unidad», hasta 12 decimales), montos en otra moneda y
 * kilómetros. Igual que `money.ts`: cadenas y `BigInt`, nunca `Number` ni `parseFloat`. Lo que se calcula aquí es una VISTA
 * PREVIA; el que decide los pesos del libro es el servidor (`ROUND_HALF_UP` a centavos, una sola vez).
 */

const PLAIN = /^(\d+)(?:\.(\d+))?$/;
export const MAX_RATE_DECIMALS = 12;
const MAX_INTEGER_DIGITS = 13;

/** Separa un decimal sin signo en dígitos enteros y escala: `"3912.40"` → `{ digits: 391240n, scale: 2 }`. */
function toScaled(value: string): { digits: bigint; scale: number } | null {
  const match = PLAIN.exec(value);
  if (!match) return null;
  const fraction = match[2] ?? "";
  return { digits: BigInt(`${match[1]}${fraction}`), scale: fraction.length };
}

function trimZeros(fraction: string): string {
  return fraction.replace(/0+$/, "");
}

/**
 * Lo que la persona escribe en el campo de la tasa → la cadena decimal de la API (`"3.912,4"` → `"3912.4"`). Positiva, hasta 12
 * decimales y 13 enteros. Un solo separador con exactamente 3 cifras detrás (`3.912`) se lee como miles, igual que los montos
 * (ninguna moneda vale menos de un peso con tres decimales justos); la pantalla repite siempre el valor leído para confirmarlo.
 */
export function parseRateInput(raw: string): string | null {
  const text = raw.replace(/[\s$ ]/g, "");
  if (!/^[\d.,]+$/.test(text)) return null;
  const last = Math.max(text.lastIndexOf("."), text.lastIndexOf(","));
  let whole = text;
  let fraction = "";
  if (last !== -1) {
    const after = text.slice(last + 1);
    const before = text.slice(0, last);
    const separator = text[last];
    const onlyOne = !/[.,]/.test(before);
    const thousands = after.length === 3 && onlyOne && before !== "" && before !== "0";
    const repeated = before.includes(separator);
    if (!thousands && !repeated && after.length >= 1) {
      whole = before;
      fraction = after;
    } else if (repeated && !thousands) {
      return null;
    }
  }
  if (!fraction && /[.,]/.test(whole) && !/^\d{1,3}([.,]\d{3})+$/.test(whole)) return null;
  if (fraction && /[.,]/.test(whole) && !/^\d{1,3}([.,]\d{3})+$/.test(whole)) return null;
  whole = whole.replace(/[.,]/g, "").replace(/^0+(?=\d)/, "");
  if (whole === "") whole = "0";
  if (whole.length > MAX_INTEGER_DIGITS || fraction.length > MAX_RATE_DECIMALS) return null;
  const trimmed = trimZeros(fraction);
  const value = trimmed ? `${whole}.${trimmed}` : whole;
  return /^0(\.0*)?$/.test(value) ? null : value;
}

/** Un monto en otra moneda que escribe la persona (`"2,99"`, `"1.250,50"`), con los decimales de la moneda como tope. */
export function parseForeignAmount(raw: string, decimals: number): string | null {
  const text = raw.replace(/[\s$ ]/g, "");
  if (!/^[\d.,]+$/.test(text)) return null;
  const last = Math.max(text.lastIndexOf("."), text.lastIndexOf(","));
  let whole = text;
  let fraction = "";
  if (last !== -1) {
    const after = text.slice(last + 1);
    const before = text.slice(0, last);
    const thousands = after.length === 3 && !/[.,]/.test(before) && before !== "" && before !== "0" && decimals < 3;
    if (!thousands && after.length >= 1 && after.length <= decimals && !before.includes(text[last])) {
      whole = before;
      fraction = after;
    } else if (!thousands) {
      return null;
    }
  }
  if (/[.,]/.test(whole) && !/^\d{1,3}([.,]\d{3})+$/.test(whole)) return null;
  whole = whole.replace(/[.,]/g, "").replace(/^0+(?=\d)/, "") || "0";
  if (whole.length > MAX_INTEGER_DIGITS) return null;
  const value = fraction ? `${whole}.${fraction}` : whole;
  return /^0(\.0*)?$/.test(value) ? null : value;
}

/**
 * Pesos que vale `original` a `rate` pesos por unidad: producto exacto, redondeado a centavos mitad hacia arriba UNA vez (como el
 * servidor). Vista previa: el servidor es quien guarda el valor.
 */
export function convertToPesos(original: string, rate: string): string | null {
  const a = toScaled(original);
  const b = toScaled(rate);
  if (!a || !b) return null;
  const product = a.digits * b.digits;
  const scale = a.scale + b.scale;
  const cents = scale <= 2 ? product * 10n ** BigInt(2 - scale) : (product + 5n * 10n ** BigInt(scale - 3)) / 10n ** BigInt(scale - 2);
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Un decimal positivo con punto de miles y coma decimal (el formato COP de la app): al menos `min` y a lo sumo `max` decimales. */
export function formatDecimal(value: string, min = 0, max = MAX_RATE_DECIMALS): string {
  const negative = value.startsWith("-");
  const match = PLAIN.exec(negative ? value.slice(1) : value);
  if (!match) return value;
  let fraction = trimZeros((match[2] ?? "").slice(0, max));
  fraction = fraction.padEnd(min, "0");
  const body = `${group(match[1].replace(/^0+(?=\d)/, ""))}${fraction ? `,${fraction}` : ""}`;
  return negative ? `−${body}` : body;
}

/** Un monto en otra moneda para mostrar: `USD 2,99`. */
export function formatForeign(amount: string, currency: string, decimals = 2): string {
  return `${currency} ${formatDecimal(amount, decimals, Math.max(decimals, 2))}`;
}

/** La tasa para mostrar: `$3.912,4`. */
export function formatRate(rate: string): string {
  return `$${formatDecimal(rate, 0, 6)}`;
}

/** Kilómetros (`"185400.00"` → `"185.400"`): el kilometraje se muestra entero. */
export function formatKm(value: string): string {
  return formatDecimal(value.replace(/\.0+$/, ""), 0, 1);
}

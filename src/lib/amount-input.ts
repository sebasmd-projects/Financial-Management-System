/**
 * Lo que la persona escribe en un campo de monto → la cadena decimal que se envía a la API (`"1.200.000,50"` → `"1200000.50"`).
 * Sin `Number`: solo texto. El último separador (`.` o `,`) es decimal si le siguen 1 o 2 cifras; si son 3, es de miles
 * (`1.500` = mil quinientos, como se escribe en Colombia); los demás separadores son de miles.
 */
import { isValidAmountInput } from "./money";

/**
 * ¿Qué tiene mal el texto de un monto? `too_many_decimals` (más de 2 decimales: nunca se redondea, igual que el servidor),
 * `invalid` (no es un monto) o `null` si es válido o está vacío.
 */
export function amountInputProblem(raw: string): "too_many_decimals" | "invalid" | null {
  const text = raw.replace(/[\s$\u00a0]/g, "");
  if (text === "" || normalizeAmountInput(raw) !== null) return null;
  if (!/^[\d.,]+$/.test(text)) return "invalid";
  const last = Math.max(text.lastIndexOf("."), text.lastIndexOf(","));
  const before = text.slice(0, last);
  const after = text.slice(last + 1);
  const single = !/[.,]/.test(before);
  // «1,2345» o «0,125»: una sola coma/punto y demasiados decimales. «12.345.678» sí son miles.
  if (last !== -1 && single && after.length >= 4) return "too_many_decimals";
  if (last !== -1 && single && after.length === 3 && (before === "" || before === "0")) return "too_many_decimals";
  return "invalid";
}

export function normalizeAmountInput(raw: string): string | null {
  const text = raw.replace(/[\s$ ]/g, "");
  if (text === "" || !/^[\d.,]+$/.test(text)) return null;
  const lastSeparator = Math.max(text.lastIndexOf("."), text.lastIndexOf(","));
  let whole = text;
  let fraction = "";
  if (lastSeparator !== -1) {
    const after = text.slice(lastSeparator + 1);
    const before = text.slice(0, lastSeparator);
    const decimalSeparator = after.length >= 1 && after.length <= 2 && !/[.,]/.test(after);
    // «1.5.0»: el mismo separador antes de una cola corta es ambiguo, no se adivina.
    if (decimalSeparator && before.includes(text[lastSeparator])) return null;
    if (decimalSeparator) {
      whole = before;
      fraction = after;
    }
  }
  // Sin parte decimal: los separadores son de miles y tienen que agrupar de a 3 (`1.200.000`), no «0,125» ni «1,2345».
  if (!fraction && /[.,]/.test(whole) && !/^\d{1,3}([.,]\d{3})+$/.test(whole)) return null;
  if (!fraction && /^0[.,]/.test(whole)) return null;
  whole = whole.replace(/[.,]/g, "");
  if (whole === "") whole = "0";
  const candidate = fraction ? `${whole}.${fraction}` : whole;
  return isValidAmountInput(candidate) ? candidate : null;
}

/** ¿El texto es un monto positivo válido? (0 no lo es: «Guardar» queda inactivo). */
export function parsePositiveAmount(raw: string): string | null {
  const value = normalizeAmountInput(raw);
  if (value === null || /^0*(\.0*)?$/.test(value)) return null;
  return value;
}

/** Tasas: la API las guarda como FRACCIÓN decimal (`0.24` = 24 %); la persona las escribe en porcentaje (`24`, `1,5`). */
export function percentToFraction(raw: string): string | null {
  const text = raw.replace(/[\s%]/g, "").replace(",", ".");
  const match = /^(\d{1,3})(?:\.(\d{1,6}))?$/.exec(text);
  if (!match) return null;
  const padded = match[1].padStart(3, "0");
  const whole = padded.slice(0, -2).replace(/^0+(?=\d)/, "");
  const fraction = `${padded.slice(-2)}${match[2] ?? ""}`.replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

/** `"0.24"` → `"24"`, `"0.018088"` → `"1.8088"`: la fracción de la API como porcentaje, hasta `maxDecimals` decimales. */
export function fractionToPercent(fraction: string, maxDecimals = 4): string {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(fraction);
  if (!match) return fraction;
  const [, sign, whole, frac = ""] = match;
  const padded = frac.padEnd(2, "0");
  const digits = BigInt(`${whole}${padded.slice(0, 2)}${padded.slice(2)}`);
  const scale = 10n ** BigInt(padded.length - 2);
  // `digits / scale` es el porcentaje; se redondea (mitad hacia arriba) a `maxDecimals` decimales.
  const unit = 10n ** BigInt(maxDecimals);
  let scaled = (digits * unit * 2n + scale) / (scale * 2n);
  if (scale === 1n) scaled = digits * unit;
  const intPart = scaled / unit;
  const decimals = (scaled % unit).toString().padStart(maxDecimals, "0").replace(/0+$/, "");
  const body = decimals ? `${intPart}.${decimals}` : `${intPart}`;
  return sign === "-" && scaled !== 0n ? `-${body}` : body;
}

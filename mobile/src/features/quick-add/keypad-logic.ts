/**
 * El teclado numérico propio. El monto se construye como CADENA decimal con el formato de la API (`"1800"`, `"1800.5"`): solo texto,
 * nunca `Number`. La coma del teclado es el separador decimal; los puntos de miles son solo de pantalla (`displayAmount`).
 */
import { MAX_INTEGER_DIGITS } from "@core/money";

export type Key = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "000" | "," | "back";

const MAX_DECIMALS = 2;

function split(raw: string): { whole: string; fraction: string | null } {
  const dot = raw.indexOf(".");
  return dot === -1 ? { whole: raw, fraction: null } : { whole: raw.slice(0, dot), fraction: raw.slice(dot + 1) };
}

/** El monto después de tocar una tecla. Lo que no cabe (más de 13 cifras, más de 2 decimales) se ignora. */
export function pressKey(raw: string, key: Key): string {
  const { whole, fraction } = split(raw);
  if (key === "back") {
    if (raw === "") return "";
    const next = raw.slice(0, -1);
    return next === "0" ? "" : next;
  }
  if (key === ",") {
    if (fraction !== null) return raw;
    return `${whole === "" ? "0" : whole}.`;
  }
  if (fraction !== null) {
    // «000» no tiene sentido tras la coma.
    if (key === "000" || fraction.length >= MAX_DECIMALS) return raw;
    return `${raw}${key}`;
  }
  if (key === "000") return whole === "" || whole === "0" || whole.length + 3 > MAX_INTEGER_DIGITS ? raw : `${whole}000`;
  if (whole === "0") return key === "0" ? raw : key;
  if (whole.length >= MAX_INTEGER_DIGITS) return raw;
  return `${whole}${key}`;
}

/** Lo que se envía a la API: sin la coma colgante (`"1800."` → `"1800"`); `null` si no hay un monto mayor que cero. */
export function toAmount(raw: string): string | null {
  const value = raw.endsWith(".") ? raw.slice(0, -1) : raw;
  if (value === "" || /^0*(\.0*)?$/.test(value)) return null;
  return value;
}

/** La cadena de la API (`"180000.00"`) como texto del teclado (`"180000"`): sin ceros de más; se descarta el signo. */
export function fromApiAmount(value: string): string {
  const unsigned = value.startsWith("-") || value.startsWith("+") ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const cents = fraction.slice(0, MAX_DECIMALS).replace(/0+$/, "");
  const clean = whole.replace(/^0+(?=\d)/, "");
  if (!/^\d+$/.test(clean)) return "";
  const text = cents ? `${clean}.${cents}` : clean;
  return text === "0" ? "" : text;
}

/** Cómo se ve mientras se escribe: `$1.800,5` (con la coma colgante si falta el decimal). */
export function displayAmount(raw: string): string {
  if (raw === "") return "$0";
  const { whole, fraction } = split(raw);
  const grouped = (whole === "" ? "0" : whole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$${grouped}${fraction === null ? "" : `,${fraction}`}`;
}

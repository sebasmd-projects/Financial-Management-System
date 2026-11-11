/**
 * Fechas. Dos clases de valor, y no se mezclan (regla 6 del propietario):
 *  - FECHA DE NEGOCIO (`"2026-11-10"`, un `DateField`): no tiene zona; se formatea tal cual, sin pasar por `Date` local.
 *  - INSTANTE (`"2026-11-10T19:32:00Z"`): se lleva a `America/Bogota` (UTC−5, sin horario de verano).
 * Formato DD/MM/YYYY, hora de 24 h. «Hoy» es el de Bogotá aunque el navegador esté en otra zona.
 */

export const TIME_ZONE = "America/Bogota";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const BUSINESS_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;

export interface YMD {
  year: number;
  month: number;
  day: number;
}

const bogota = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function bogotaParts(instant: Date): YMD & { hour: number; minute: number } {
  const parts = Object.fromEntries(bogota.formatToParts(instant).map((part) => [part.type, part.value]));
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, minute: +parts.minute };
}

/** Lee una fecha de negocio; lanza si no existe (`2026-02-30`). */
export function parseBusinessDate(value: string): YMD {
  const match = BUSINESS_DATE.exec(value);
  if (!match) throw new RangeError("Fecha inválida: se espera AAAA-MM-DD");
  const [year, month, day] = [+match[1], +match[2], +match[3]];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new RangeError("Fecha inválida: el día no existe");
  }
  return { year, month, day };
}

export function isBusinessDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    parseBusinessDate(value);
    return true;
  } catch {
    return false;
  }
}

/** La fecha de un valor de la API: fecha de negocio tal cual, o instante llevado a Bogotá. */
function toYMD(value: string | Date): YMD {
  if (typeof value === "string" && BUSINESS_DATE.test(value)) return parseBusinessDate(value);
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) throw new RangeError("Instante inválido");
  return bogotaParts(instant);
}

const two = (n: number) => String(n).padStart(2, "0");

/** `DD/MM/YYYY`. */
export function formatDate(value: string | Date): string {
  const { year, month, day } = toYMD(value);
  return `${two(day)}/${two(month)}/${year}`;
}

/** `DD/MM`, solo dentro del periodo visible (diseño §4.4). */
export function formatDateShort(value: string | Date): string {
  const { month, day } = toYMD(value);
  return `${two(day)}/${two(month)}`;
}

/** `10 nov`, para gráficas. */
export function formatDayMonth(value: string | Date): string {
  const { month, day } = toYMD(value);
  return `${day} ${MONTHS[month - 1].slice(0, 3)}`;
}

/** `10 de noviembre de 2026`, para el lector de pantalla. */
export function formatDateLong(value: string | Date): string {
  const { year, month, day } = toYMD(value);
  return `${day} de ${MONTHS[month - 1]} de ${year}`;
}

/** `HH:mm` de 24 h, en Bogotá. Solo para instantes. */
export function formatTime(instant: string | Date): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new RangeError("Instante inválido");
  const { hour, minute } = bogotaParts(date);
  return `${two(hour)}:${two(minute)}`;
}

/** `"2026-11"` → `Noviembre 2026`. */
export function formatPeriod(period: string): string {
  const match = PERIOD.exec(period);
  if (!match) throw new RangeError("Periodo inválido: se espera AAAA-MM");
  const name = MONTHS[+match[2] - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${match[1]}`;
}

/** El día de hoy en Bogotá como fecha de negocio (`AAAA-MM-DD`). */
export function todayBogota(now: Date = new Date()): string {
  const { year, month, day } = bogotaParts(now);
  return `${year}-${two(month)}-${two(day)}`;
}

/** El periodo (mes calendario) de una fecha: `"2026-11-10"` → `"2026-11"`. */
export function periodOf(value: string | Date): string {
  const { year, month } = toYMD(value);
  return `${year}-${two(month)}`;
}

/** Días de calendario de `from` a `to` (positivo si `to` es posterior). Aritmética en UTC: sin horario de verano. */
export function daysBetween(from: string, to: string): number {
  const a = parseBusinessDate(from);
  const b = parseBusinessDate(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

/** «hoy», «mañana», «en 6 días», «hace 2 días» hasta ±30 días; más allá, `null` (solo la fecha absoluta). */
export function relativeDay(date: string, today: string): string | null {
  const days = daysBetween(today, date);
  if (Math.abs(days) > 30) return null;
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  if (days > 1) return `en ${days} días`;
  return days === -1 ? "hace 1 día" : `hace ${-days} días`;
}

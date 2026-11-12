/**
 * Fechas. Dos clases de valor, y no se mezclan (regla 6 del propietario):
 *  - FECHA DE NEGOCIO (`"2026-11-10"`, un `DateField`): no tiene zona; se formatea tal cual, sin pasar por `Date` local.
 *  - INSTANTE (`"2026-11-10T19:32:00Z"`): se lleva a `America/Bogota` (UTC−5, sin horario de verano).
 * Formato DD/MM/YYYY, hora de 24 h. «Hoy» es el de Bogotá aunque el navegador esté en otra zona.
 */

export const TIME_ZONE = "America/Bogota";

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const BUSINESS_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;

export interface YMD {
  year: number;
  month: number;
  day: number;
}

/**
 * Bogotá es UTC−5 todo el año (sin horario de verano desde 1993). Se calcula con aritmética fija y no con `Intl`: el motor de la
 * app móvil (Hermes) no trae siempre datos de zonas horarias, y el resultado no debe depender del motor.
 */
export const BOGOTA_OFFSET_MS = -5 * 3_600_000;

function bogotaParts(instant: Date): YMD & { hour: number; minute: number } {
  const local = new Date(instant.getTime() + BOGOTA_OFFSET_MS);
  return { year: local.getUTCFullYear(), month: local.getUTCMonth() + 1, day: local.getUTCDate(), hour: local.getUTCHours(), minute: local.getUTCMinutes() };
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

/** `10 de noviembre de 2026` (`10 November 2026` en inglés), para el lector de pantalla. */
export function formatDateLong(value: string | Date, locale: "es" | "en" = "es"): string {
  const { year, month, day } = toYMD(value);
  return locale === "en" ? `${day} ${MONTHS_EN[month - 1]} ${year}` : `${day} de ${MONTHS[month - 1]} de ${year}`;
}

/** `HH:mm` de 24 h, en Bogotá. Solo para instantes. */
export function formatTime(instant: string | Date): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new RangeError("Instante inválido");
  const { hour, minute } = bogotaParts(date);
  return `${two(hour)}:${two(minute)}`;
}

/** `"2026-11"` → `Noviembre 2026` (`November 2026` en inglés). */
export function formatPeriod(period: string, locale: "es" | "en" = "es"): string {
  const match = PERIOD.exec(period);
  if (!match) throw new RangeError("Periodo inválido: se espera AAAA-MM");
  const name = locale === "en" ? MONTHS_EN[+match[2] - 1] : MONTHS[+match[2] - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${match[1]}`;
}

/** Primer y último día de un periodo (`"2026-02"` → `2026-02-01` … `2026-02-28`), como fechas de negocio. */
export function periodRange(period: string): { from: string; to: string } {
  const match = PERIOD.exec(period);
  if (!match) throw new RangeError("Periodo inválido: se espera AAAA-MM");
  const [year, month] = [+match[1], +match[2]];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${match[1]}-${match[2]}-01`, to: `${match[1]}-${match[2]}-${two(last)}` };
}

/** El periodo `delta` meses después (o antes, si es negativo): `shiftPeriod("2026-01", -1)` = `"2025-12"`. */
export function shiftPeriod(period: string, delta: number): string {
  const match = PERIOD.exec(period);
  if (!match) throw new RangeError("Periodo inválido: se espera AAAA-MM");
  const index = +match[1] * 12 + (+match[2] - 1) + delta;
  return `${Math.floor(index / 12)}-${two((index % 12) + 1)}`;
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

/** La fecha de negocio `months` meses después; si el día no existe en el mes destino cae el último (31 ene + 1 = 28/29 feb). */
export function addMonths(value: string, months: number): string {
  const { year, month, day } = parseBusinessDate(value);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  const last = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${targetYear}-${two(targetMonth)}-${two(Math.min(day, last))}`;
}

/** La fecha de negocio `days` días después (o antes, si es negativo). Aritmética en UTC: sin horario de verano. */
export function addDays(value: string, days: number): string {
  const { year, month, day } = parseBusinessDate(value);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())}`;
}

/** Día de la semana de una fecha de negocio con el lunes en 0 (0 = lunes … 6 = domingo), como en la tabla de `weekdays`. */
export function weekdayMonday(value: string): number {
  const { year, month, day } = parseBusinessDate(value);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

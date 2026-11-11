/** Lógica pura del calendario financiero (sin React). Sin montos en consultas: solo vista, rango y fecha ancla. */
import type { Calendar, CalendarDay, CalendarItem } from "@/api/models";
import { addDays, addMonths, daysBetween, weekdayMonday } from "@/lib/dates";
import type { Target } from "../summary/logic";

export type CalendarMode = "month" | "week" | "day" | "7" | "15" | "30" | "overdue";

export const MODES: readonly CalendarMode[] = ["month", "week", "day", "7", "15", "30", "overdue"];
/** Modos con navegación anterior / siguiente (los rangos cuentan desde hoy). */
export const NAVIGABLE: ReadonlySet<CalendarMode> = new Set<CalendarMode>(["month", "week", "day"]);
export const MAX_DOTS = 3;

export function isMode(value: string | null): value is CalendarMode {
  return value !== null && (MODES as readonly string[]).includes(value);
}

/** `?rango=30` y `?vista=semana` de los enlaces profundos (§1.4 del diseño). */
export function modeFromParams(range: string | null, view: string | null): CalendarMode {
  if (range === "7" || range === "15" || range === "30") return range;
  if (range === "vencidos" || view === "vencidos") return "overdue";
  if (view === "semana" || view === "week") return "week";
  if (view === "dia" || view === "day") return "day";
  return "month";
}

export function calendarQuery(mode: CalendarMode, anchor: string): { view?: "month" | "week" | "day"; range?: 7 | 15 | 30; date?: string } {
  if (mode === "7") return { range: 7 };
  if (mode === "15") return { range: 15 };
  if (mode === "30") return { range: 30 };
  if (mode === "overdue") return { view: "month", date: anchor };
  return { view: mode, date: anchor };
}

export function shiftAnchor(mode: CalendarMode, anchor: string, direction: -1 | 1): string {
  if (mode === "month") return addMonths(anchor, direction);
  if (mode === "week") return addDays(anchor, 7 * direction);
  if (mode === "day") return addDays(anchor, direction);
  return anchor;
}

export interface GridCell {
  date: string;
  day: CalendarDay | null;
}

/** Semanas (lunes a domingo) de un mes: `null` rellena los huecos antes del día 1 y después del último. */
export function monthGrid(start: string, end: string, days: readonly CalendarDay[]): (GridCell | null)[][] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const total = daysBetween(start, end) + 1;
  const cells: (GridCell | null)[] = Array.from({ length: weekdayMonday(start) }, () => null);
  for (let i = 0; i < total; i++) {
    const date = addDays(start, i);
    cells.push({ date, day: byDate.get(date) ?? null });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (GridCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Los puntos de un día: hasta 3 y «+N»; egreso, ingreso y corte son tipos distintos (no solo color: el rótulo va escrito). */
export function dayDots(items: readonly CalendarItem[]): { shown: ("out" | "in" | "info")[]; more: number } {
  const all = items.map((i) => i.direction);
  return { shown: all.slice(0, MAX_DOTS), more: Math.max(0, all.length - MAX_DOTS) };
}

export function itemTarget(item: Pick<CalendarItem, "ref_kind" | "ref_id" | "kind">): Target {
  if (item.ref_kind === "occurrence") return { route: "pagos-fijo-pagar", params: [item.ref_id] };
  if (item.ref_kind === "card") return { route: item.kind === "card_cut" ? "tarjeta" : "tarjeta-pagar", params: [item.ref_id] };
  return { route: "creditos", params: [] };
}

export function visibleDays(calendar: Calendar, mode: CalendarMode): CalendarDay[] {
  if (mode === "overdue") return [];
  return calendar.days.filter((d) => d.items.length > 0 || d.holiday !== null || mode === "day");
}

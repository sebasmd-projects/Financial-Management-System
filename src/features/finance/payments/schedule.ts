/**
 * La parte de «cuándo se repite» de una recurrencia (diseño §3.10), común al alta y a la vista previa de fechas. Pura: valida lo
 * que escribió la persona y arma los campos que la API espera (`frequency`, `day`, `last_day`, `weekday`, `month`, `interval`).
 */
import type { Frequency } from "@/api/models";
import { toInt } from "@/lib/ints";

export const FREQUENCIES: readonly Frequency[] = ["monthly", "weekly", "biweekly", "daily", "bimonthly", "quarterly", "semiannual", "annual", "every_n_days"];

/** Las que se anclan a un mes (más de un mes entre cobros). */
const MONTH_ANCHORED = new Set<Frequency>(["bimonthly", "quarterly", "semiannual", "annual"]);
const DAY_OF_MONTH = new Set<Frequency>(["monthly", "bimonthly", "quarterly", "semiannual", "annual"]);

export interface ScheduleInput {
  frequency: Frequency;
  startDate: string;
  endDate: string;
  day: string;
  lastDay: boolean;
  weekday: string;
  month: string;
  interval: string;
  holidayRule: "none" | "next" | "previous";
}

export interface ScheduleFields {
  frequency: Frequency;
  start_date: string;
  end_date?: string;
  day?: number;
  last_day?: boolean;
  weekday?: number;
  month?: number;
  interval?: number;
  holiday_rule: "none" | "next" | "previous";
}

export const usesDay = (f: Frequency) => DAY_OF_MONTH.has(f);
export const usesMonth = (f: Frequency) => MONTH_ANCHORED.has(f);
export const usesWeekday = (f: Frequency) => f === "weekly";
export const usesInterval = (f: Frequency) => f === "every_n_days";

/** Los campos listos para enviar, o `null` si falta algo (fecha de inicio, día válido, intervalo…). */
export function scheduleFields(input: ScheduleInput): ScheduleFields | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) return null;
  if (input.endDate && (!/^\d{4}-\d{2}-\d{2}$/.test(input.endDate) || input.endDate < input.startDate)) return null;
  const fields: ScheduleFields = { frequency: input.frequency, start_date: input.startDate, holiday_rule: input.holidayRule };
  if (input.endDate) fields.end_date = input.endDate;
  if (usesDay(input.frequency)) {
    if (input.lastDay) fields.last_day = true;
    else {
      const day = toInt(input.day, 1, 31);
      if (day === null) return null;
      fields.day = day;
    }
  }
  if (usesMonth(input.frequency)) {
    const month = toInt(input.month, 1, 12);
    if (month === null) return null;
    fields.month = month;
  }
  if (usesWeekday(input.frequency)) {
    const weekday = toInt(input.weekday, 0, 6);
    if (weekday === null) return null;
    fields.weekday = weekday;
  }
  if (usesInterval(input.frequency)) {
    const interval = toInt(input.interval, 1, 365);
    if (interval === null) return null;
    fields.interval = interval;
  }
  return fields;
}

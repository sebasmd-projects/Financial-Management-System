import { describe, expect, it } from "vitest";
import { scheduleFields, type ScheduleInput } from "./schedule";

const base: ScheduleInput = { frequency: "monthly", startDate: "2026-11-01", endDate: "", day: "5", lastDay: false, weekday: "0", month: "3", interval: "30", holidayRule: "next" };

describe("campos de una recurrencia", () => {
  it("mensual: día del mes, sin campos de otras frecuencias", () => {
    expect(scheduleFields(base)).toEqual({ frequency: "monthly", start_date: "2026-11-01", holiday_rule: "next", day: 5 });
  });
  it("«último día» reemplaza el día", () => {
    expect(scheduleFields({ ...base, lastDay: true })).toEqual({ frequency: "monthly", start_date: "2026-11-01", holiday_rule: "next", last_day: true });
  });
  it("anual lleva día y mes de anclaje; semanal, día de la semana; cada N días, el intervalo", () => {
    expect(scheduleFields({ ...base, frequency: "annual" })).toMatchObject({ day: 5, month: 3 });
    expect(scheduleFields({ ...base, frequency: "weekly", weekday: "4" })).toEqual({ frequency: "weekly", start_date: "2026-11-01", holiday_rule: "next", weekday: 4 });
    expect(scheduleFields({ ...base, frequency: "every_n_days", interval: "45" })).toMatchObject({ interval: 45 });
  });
  it("lo inválido devuelve null: día 32, intervalo 0, fin antes del inicio, sin fecha", () => {
    expect(scheduleFields({ ...base, day: "32" })).toBeNull();
    expect(scheduleFields({ ...base, frequency: "every_n_days", interval: "0" })).toBeNull();
    expect(scheduleFields({ ...base, endDate: "2026-10-01" })).toBeNull();
    expect(scheduleFields({ ...base, startDate: "" })).toBeNull();
  });
});

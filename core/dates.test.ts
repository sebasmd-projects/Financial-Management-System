import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  daysBetween,
  formatDate,
  formatDateLong,
  formatDateShort,
  formatDayMonth,
  formatPeriod,
  formatTime,
  isBusinessDate,
  parseBusinessDate,
  periodOf,
  relativeDay,
  todayBogota,
  weekdayMonday,
} from "./dates";

describe("formatDate", () => {
  it("fecha de negocio: DD/MM/YYYY tal cual, sin zona", () => {
    expect(formatDate("2026-11-10")).toBe("10/11/2026");
    expect(formatDate("2026-01-05")).toBe("05/01/2026");
    expect(formatDate("2028-02-29")).toBe("29/02/2028");
  });
  it("instante: se lleva a America/Bogota (UTC−5)", () => {
    expect(formatDate("2026-11-10T19:32:00Z")).toBe("10/11/2026");
    // 02:00 UTC del 11 es todavía el 10 a las 21:00 en Bogotá.
    expect(formatDate("2026-11-11T02:00:00Z")).toBe("10/11/2026");
    expect(formatDate("2026-11-11T05:00:00Z")).toBe("11/11/2026");
    expect(formatDate("2026-01-01T04:59:59Z")).toBe("31/12/2025");
    expect(formatDate(new Date("2026-11-11T04:59:59Z"))).toBe("10/11/2026");
  });
  it("con desplazamiento explícito", () => {
    expect(formatDate("2026-11-10T23:30:00-05:00")).toBe("10/11/2026");
    expect(formatDate("2026-11-10T23:30:00-08:00")).toBe("11/11/2026");
  });
  it("no depende de la zona del proceso para una fecha de negocio", () => {
    const original = process.env.TZ;
    process.env.TZ = "Pacific/Auckland";
    try {
      expect(formatDate("2026-11-10")).toBe("10/11/2026");
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
  it("rechaza lo inválido", () => {
    expect(() => formatDate("2026-02-30")).toThrow(RangeError);
    expect(() => formatDate("no es fecha")).toThrow(RangeError);
    expect(() => formatDate("2026-13-01")).toThrow(RangeError);
  });
});

describe("otros formatos", () => {
  it("corta, con mes y larga", () => {
    expect(formatDateShort("2026-11-16")).toBe("16/11");
    expect(formatDayMonth("2026-11-10")).toBe("10 nov");
    expect(formatDayMonth("2026-09-03")).toBe("3 sep");
    expect(formatDateLong("2026-11-10")).toBe("10 de noviembre de 2026");
  });
  it("hora de 24 h en Bogotá", () => {
    expect(formatTime("2026-11-10T19:32:00Z")).toBe("14:32");
    expect(formatTime("2026-11-10T05:05:00Z")).toBe("00:05");
    expect(formatTime("2026-11-10T04:59:00Z")).toBe("23:59");
  });
  it("periodo con mayúscula inicial", () => {
    expect(formatPeriod("2026-11")).toBe("Noviembre 2026");
    expect(formatPeriod("2027-01")).toBe("Enero 2027");
    expect(() => formatPeriod("2026-13")).toThrow(RangeError);
    expect(periodOf("2026-11-30")).toBe("2026-11");
  });
});

describe("hoy y relativas", () => {
  it("hoy es el de Bogotá, no el UTC", () => {
    expect(todayBogota(new Date("2026-11-11T03:00:00Z"))).toBe("2026-11-10");
    expect(todayBogota(new Date("2026-11-11T05:00:00Z"))).toBe("2026-11-11");
  });
  it("diferencia de días, incluso cruzando mes y año bisiesto", () => {
    expect(daysBetween("2026-11-10", "2026-11-16")).toBe(6);
    expect(daysBetween("2026-11-10", "2026-11-05")).toBe(-5);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });
  it("hoy, mañana, en N días, hace N días, hasta ±30", () => {
    const today = "2026-11-10";
    expect(relativeDay("2026-11-10", today)).toBe("hoy");
    expect(relativeDay("2026-11-11", today)).toBe("mañana");
    expect(relativeDay("2026-11-16", today)).toBe("en 6 días");
    expect(relativeDay("2026-11-08", today)).toBe("hace 2 días");
    expect(relativeDay("2026-11-09", today)).toBe("hace 1 día");
    expect(relativeDay("2026-12-10", today)).toBe("en 30 días");
    expect(relativeDay("2026-12-11", today)).toBeNull();
    expect(relativeDay("2026-10-11", today)).toBe("hace 30 días");
    expect(relativeDay("2026-10-10", today)).toBeNull();
  });
  it("validación", () => {
    expect(isBusinessDate("2026-11-10")).toBe(true);
    expect(isBusinessDate("2026-02-29")).toBe(false);
    expect(isBusinessDate(20261110)).toBe(false);
    expect(parseBusinessDate("2026-11-10")).toEqual({ year: 2026, month: 11, day: 10 });
  });
});

describe("periodos para los filtros", () => {
  it("periodRange: primer y último día, también febrero bisiesto", async () => {
    const { periodRange } = await import("./dates");
    expect(periodRange("2026-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(periodRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(periodRange("2026-12").to).toBe("2026-12-31");
  });
  it("shiftPeriod cruza el año hacia atrás y hacia adelante", async () => {
    const { shiftPeriod } = await import("./dates");
    expect(shiftPeriod("2026-01", -1)).toBe("2025-12");
    expect(shiftPeriod("2026-12", 1)).toBe("2027-01");
    expect(shiftPeriod("2026-11", 0)).toBe("2026-11");
  });
  it("formatPeriod y formatDateLong en inglés", async () => {
    const { formatPeriod, formatDateLong } = await import("./dates");
    expect(formatPeriod("2026-11", "en")).toBe("November 2026");
    expect(formatPeriod("2026-11")).toBe("Noviembre 2026");
    expect(formatDateLong("2026-11-10", "en")).toBe("10 November 2026");
  });
});

describe("addMonths", () => {
  it("suma meses y recorta el día al último del mes destino", () => {
    expect(addMonths("2026-01-15", 3)).toBe("2026-04-15");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-12-10", 12)).toBe("2027-12-10");
  });
});

describe("addDays y weekdayMonday", () => {
  it("suma días cruzando mes y año", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-11-11", 30)).toBe("2026-12-11");
  });
  it("lunes es 0 y domingo 6", () => {
    expect(weekdayMonday("2026-11-09")).toBe(0);
    expect(weekdayMonday("2026-11-15")).toBe(6);
    expect(weekdayMonday("2026-11-01")).toBe(6);
  });
});

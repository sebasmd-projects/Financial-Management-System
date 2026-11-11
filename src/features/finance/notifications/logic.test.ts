import { describe, expect, it } from "vitest";
import type { Notification } from "@/api/models";
import { groupNotifications, isTime, offsetsText, parseOffsets, paymentTarget, timeInput } from "./logic";

const n = (id: string, group: Notification["group"]) => ({ id, group }) as Notification;

describe("avisos", () => {
  it("agrupa en Hoy, Esta semana y Anteriores, en ese orden, sin grupos vacíos", () => {
    const groups = groupNotifications([n("a", "earlier"), n("b", "today"), n("c", "earlier")]);
    expect(groups.map((g) => [g.group, g.items.map((i) => i.id)])).toEqual([["today", ["b"]], ["earlier", ["a", "c"]]]);
    expect(groupNotifications([])).toEqual([]);
  });
  it("«Marcar pagado» solo donde hay una obligación que pagar", () => {
    expect(paymentTarget({ object_kind: "occurrence", object_id: "o1" })).toEqual({ route: "pagos-fijo-pagar", params: ["o1"] });
    expect(paymentTarget({ object_kind: "card", object_id: "c1" })).toEqual({ route: "tarjeta-pagar", params: ["c1"] });
    expect(paymentTarget({ object_kind: "", object_id: null })).toBeNull();
    expect(paymentTarget({ object_kind: "loan_installment", object_id: "i1" })).toBeNull();
  });
  it("horas", () => {
    expect(isTime("21:00")).toBe(true);
    expect(isTime("24:00")).toBe(false);
    expect(isTime("7:00")).toBe(false);
    expect(timeInput("21:00:00")).toBe("21:00");
  });
  it("días de anticipación: enteros de 0 a 60, hasta 6, sin repetidos y de mayor a menor", () => {
    expect(parseOffsets("1, 5")).toEqual([5, 1]);
    expect(parseOffsets("3 3 0")).toEqual([3, 0]);
    expect(parseOffsets("")).toEqual([]);
    expect(parseOffsets("61")).toBeNull();
    expect(parseOffsets("a")).toBeNull();
    expect(parseOffsets("1,2,3,4,5,6,7")).toBeNull();
    expect(offsetsText([5, 1])).toBe("5, 1");
  });
});

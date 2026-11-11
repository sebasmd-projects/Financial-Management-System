import { describe, expect, it } from "vitest";
import type { RuleTrigger } from "@/api/models";
import { buildConditions, defaultCondition, parseConditionValue, parseCooldown, ruleProblems, toDraft, withField } from "./logic";

const TRIGGER: RuleTrigger = {
  key: "card_utilization",
  label: "Utilización de una tarjeta",
  subject: "card",
  condition_fields: [
    { key: "utilization", kind: "percent", label: "Usado ÷ cupo (%)", operators: ["gt", "gte", "lt", "lte", "eq", "ne"], choices: [] },
    { key: "used", kind: "amount", label: "Usado", operators: ["gt", "gte", "lt", "lte", "eq", "ne"], choices: [] },
    { key: "state", kind: "option", label: "Estado", operators: ["eq", "ne"], choices: ["normal", "attention", "exceeded"] },
    { key: "days_left", kind: "count", label: "Días", operators: ["gt", "gte", "lt", "lte", "eq", "ne"], choices: [] },
  ],
};
const F = (key: string) => TRIGGER.condition_fields.find((f) => f.key === key)!;

describe("valores de una condición según el tipo del campo", () => {
  it("montos: hasta 2 decimales, sin redondear; el cero y los negativos valen (saldo < 0)", () => {
    expect(parseConditionValue(F("used"), "850.000")).toBe("850000");
    expect(parseConditionValue(F("used"), "1.250.000,50")).toBe("1250000.50");
    expect(parseConditionValue(F("used"), "0")).toBe("0");
    expect(parseConditionValue(F("used"), "-50.000")).toBe("-50000");
    expect(parseConditionValue(F("used"), "-0")).toBe("0");
    expect(parseConditionValue(F("used"), "10,1256")).toBeNull();
    expect(parseConditionValue(F("used"), "abc")).toBeNull();
    expect(parseConditionValue(F("used"), "")).toBeNull();
  });
  it("porcentajes en puntos: 0 a 1000, hasta 4 decimales", () => {
    expect(parseConditionValue(F("utilization"), "70")).toBe("70");
    expect(parseConditionValue(F("utilization"), "70,5")).toBe("70.5");
    expect(parseConditionValue(F("utilization"), "080.50")).toBe("80.5");
    expect(parseConditionValue(F("utilization"), "1000")).toBe("1000");
    expect(parseConditionValue(F("utilization"), "1000,1")).toBeNull();
    expect(parseConditionValue(F("utilization"), "1001")).toBeNull();
    expect(parseConditionValue(F("utilization"), "-1")).toBeNull();
    expect(parseConditionValue(F("utilization"), "7,12345")).toBeNull();
  });
  it("conteos: enteros de −3650 a 3650", () => {
    expect(parseConditionValue(F("days_left"), "5")).toBe("5");
    expect(parseConditionValue(F("days_left"), "-3")).toBe("-3");
    expect(parseConditionValue(F("days_left"), "-0")).toBe("0");
    expect(parseConditionValue(F("days_left"), "3651")).toBeNull();
    expect(parseConditionValue(F("days_left"), "2,5")).toBeNull();
  });
  it("opciones: solo las del catálogo", () => {
    expect(parseConditionValue(F("state"), "exceeded")).toBe("exceeded");
    expect(parseConditionValue(F("state"), "hack")).toBeNull();
    expect(parseConditionValue(F("state"), "{{7*7}}")).toBeNull();
  });
});

describe("condiciones listas para enviar", () => {
  it("«si utilización ≥ 70 %»: la regla del criterio de aceptación", () => {
    const built = buildConditions(TRIGGER, [{ field: "utilization", op: "gte", value: "70" }], 5);
    expect(built).toEqual({ conditions: [{ field: "utilization", op: "gte", value: "70" }], invalid: [] });
  });
  it("marca cuáles no valen, y no hay lista si falta alguna", () => {
    const built = buildConditions(TRIGGER, [{ field: "utilization", op: "gte", value: "70" }, { field: "used", op: "gt", value: "x" }], 5);
    expect(built.conditions).toBeNull();
    expect(built.invalid).toEqual([1]);
  });
  it("de 1 a `max`; un operador que el campo no admite no vale", () => {
    expect(buildConditions(TRIGGER, [], 5).conditions).toBeNull();
    const six = Array.from({ length: 6 }, () => ({ field: "utilization", op: "gt" as const, value: "1" }));
    expect(buildConditions(TRIGGER, six, 5).conditions).toBeNull();
    expect(buildConditions(TRIGGER, [{ field: "state", op: "gt", value: "normal" }], 5).invalid).toEqual([0]);
    expect(buildConditions(undefined, [{ field: "x", op: "gt", value: "1" }], 5).conditions).toBeNull();
  });
  it("una condición nueva parte del primer campo; cambiar de campo reinicia el valor", () => {
    expect(defaultCondition(TRIGGER)).toEqual({ field: "utilization", op: "gt", value: "" });
    expect(withField(TRIGGER, { field: "utilization", op: "gte", value: "70" }, "used")).toEqual({ field: "used", op: "gte", value: "" });
    expect(withField(TRIGGER, { field: "used", op: "gt", value: "5" }, "state")).toEqual({ field: "state", op: "eq", value: "normal" });
    expect(toDraft({ field: "used", op: "lt", value: "1000.00" })).toEqual({ field: "used", op: "lt", value: "1000.00" });
  });
});

describe("el resto de la regla", () => {
  it("espera entre avisos de 1 a 90 días", () => {
    expect(parseCooldown("7", [1, 90])).toBe(7);
    expect(parseCooldown("0", [1, 90])).toBeNull();
    expect(parseCooldown("91", [1, 90])).toBeNull();
    expect(parseCooldown("2,5", [1, 90])).toBeNull();
  });
  it("qué falta para guardar", () => {
    const ok = { name: "Alerta", trigger: "card_utilization", conditionsOk: true, channels: ["app"], cooldownOk: true, titleLength: 10, maxTitle: 40 };
    expect(ruleProblems(ok)).toEqual([]);
    expect(ruleProblems({ ...ok, name: "  ", channels: [], titleLength: 41 })).toEqual(["name", "channels", "title"]);
  });
});

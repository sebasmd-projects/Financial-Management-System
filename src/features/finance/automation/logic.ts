/**
 * Lógica pura del constructor de reglas (FMS-3a, corte 3.1; diseño §3.16). Una regla es un DATO: el disparador, los campos, los
 * operadores y las opciones salen del catálogo cerrado del servidor (`GET automation/catalog`); aquí solo se arman y validan los
 * valores que escribe la persona. Los umbrales que son montos siguen las reglas del dinero: cadenas decimales, hasta 2 decimales,
 * nunca `Number` ni `parseFloat`.
 */
import type { RuleCondition, RuleField, RuleOperator, RuleTrigger } from "@/api/models";
import { normalizeAmountInput } from "@/lib/amount-input";

export type FieldKind = RuleField["kind"];

export interface DraftCondition {
  field: string;
  op: RuleOperator;
  value: string;
}

export const OPERATOR_SYMBOLS: Record<RuleOperator, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=", ne: "≠" };

export function fieldOf(trigger: RuleTrigger | undefined, key: string): RuleField | undefined {
  return trigger?.condition_fields.find((f) => f.key === key);
}

/** Una condición nueva sobre el primer campo del disparador, con su primer operador (y la primera opción si el campo es de opciones). */
export function defaultCondition(trigger: RuleTrigger): DraftCondition {
  const field = trigger.condition_fields[0];
  return { field: field.key, op: field.operators[0] as RuleOperator, value: field.kind === "option" ? (field.choices[0] ?? "") : "" };
}

/** Cambiar de campo reinicia operador y valor: lo que valía para un monto no vale para una opción. */
export function withField(trigger: RuleTrigger, draft: DraftCondition, key: string): DraftCondition {
  const field = fieldOf(trigger, key);
  if (!field) return draft;
  return { field: key, op: (field.operators.includes(draft.op) ? draft.op : field.operators[0]) as RuleOperator, value: field.kind === "option" ? (field.choices[0] ?? "") : "" };
}

const PERCENT = /^(\d{1,4})(?:[.,](\d{1,4}))?$/;
const COUNT = /^(-?)(\d{1,4})$/;
export const MAX_PERCENT_WHOLE = "1000";
export const MAX_COUNT = 3650;

/**
 * El valor de una condición según el tipo del campo → la cadena que espera la API, o `null` si no vale.
 *  - monto: con signo opcional (un saldo puede compararse con 0 o con un negativo), hasta 2 decimales, sin redondear;
 *  - porcentaje: puntos (`70` = 70 %), de 0 a 1000, hasta 4 decimales;
 *  - conteo: entero de −3650 a 3650 (los días que faltan son negativos cuando ya venció);
 *  - opción: tiene que ser una del catálogo.
 */
export function parseConditionValue(field: Pick<RuleField, "kind" | "choices">, text: string): string | null {
  const raw = text.trim();
  switch (field.kind) {
    case "amount": {
      const negative = raw.startsWith("-");
      const value = normalizeAmountInput(negative ? raw.slice(1) : raw);
      if (value === null) return null;
      return negative && !/^0*(\.0*)?$/.test(value) ? `-${value}` : value;
    }
    case "percent": {
      const match = PERCENT.exec(raw);
      if (!match) return null;
      const whole = match[1].replace(/^0+(?=\d)/, "");
      const fraction = (match[2] ?? "").replace(/0+$/, "");
      if (whole.length > 4 || (whole.length === 4 && (whole !== MAX_PERCENT_WHOLE || fraction !== ""))) return null;
      return fraction ? `${whole}.${fraction}` : whole;
    }
    case "count": {
      const match = COUNT.exec(raw);
      if (!match) return null;
      const digits = match[2].replace(/^0+(?=\d)/, "");
      if (+digits > MAX_COUNT) return null;
      return digits === "0" ? "0" : `${match[1]}${digits}`;
    }
    case "option":
      return field.choices.includes(raw) ? raw : null;
  }
}

export interface BuiltConditions {
  conditions: RuleCondition[] | null;
  /** Posición de cada condición con valor inválido. */
  invalid: number[];
}

/** Las condiciones listas para enviar: todas válidas, entre 1 y `max`, y sobre campos del disparador; si no, `conditions` es `null`. */
export function buildConditions(trigger: RuleTrigger | undefined, drafts: readonly DraftCondition[], max: number): BuiltConditions {
  if (!trigger || drafts.length < 1 || drafts.length > max) return { conditions: null, invalid: [] };
  const out: RuleCondition[] = [];
  const invalid: number[] = [];
  drafts.forEach((draft, index) => {
    const field = fieldOf(trigger, draft.field);
    const value = field && field.operators.includes(draft.op) ? parseConditionValue(field, draft.value) : null;
    if (value === null) invalid.push(index);
    else out.push({ field: draft.field, op: draft.op, value });
  });
  return invalid.length > 0 ? { conditions: null, invalid } : { conditions: out, invalid };
}

/** La condición guardada → lo que se escribe en el campo al editar (sin ceros de relleno en porcentajes y conteos). */
export function toDraft(condition: RuleCondition): DraftCondition {
  return { field: condition.field, op: condition.op as RuleOperator, value: condition.value };
}

/** Días de espera entre avisos de una misma regla sobre un mismo sujeto (1 a 90). */
export function parseCooldown(text: string, range: readonly number[]): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null;
  const value = +text.trim();
  const [min, max] = [range[0] ?? 1, range[range.length - 1] ?? 90];
  return value >= min && value <= max ? value : null;
}

/** Hasta qué punto una regla está lista para guardarse (solo los campos que se piden al armarla). */
export function ruleProblems(input: { name: string; trigger: string; conditionsOk: boolean; channels: readonly string[]; cooldownOk: boolean; titleLength: number; maxTitle: number }): ("name" | "trigger" | "conditions" | "channels" | "cooldown" | "title")[] {
  const out: ("name" | "trigger" | "conditions" | "channels" | "cooldown" | "title")[] = [];
  if (input.name.trim() === "" || input.name.trim().length > 80) out.push("name");
  if (input.trigger === "") out.push("trigger");
  if (!input.conditionsOk) out.push("conditions");
  if (input.channels.length === 0) out.push("channels");
  if (!input.cooldownOk) out.push("cooldown");
  if (input.titleLength > input.maxTitle) out.push("title");
  return out;
}

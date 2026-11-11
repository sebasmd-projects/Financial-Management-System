import type { CustomAttribute, MovementType } from "@/api/models";

export const ATTRIBUTE_KINDS = ["text", "number", "date", "choice"] as const;
export const ATTRIBUTE_TYPES: readonly MovementType[] = ["expense", "income", "transfer"];
export const MAX_ATTRIBUTE_TEXT = 200;
export const MAX_OPTIONS = 20;

/** Los atributos que se piden en un tipo de movimiento: activos, y los que no tienen tipos o lo incluyen. */
export function applicableAttributes(defs: readonly CustomAttribute[], type: MovementType): CustomAttribute[] {
  return defs.filter((a) => !a.archived && (a.applies_to.length === 0 || a.applies_to.includes(type)));
}

/** Un número escrito por la persona (`12,5`, `-3`) → el texto que espera la API (`12.5`). Sin `Number`. */
export function normalizeAttributeNumber(raw: string): string | null {
  const text = raw.trim().replace(",", ".");
  return /^-?\d{1,13}(\.\d{1,6})?$/.test(text) ? text : null;
}

/** Las opciones de una lista escritas una por línea (o separadas por coma / punto y coma), sin repetir y sin vacías. */
export function parseOptions(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(/[\n;,]/)) {
    const option = piece.trim().replace(/\s+/g, " ");
    if (option === "" || seen.has(option.toLowerCase())) continue;
    seen.add(option.toLowerCase());
    out.push(option);
  }
  return out;
}

export type AttributeProblem = { id: string; kind: "required" | "invalid" };

export interface AttributesResult {
  /** `{ id: valor }`, solo los que se escribieron y valen. */
  body: Record<string, string>;
  problems: AttributeProblem[];
}

/** Valida y arma los valores de los atributos de un movimiento antes de enviarlos (el servidor vuelve a validar). */
export function attributesBody(defs: readonly CustomAttribute[], values: Readonly<Record<string, string>>, type: MovementType): AttributesResult {
  const body: Record<string, string> = {};
  const problems: AttributeProblem[] = [];
  for (const def of applicableAttributes(defs, type)) {
    const raw = (values[def.id] ?? "").trim();
    if (raw === "") {
      if (def.required) problems.push({ id: def.id, kind: "required" });
      continue;
    }
    if (def.kind === "number") {
      const n = normalizeAttributeNumber(raw);
      if (n === null) problems.push({ id: def.id, kind: "invalid" });
      else body[def.id] = n;
    } else if (def.kind === "choice") {
      if (def.options.includes(raw)) body[def.id] = raw;
      else problems.push({ id: def.id, kind: "invalid" });
    } else if (def.kind === "date") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) body[def.id] = raw;
      else problems.push({ id: def.id, kind: "invalid" });
    } else if (raw.length > MAX_ATTRIBUTE_TEXT) {
      problems.push({ id: def.id, kind: "invalid" });
    } else {
      body[def.id] = raw.replace(/\s+/g, " ");
    }
  }
  return { body, problems };
}

/** Rango del mes en curso, hasta hoy (para «lo gastado por centro de costo»). */
export function monthToDate(today: string): { from: string; to: string } {
  return { from: `${today.slice(0, 8)}01`, to: today };
}

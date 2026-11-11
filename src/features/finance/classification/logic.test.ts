import { describe, expect, it } from "vitest";
import type { CustomAttribute } from "@/api/models";
import { applicableAttributes, attributesBody, monthToDate, normalizeAttributeNumber, parseOptions } from "./logic";

const def = (patch: Partial<CustomAttribute> & Pick<CustomAttribute, "id" | "kind">): CustomAttribute => ({ name: patch.id, options: [], applies_to: [], required: false, archived: false, ...patch });
const DEFS = [
  def({ id: "t", kind: "text" }),
  def({ id: "n", kind: "number", applies_to: ["expense"] }),
  def({ id: "d", kind: "date", required: true }),
  def({ id: "c", kind: "choice", options: ["Alta", "Baja"] }),
  def({ id: "x", kind: "text", archived: true }),
];

describe("atributos personalizados", () => {
  it("solo los activos que aplican al tipo (sin tipos = todos)", () => {
    expect(applicableAttributes(DEFS, "expense").map((a) => a.id)).toEqual(["t", "n", "d", "c"]);
    expect(applicableAttributes(DEFS, "income").map((a) => a.id)).toEqual(["t", "d", "c"]);
  });
  it("arma el cuerpo con los valores válidos, normaliza el número y marca lo obligatorio que falta", () => {
    const r = attributesBody(DEFS, { t: "  Viaje   a  Cali ", n: "12,5", c: "Alta" }, "expense");
    expect(r.body).toEqual({ t: "Viaje a Cali", n: "12.5", c: "Alta" });
    expect(r.problems).toEqual([{ id: "d", kind: "required" }]);
  });
  it("valores inválidos: número, opción fuera de la lista y fecha", () => {
    const r = attributesBody(DEFS, { n: "doce", c: "Media", d: "10/11/2026" }, "expense");
    expect(r.body).toEqual({});
    expect(r.problems).toEqual([{ id: "n", kind: "invalid" }, { id: "d", kind: "invalid" }, { id: "c", kind: "invalid" }]);
  });
  it("un atributo que no aplica al tipo no se pide ni se envía", () => {
    const r = attributesBody(DEFS, { n: "5", d: "2026-11-10" }, "income");
    expect(r.body).toEqual({ d: "2026-11-10" });
    expect(r.problems).toEqual([]);
  });
  it("números y opciones", () => {
    expect(normalizeAttributeNumber("-3")).toBe("-3");
    expect(normalizeAttributeNumber("1.200")).toBe("1.200");
    expect(normalizeAttributeNumber("1,2,3")).toBeNull();
    expect(parseOptions("Alta, Baja;\n alta \n\nMedia  alta")).toEqual(["Alta", "Baja", "Media alta"]);
  });
  it("mes en curso hasta hoy", () => {
    expect(monthToDate("2026-11-11")).toEqual({ from: "2026-11-01", to: "2026-11-11" });
  });
});

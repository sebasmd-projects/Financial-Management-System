import { describe, expect, it } from "vitest";
import type { ImportPreviewRow } from "@/api/models";
import { buildUpload, editsBody, kindsForAmount, isBlocked, withEdit, effectiveAction, fileProblem, initialMapping, mappingProblems, mappingToApi, overridesBody, tally, toggleRow, uploadFingerprint, EMPTY_MAPPING, MAX_UPLOAD_BYTES } from "./logic";

const row = (number: number, match: ImportPreviewRow["match"], action: ImportPreviewRow["action"]): ImportPreviewRow => ({ number, date: "2026-11-02", amount: "-182300.00", description: "ÉXITO", reference: "", match, candidate_id: null, action, counterparty: null, category_id: null, kind: null, installments: null, period_start: null, period_end: null, refund_of_id: null, refund_of_row: null, counter_account: null, issue: "" });
const HEADERS = ["Fecha", "Descripción", "Valor", "Saldo"];

describe("archivo", () => {
  it("tope de tamaño, vacío y extensión", () => {
    expect(fileProblem({ name: "x.csv", size: 10 })).toBeNull();
    expect(fileProblem({ name: "x.XLSX", size: 10 })).toBeNull();
    expect(fileProblem({ name: "x.ofx", size: MAX_UPLOAD_BYTES + 1 })).toBe("too_large");
    expect(fileProblem({ name: "x.csv", size: 0 })).toBe("empty");
    expect(fileProblem({ name: "x.pdf", size: 10 })).toBe("extension");
  });
});

describe("mapeo", () => {
  it("la propuesta rellena las columnas pero NUNCA el formato de fecha (la confirma la persona)", () => {
    const form = initialMapping(HEADERS, null, { date: "Fecha", description: "Descripción", amount: "Valor", balance: "Saldo", decimal_sep: ",", thousands_sep: "." });
    expect(form).toMatchObject({ date: "Fecha", amount: "Valor", mode: "single", dateFormat: "", decimalSep: ",", thousandsSep: "." });
    expect(mappingProblems(form)).toEqual(["date_format"]);
    expect(mappingToApi(form)).toBeNull();
  });
  it("con débito y crédito por separado cambia de modo", () => {
    const form = initialMapping(["Fecha", "Retiros", "Depósitos"], null, { date: "Fecha", debit: "Retiros", credit: "Depósitos" });
    expect(form.mode).toBe("split");
    expect(mappingProblems({ ...form, dateFormat: "%d/%m/%Y" })).toEqual([]);
  });
  it("un mapeo completo viaja con solo lo del modo elegido", () => {
    const form = { ...EMPTY_MAPPING, date: "Fecha", amount: "Valor", debit: "Sobra", dateFormat: "%d/%m/%Y" as const };
    expect(mappingToApi(form)).toEqual({ date: "Fecha", description: "", amount: "Valor", debit: "", credit: "", reference: "", balance: "", date_format: "%d/%m/%Y", decimal_sep: ",", thousands_sep: ".", header_row: 0, installments: "" });
  });
  it("faltas: fecha, valor, formato, fila de títulos y separadores iguales", () => {
    expect(mappingProblems(EMPTY_MAPPING)).toEqual(["date", "amount", "date_format"]);
    expect(mappingProblems({ ...EMPTY_MAPPING, date: "F", amount: "V", dateFormat: "serial", headerRow: "99" })).toEqual(["header_row"]);
    expect(mappingProblems({ ...EMPTY_MAPPING, date: "F", amount: "V", dateFormat: "serial", thousandsSep: "," })).toEqual(["same_separator"]);
  });
  it("el mapeo guardado se vuelve a mostrar con sus columnas", () => {
    const form = initialMapping(HEADERS, { date: "fecha", description: "Descripción", amount: "Valor", debit: "", credit: "", reference: "", balance: "", date_format: "%d/%m/%Y", decimal_sep: ",", thousands_sep: ".", header_row: 0, installments: "" }, null);
    expect(form).toMatchObject({ date: "Fecha", amount: "Valor", dateFormat: "%d/%m/%Y" });
  });
});

describe("decisiones por fila", () => {
  const rows = [row(2, "new", "import"), row(3, "matches_pending", "confirm"), row(4, "possible_duplicate", "skip"), row(5, "duplicate", "skip")];
  it("sin decisiones, vale lo que propone el servidor", () => {
    expect(tally(rows, new Map())).toEqual({ import: 1, confirm: 1, link: 0, skip: 2 });
    expect(overridesBody(new Map())).toEqual({});
  });
  it("omitir una nueva y pedir importar un posible duplicado", () => {
    let choices = new Map<number, "import" | "skip">();
    choices = toggleRow(rows[0], false, choices);
    choices = toggleRow(rows[2], true, choices);
    expect(overridesBody(choices)).toEqual({ "2": "skip", "4": "import" });
    expect(tally(rows, choices)).toEqual({ import: 1, confirm: 1, link: 0, skip: 2 });
    expect(effectiveAction(rows[0], choices)).toBe("skip");
  });
  it("volver a marcar o desmarcar quita la decisión (queda lo propuesto)", () => {
    let choices = toggleRow(rows[0], false, new Map());
    choices = toggleRow(rows[0], true, choices);
    expect(choices.size).toBe(0);
    choices = toggleRow(rows[2], true, choices);
    choices = toggleRow(rows[2], false, choices);
    expect(choices.size).toBe(0);
  });
  it("un duplicado exacto no se puede importar", () => {
    expect(toggleRow(rows[3], true, new Map()).size).toBe(0);
  });
});

describe("carga multipart", () => {
  const file = new File(["fecha;valor\n"], "extracto.csv", { type: "text/csv", lastModified: 1760000000000 });
  it("lleva archivo, cuenta, mapeo y decisiones como texto; sin ellos, solo lo necesario", () => {
    const form = buildUpload({ file, accountId: "a-1", mapping: null });
    expect([...form.keys()].sort()).toEqual(["account_id", "file"]);
    const full = buildUpload({ file, accountId: "a-1", mapping: mappingToApi({ ...EMPTY_MAPPING, date: "F", amount: "V", dateFormat: "%d/%m/%Y" }), overrides: { "2": "skip" }, saveMapping: false });
    expect(full.get("save_mapping")).toBe("false");
    expect(JSON.parse(String(full.get("overrides")))).toEqual({ "2": "skip" });
    expect(JSON.parse(String(full.get("mapping")))).toMatchObject({ date: "F", date_format: "%d/%m/%Y" });
  });
  it("la huella identifica la intención sin llevar el contenido", () => {
    const a = JSON.stringify(uploadFingerprint({ file, accountId: "a-1", mapping: null }));
    expect(a).toContain("extracto.csv");
    expect(JSON.stringify(uploadFingerprint({ file, accountId: "a-2", mapping: null }))).not.toBe(a);
    expect(a).not.toContain("fecha;valor");
  });
});

describe("tarjeta de crédito", () => {
  const file = new File(["x"], "t.csv", { lastModified: 1 });
  it("las clases que caben con el signo: un cargo no es un pago", () => {
    expect(kindsForAmount("-50000.00")).toEqual(["purchase", "advance", "interest", "fee", "insurance", "adjustment"]);
    expect(kindsForAmount("60000.00")).toEqual(["payment", "refund", "adjustment"]);
  });
  it("cambiar de clase olvida la cuenta y las cuotas; un cambio vacío saca la fila de las ediciones", () => {
    let edits = withEdit(new Map(), 4, { kind: "payment", counterAccount: "unregistered" });
    expect(editsBody(edits)).toEqual({ "4": { kind: "payment", counter_account: "unregistered" } });
    edits = withEdit(edits, 4, { kind: "refund" });
    expect(editsBody(edits)).toEqual({ "4": { kind: "refund" } });
    edits = withEdit(new Map(), 2, { installments: 6 });
    expect(editsBody(edits)).toEqual({ "2": { installments: 6 } });
    expect(editsBody(new Map())).toBeNull();
  });
  it("el multipart lleva el signo y las ediciones solo cuando cambian algo, y la huella de la intención los incluye", () => {
    const plain = buildUpload({ file, accountId: "c-1", mapping: null });
    expect(plain.get("sign")).toBeNull();
    expect(plain.get("edits")).toBeNull();
    const form = buildUpload({ file, accountId: "c-1", mapping: null, sign: "charges_positive", edits: new Map([[3, { installments: 12 }]]) });
    expect(form.get("sign")).toBe("charges_positive");
    expect(JSON.parse(String(form.get("edits")))).toEqual({ "3": { installments: 12 } });
    expect(uploadFingerprint({ file, accountId: "c-1", mapping: null, sign: "charges_positive" })).not.toEqual(uploadFingerprint({ file, accountId: "c-1", mapping: null }));
  });
  it("el mapeo lleva la columna de cuotas y la propuesta la reconoce", () => {
    const form = initialMapping(["Fecha", "Valor", "Cuotas"], null, { date: "Fecha", amount: "Valor", installments: "cuotas" });
    expect(form.installments).toBe("Cuotas");
    expect(mappingToApi({ ...form, dateFormat: "%d/%m/%Y" })?.installments).toBe("Cuotas");
  });
  it("lo que impide importar una fila se reconoce por su código", () => {
    expect(isBlocked({ issue: "payment_source_required" })).toBe(true);
    expect(isBlocked({ issue: "" })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { ImportPreviewRow } from "@/api/models";
import { buildUpload, editsBody, kindsForAmount, isBlocked, withEdit, effectiveAction, fileProblem, initialMapping, mappingProblems, mappingToApi, overridesBody, tally, previewEntries, filterEntries, storedAs, formatFor, toggleRow, uploadFingerprint, EMPTY_MAPPING, MAX_UPLOAD_BYTES } from "./logic";

const row = (number: number, match: ImportPreviewRow["match"], action: ImportPreviewRow["action"]): ImportPreviewRow => ({ number, date: "2026-11-02", amount: "-182300.00", description: "ÉXITO", reference: "", match, candidate_id: null, action, counterparty: null, identifier: null, identifier_hint: null, recurrence: null, category_id: null, kind: null, installments: null, period_start: null, period_end: null, refund_of_id: null, refund_of_row: null, counter_account: null, issue: "", validity: "valid", reasons: [] });
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

describe("vista previa: validez por fila", () => {
  const warn = { ...row(4, "possible_duplicate", "skip"), validity: "warning" as const, reasons: ["possible_duplicate"] };
  const preview = { rows: [row(2, "new", "import"), row(3, "new", "import"), warn], errors: [{ row: 9, code: "invalid_date" }, { row: 3, code: "x" }] };
  it("junta filas legibles e ilegibles en el orden del archivo", () => {
    expect(previewEntries(preview).map((e) => `${e.kind}:${e.number}`)).toEqual(["row:2", "row:3", "error:3", "row:4", "error:9"]);
  });
  it("filtra por error, por aviso y por cruce", () => {
    const all = previewEntries(preview);
    expect(filterEntries(all, "all")).toHaveLength(5);
    expect(filterEntries(all, "error").map((e) => e.number)).toEqual([3, 9]);
    expect(filterEntries(all, "warning").map((e) => e.number)).toEqual([4]);
    expect(filterEntries(all, "new").map((e) => e.number)).toEqual([2, 3]);
  });
  it("dice cómo se guardará: ingreso, egreso, confirmar, enlazar u omitir (y respeta lo que eliges)", () => {
    const none = new Map<number, "import" | "skip">();
    expect(storedAs(row(2, "new", "import"), none)).toBe("expense");
    expect(storedAs({ ...row(2, "new", "import"), amount: "5200000.00" }, none)).toBe("income");
    expect(storedAs(row(3, "matches_pending", "confirm"), none)).toBe("confirm");
    expect(storedAs(row(3, "matches_confirmed", "link"), none)).toBe("link");
    expect(storedAs(row(4, "possible_duplicate", "skip"), new Map([[4, "import"]]))).toBe("expense");
    expect(storedAs(row(2, "new", "import"), new Map([[2, "skip"]]))).toBe("skip");
  });
  it("elige el formato del destino", () => {
    expect(formatFor([{ kind: "account" }, { kind: "card" }] as never, "card")?.kind).toBe("card");
    expect(formatFor([], "card")).toBeNull();
  });
});

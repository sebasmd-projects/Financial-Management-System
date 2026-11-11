// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImportAction, ImportMatch, ImportPreview, ImportPreviewRow } from "@/api/models";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { ImportScreen } from "./import-screen";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/es/finanzas/cuentas/importar",
}));

const page = (results: unknown[]) => ({ status: 200, json: { count: results.length, page: 1, page_size: 100, results } });
const ACCOUNT = { id: "a-1", type: "asset", kind: "savings", system_key: "", name: "Ahorros Bancolombia", last4: null, institution: null, parent_id: null, currency: "COP", gmf_exempt: false, liquid: true, enforce_funds: false, status: "active", posted_balance: "3420000.00", projected_balance: "3420000.00" };
const HEADERS = ["Fecha", "Descripción", "Valor", "Saldo"];
const row = (number: number, match: ImportMatch, action: ImportAction, amount = "-182300.00", description = "ÉXITO CHAPINERO"): ImportPreviewRow => ({ number, date: "2026-11-02", amount, description, reference: "", match, candidate_id: null, action, counterparty: null, category_id: null });

const NEEDS_MAPPING: ImportPreview = { kind: "csv", needs_mapping: true, headers: HEADERS, sample: [["02/11/2026", "ÉXITO", "-182.300,00", "1.000,00"]], mapping: null, mapping_source: "none", suggested_mapping: { date: "Fecha", description: "Descripción", amount: "Valor", balance: "Saldo", decimal_sep: ",", thousands_sep: "." }, rows: [], errors: [], notes: [], meta: {}, counts: {} };
const REVIEW: ImportPreview = {
  kind: "xlsx",
  needs_mapping: false,
  headers: HEADERS,
  sample: [],
  mapping: { date: "Fecha", description: "Descripción", amount: "Valor", debit: "", credit: "", reference: "", balance: "", date_format: "%d/%m/%Y", decimal_sep: ",", thousands_sep: ".", header_row: 0 },
  mapping_source: "provided",
  suggested_mapping: null,
  rows: [row(2, "new", "import"), row(3, "matches_pending", "confirm", "-45000.00", "NETFLIX"), row(4, "possible_duplicate", "skip", "-10000.00", "TIENDA"), row(5, "duplicate", "skip", "-5000.00", "=HYPERLINK(\"http://x\")")],
  errors: [{ row: 9, code: "invalid_date" }],
  notes: ["formulas_ignored"],
  meta: {},
  counts: { new: 1, matches_pending: 1, possible_duplicate: 1, duplicate: 1 },
};
const BATCH = { id: "b-1", account_id: "a-1", kind: "xlsx", filename: "extracto.xlsx", status: "committed", rows_total: 4, created_count: 1, confirmed_count: 1, skipped_count: 2, created_at: "2026-11-11T15:00:00Z", undone_at: null };

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
});

const base = {
  "GET /api/fms/v1/accounts?page_size=100": page([ACCOUNT]),
  "GET /api/fms/v1/imports?page_size=20&page=1": page([]),
};

function chooseFile(host: HTMLElement, file: File) {
  const input = host.querySelector<HTMLInputElement>("input[type=file]")!;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  act(() => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
const csv = () => new File(["Fecha;Descripción;Valor;Saldo\n"], "extracto.csv", { type: "text/csv", lastModified: 1760000000000 });

describe("importar extracto", () => {
  it("rechaza en el cliente lo que no es CSV, Excel ni OFX, sin subir nada", async () => {
    view = await mountScreen(<ImportScreen />, base);
    chooseFile(view.host, new File(["x"], "extracto.pdf"));
    await wait();
    expect(view.visible()).toContain("No reconocemos el formato");
    expect(byText<HTMLButtonElement>(view.host, "button", "Analizar archivo").disabled).toBe(true);
    expect(view.mock.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("primera vez: pide el mapeo con la propuesta, exige el formato de fecha y reenvía el mapeo en el multipart", async () => {
    let call = 0;
    view = await mountScreen(<ImportScreen />, { ...base, "POST /api/fms/v1/imports/preview": () => ({ status: 200, json: call++ === 0 ? NEEDS_MAPPING : REVIEW }) });
    chooseFile(view.host, csv());
    await wait();
    click(byText(view.host, "button", "Analizar archivo"));
    await wait();
    expect(view.visible()).toContain("¿Qué columna es cada cosa?");
    expect(view.visible()).toContain("-182.300,00");
    const selects = [...view.host.querySelectorAll<HTMLSelectElement>("select")];
    expect(selects.find((s) => s.value === "Valor")).toBeTruthy(); // la propuesta rellenó el valor
    click(byText(view.host, "button", "Aplicar y revisar"));
    await wait();
    expect(view.visible()).toContain("Elige el formato de la fecha.");
    expect(view.mock.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    const format = selects.find((s) => [...s.options].some((o) => o.value === "%d/%m/%Y"))!;
    typeInto(format, "%d/%m/%Y");
    click(byText(view.host, "button", "Aplicar y revisar"));
    await wait();
    const second = view.mock.calls.filter((c) => c.method === "POST")[1];
    const form = second.body as FormData;
    expect(form.get("account_id")).toBe("a-1");
    expect((form.get("file") as File).name).toBe("extracto.csv");
    expect(JSON.parse(String(form.get("mapping")))).toMatchObject({ date: "Fecha", amount: "Valor", date_format: "%d/%m/%Y", decimal_sep: "," });
    expect(form.get("save_mapping")).toBeNull(); // el preview no guarda nada
    expect(view.visible()).toContain("Revisa antes de guardar");
  });

  it("muestra claro lo ignorado: fórmulas y filas ilegibles (sin su contenido)", async () => {
    view = await mountScreen(<ImportScreen />, { ...base, "POST /api/fms/v1/imports/preview": { status: 200, json: REVIEW } });
    chooseFile(view.host, csv());
    await wait();
    click(byText(view.host, "button", "Analizar archivo"));
    await wait();
    expect(view.host.querySelector("[data-testid=formulas-ignored]")!.textContent).toContain("Se ignoraron");
    expect(view.host.querySelector("[data-testid=rows-ignored]")!.textContent).toContain("1 filas no se pudieron leer");
    expect(view.visible()).toContain("Fila 9: fecha no válida");
  });

  it("revisión: nuevas incluidas, pendiente que se confirma, posible duplicado omitido y duplicado exacto bloqueado; el texto hostil es solo texto", async () => {
    view = await mountScreen(<ImportScreen />, { ...base, "POST /api/fms/v1/imports/preview": { status: 200, json: REVIEW } });
    chooseFile(view.host, csv());
    await wait();
    click(byText(view.host, "button", "Analizar archivo"));
    await wait();
    const summary = view.host.querySelector("[data-testid=import-summary]")!.textContent!;
    expect(summary).toContain("Se crean 1 movimientos");
    expect(summary).toContain("Se confirman 1 pendientes");
    expect(summary).toContain("2 no se importan");
    const boxes = [...view.host.querySelectorAll<HTMLInputElement>("li.imp-row input[type=checkbox]")];
    expect(boxes.map((b) => b.checked)).toEqual([true, true, false, false]);
    expect(boxes[3].disabled).toBe(true);
    expect(view.visible()).toContain('=HYPERLINK("http://x")');
    expect(view.host.querySelector("a[href^='http']")).toBeNull();
  });

  it("confirmar reenvía el archivo con Idempotency-Key y solo las decisiones que cambian; muestra el resumen y deshace con confirmación", async () => {
    view = await mountScreen(<ImportScreen />, {
      ...base,
      "POST /api/fms/v1/imports/preview": { status: 200, json: REVIEW },
      "POST /api/fms/v1/imports": { status: 201, json: BATCH },
      "POST /api/fms/v1/imports/b-1/undo": { status: 200, json: { ...BATCH, status: "undone", undone_at: "2026-11-11T15:05:00Z" } },
    });
    chooseFile(view.host, csv());
    await wait();
    click(byText(view.host, "button", "Analizar archivo"));
    await wait();
    const boxes = () => [...document.querySelectorAll<HTMLInputElement>("li.imp-row input[type=checkbox]")];
    click(boxes()[1]); // omitir el pendiente
    click(boxes()[2]); // importar el posible duplicado
    await wait();
    click(byText(view.host, "button", "Importar"));
    await wait();
    const commit = view.mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/api/fms/v1/imports"))!;
    expect(commit.headers.get("Idempotency-Key")).toBeTruthy();
    const form = commit.body as FormData;
    expect(JSON.parse(String(form.get("overrides")))).toEqual({ "3": "skip", "4": "import" });
    expect(form.get("save_mapping")).toBe("true");
    expect(JSON.parse(String(form.get("mapping")))).toMatchObject({ date: "Fecha" });
    expect(view.host.querySelector("[data-testid=import-result]")!.textContent).toContain("1 movimientos creados");
    click(byText(view.host, "button", "Deshacer importación"));
    await wait();
    expect(view.visible()).toContain("¿Deshacer esta importación?");
    click(byText(view.host, "dialog button", "Deshacer importación"));
    await wait();
    expect(view.mock.calls.some((c) => c.url.endsWith("/imports/b-1/undo"))).toBe(true);
    expect(view.visible()).toContain("Importación deshecha.");
  });

  it("con el mapeo guardado del banco no pregunta nada, y reimportar el mismo archivo informa que no creó nada", async () => {
    const saved: ImportPreview = { ...REVIEW, mapping_source: "saved", errors: [], notes: [], rows: [row(2, "duplicate", "skip"), row(3, "duplicate", "skip")], counts: { duplicate: 2 } };
    view = await mountScreen(<ImportScreen />, {
      ...base,
      "POST /api/fms/v1/imports/preview": { status: 200, json: saved },
      "POST /api/fms/v1/imports": { status: 200, json: { ...BATCH, created_count: 0, confirmed_count: 0, skipped_count: 2 } },
    });
    chooseFile(view.host, csv());
    await wait();
    click(byText(view.host, "button", "Analizar archivo"));
    await wait();
    expect(view.host.querySelector("[data-testid=mapping-source]")!.textContent).toContain("mapeo guardado");
    expect(view.visible()).not.toContain("¿Qué columna es cada cosa?");
    expect(byText<HTMLButtonElement>(view.host, "button", "Importar").disabled).toBe(true); // nada que importar
  });

  it("errores del servidor con texto propio (sin el contenido del archivo)", async () => {
    view = await mountScreen(<ImportScreen />, { ...base, "POST /api/fms/v1/imports/preview": { status: 422, json: { code: "macros_not_allowed" } } });
    chooseFile(view.host, csv());
    await wait();
    click(byText(view.host, "button", "Analizar archivo"));
    await wait();
    expect(view.visible()).toContain("Los archivos con macros no se aceptan");
  });

  it("en inglés", async () => {
    view = await mountScreen(<ImportScreen />, base, "en");
    expect(view.visible()).toContain("Statement file");
  });
});

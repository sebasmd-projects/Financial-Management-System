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
const row = (number: number, match: ImportMatch, action: ImportAction, amount = "-182300.00", description = "ÉXITO CHAPINERO"): ImportPreviewRow => ({ number, date: "2026-11-02", amount, description, reference: "", match, candidate_id: null, action, counterparty: null, category_id: null, kind: null, installments: null, period_start: null, period_end: null, refund_of_id: null, refund_of_row: null, counter_account: null, issue: "" });

const NEEDS_MAPPING: ImportPreview = { kind: "csv", needs_mapping: true, headers: HEADERS, sample: [["02/11/2026", "ÉXITO", "-182.300,00", "1.000,00"]], mapping: null, mapping_source: "none", suggested_mapping: { date: "Fecha", description: "Descripción", amount: "Valor", balance: "Saldo", decimal_sep: ",", thousands_sep: "." }, rows: [], errors: [], notes: [], meta: {}, counts: {}, target: "account", card: null, sign_detected: null, sign_used: null, kind_counts: {} };
const REVIEW: ImportPreview = {
  kind: "xlsx",
  needs_mapping: false,
  headers: HEADERS,
  sample: [],
  mapping: { date: "Fecha", description: "Descripción", amount: "Valor", debit: "", credit: "", reference: "", balance: "", date_format: "%d/%m/%Y", decimal_sep: ",", thousands_sep: ".", header_row: 0, installments: "" },
  mapping_source: "provided",
  suggested_mapping: null,
  rows: [row(2, "new", "import"), row(3, "matches_pending", "confirm", "-45000.00", "NETFLIX"), row(4, "possible_duplicate", "skip", "-10000.00", "TIENDA"), row(5, "duplicate", "skip", "-5000.00", "=HYPERLINK(\"http://x\")")],
  errors: [{ row: 9, code: "invalid_date" }],
  notes: ["formulas_ignored"],
  meta: {},
  counts: { new: 1, matches_pending: 1, possible_duplicate: 1, duplicate: 1 },
  target: "account",
  card: null,
  sign_detected: null,
  sign_used: null,
  kind_counts: {},
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
  "GET /api/fms/v1/import-mappings?page_size=100": page([]),
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

  it("lista los mapeos guardados y permite olvidar uno", async () => {
    view = await mountScreen(<ImportScreen />, {
      ...base,
      "GET /api/fms/v1/import-mappings?page_size=100": page([{ id: "m-1", kind: "csv", name: "Bancolombia", mapping: REVIEW.mapping, last_used_at: "2026-11-10T12:00:00Z" }]),
      "DELETE /api/fms/v1/import-mappings/m-1": { status: 204 },
    });
    expect(view.visible()).toContain("Bancolombia");
    expect(view.visible()).toContain("Último uso: 10/11/2026");
    click(byText(view.host, "button", "Olvidar"));
    await wait();
    expect(view.mock.calls.some((c) => c.method === "DELETE" && c.url.endsWith("/import-mappings/m-1"))).toBe(true);
  });

  it("tarjeta: muestra clase, cuotas y extracto de cada fila, pide la cuenta del pago y recalcula la vista previa con lo que cambias", async () => {
    const CARD = { ...ACCOUNT, id: "c-1", type: "liability", kind: "credit_card", name: "Visa Sintética" };
    const cardRow = (number: number, patch: Partial<ImportPreviewRow>): ImportPreviewRow => ({ ...row(number, "new", "import"), kind: "purchase", installments: 1, period_start: "2026-10-31", period_end: "2026-11-30", ...patch });
    const base2: ImportPreview = {
      ...REVIEW,
      kind: "csv",
      target: "card",
      card: { cut_day: 30, pay_day: 16 },
      sign_detected: "charges_negative",
      sign_used: "charges_negative",
      kind_counts: { purchase: 1, payment: 1 },
      rows: [cardRow(2, {}), cardRow(3, { amount: "400000.00", description: "ABONO", kind: "payment", action: "skip", issue: "payment_source_required" })],
      errors: [],
      notes: [],
      counts: { new: 2 },
    };
    let last: FormData | null = null;
    view = await mountScreen(<ImportScreen />, {
      ...base,
      "GET /api/fms/v1/accounts?page_size=100": page([ACCOUNT, CARD]),
      "POST /api/fms/v1/imports/preview": () => {
        last = view!.mock.calls.filter((c) => c.method === "POST" && c.url.endsWith("/imports/preview")).at(-1)!.body as FormData;
        const sent: FormData = last;
        const edits = sent.get("edits") ? (JSON.parse(String(sent.get("edits"))) as Record<string, { installments?: number; counter_account?: string }>) : {};
        const rows = base2.rows.map((r) => {
          const e = edits[String(r.number)];
          if (!e) return r;
          return { ...r, installments: e.installments ?? r.installments, counter_account: e.counter_account ?? r.counter_account, issue: e.counter_account ? "" : r.issue, action: e.counter_account ? ("import" as const) : r.action };
        });
        return { status: 200, json: { ...base2, rows } };
      },
    });
    const picker = [...view.host.querySelectorAll<HTMLSelectElement>("select")][0];
    typeInto(picker, "c-1");
    chooseFile(view.host, csv());
    await wait();
    click(byText(view.host, "button", "Analizar archivo"));
    await wait();
    expect(view.host.querySelector("[data-testid=kind-summary]")!.textContent).toContain("Compra: 1");
    expect(view.host.querySelector("[data-testid=sign-detected]")!.textContent).toContain("Compras en negativo");
    expect(view.visible()).toContain("Extracto: 31/10/2026 a 30/11/2026");
    // El pago sin cuenta: no se puede incluir, dice por qué y pide la cuenta.
    expect(view.host.querySelector("[data-testid=issue-3]")!.textContent).toContain("Falta la cuenta que pagó");
    const boxes = [...view.host.querySelectorAll<HTMLInputElement>("li.imp-row input[type=checkbox]")];
    expect(boxes.map((b) => b.disabled)).toEqual([false, true]);
    // Cambiar las cuotas de la compra recalcula con `edits`.
    const installments = [...view.host.querySelectorAll<HTMLSelectElement>("select")].find((s) => s.getAttribute("id") && s.closest("[data-testid=card-row-2]") !== null && [...s.options].some((o) => o.value === "48"))!;
    typeInto(installments, "6");
    await wait();
    expect(JSON.parse(String(last!.get("edits")))).toEqual({ "2": { installments: 6 } });
    expect(view.visible()).toContain("6 cuotas");
    // Elegir «pago desde una cuenta que no llevo» deja el pago listo.
    const paidFrom = [...view.host.querySelectorAll<HTMLSelectElement>("[data-testid=card-row-3] select")].find((s) => [...s.options].some((o) => o.value === "unregistered"))!;
    expect([...paidFrom.options].some((o) => o.value === "c-1")).toBe(false); // una tarjeta no paga a otra tarjeta aquí
    typeInto(paidFrom, "unregistered");
    await wait();
    expect(view.host.querySelector("[data-testid=issue-3]")).toBeNull();
    expect([...view.host.querySelectorAll<HTMLInputElement>("li.imp-row input[type=checkbox]")].map((b) => b.disabled)).toEqual([false, false]);
    // Forzar el signo recalcula y se reenvía al confirmar junto con lo editado.
    click(byText(view.host, "label", "Compras en positivo").querySelector("input")!);
    await wait();
    expect(last!.get("sign")).toBe("charges_positive");
    expect(JSON.parse(String(last!.get("edits")))).toEqual({ "2": { installments: 6 }, "3": { counter_account: "unregistered" } });
  });

  it("en inglés", async () => {
    view = await mountScreen(<ImportScreen />, base, "en");
    expect(view.visible()).toContain("Statement file");
  });
});

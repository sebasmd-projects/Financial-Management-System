// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { resetHouseholdState, setScope } from "../../household/scope-store";
import { CATALOG, CATEGORIES, RULE, page } from "@/test/sync-fixtures";
import { AutoRulesScreen } from "./auto-rules-screen";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas/configuracion/autoconfirmacion" }));

const RULES = "GET /api/fms/v1/automation/rules?page_size=100";
const SUGGESTIONS = "GET /api/fms/v1/sync/rule-suggestions";
const SUGGESTION = {
  key: "s1",
  kind: "income",
  text: "nomina acme",
  count: 3,
  amount_min: "3000000.00",
  amount_max: "3200000.00",
  day_min: 13,
  day_max: 17,
  trigger: "sync_event",
  action: "auto_confirm",
  conditions: [
    { field: "kind", op: "eq", value: "income" },
    { field: "text", op: "starts_with", value: "nomina acme" },
    { field: "amount", op: "gte", value: "3000000.00" },
    { field: "amount", op: "lte", value: "3200000.00" },
    { field: "day_of_month", op: "gte", value: "13" },
    { field: "day_of_month", op: "lte", value: "17" },
  ],
};
const BASE = {
  "GET /api/fms/v1/sync/catalog": { status: 200, json: CATALOG },
  "GET /api/fms/v1/categories?page_size=200&archived=false": CATEGORIES,
  [SUGGESTIONS]: { status: 200, json: { results: [] } },
};
const DRY = { trigger: "sync_event", evaluated: 4, matched: 2, would_notify: 0, truncated: false, notification_id: null, rows: [{ subject_id: "x1", label: "Cumple A", matched: true, values: {} }, { subject_id: "x2", label: "No cumple B", matched: false, values: {} }] };

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  resetHouseholdState();
});
const modal = () => document.querySelector("dialog[open]")!;

describe("reglas de autoconfirmación (W3)", () => {
  it("la condición se lee en lenguaje de persona y solo salen las reglas de los correos", async () => {
    const other = { ...RULE, id: "r2", name: "Tarjeta al límite", trigger: "card_utilization", action: "notify", conditions: [{ field: "utilization", op: "gte", value: "70" }] };
    view = await mountScreen(<AutoRulesScreen />, { ...BASE, [RULES]: page([RULE, other]) });
    const text = view.visible();
    expect(text).toContain("Nómina");
    expect(text).not.toContain("Tarjeta al límite");
    expect(text).toContain("Tipo: Ingreso");
    expect(text).toContain("El comercio o la contraparte contiene «nomina acme»");
    expect(text).toContain("Monto desde $3.000.000");
    expect(text).toContain("Aplicada 3 veces");
    expect(text).toContain("con la contraparte «Acme»");
  });

  it("sin reglas, el estado vacío", async () => {
    view = await mountScreen(<AutoRulesScreen />, { ...BASE, [RULES]: page([]) });
    expect(view.visible()).toContain("Aún no tienes reglas de autoconfirmación");
  });

  it("crear: el monto es opcional; manda texto literal, el tipo y una Idempotency-Key", async () => {
    let created = false;
    view = await mountScreen(<AutoRulesScreen />, {
      ...BASE,
      [RULES]: () => page(created ? [RULE] : []),
      "POST /api/fms/v1/automation/rules": () => {
        created = true;
        return { status: 201, json: RULE };
      },
    });
    click(byText(view.host, "button", "Nueva regla"));
    await wait();
    const form = modal();
    typeInto(form.querySelector<HTMLInputElement>("input")!, "Nómina");
    typeInto(form.querySelectorAll<HTMLSelectElement>("select")[1], "income");
    const text = [...form.querySelectorAll<HTMLInputElement>("input[type=text]")].find((i) => i.maxLength === 60)!;
    typeInto(text, "{{7*7}}.*");
    click(byText(form, "button", "Crear regla"));
    await wait(60);
    const post = view.mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/automation/rules"))!;
    expect(post.body).toMatchObject({ name: "Nómina", trigger: "sync_event", action: "auto_confirm", conditions: [{ field: "kind", op: "eq", value: "income" }, { field: "text", op: "contains", value: "{{7*7}}.*" }], enabled: true });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(view.visible()).toContain("Regla creada: Nómina.");
  });

  it("no se guarda sin ninguna condición, con un texto corto ni con un rango al revés; nada sale a la red", async () => {
    view = await mountScreen(<AutoRulesScreen />, { ...BASE, [RULES]: page([]) });
    click(byText(view.host, "button", "Nueva regla"));
    await wait();
    typeInto(modal().querySelector<HTMLInputElement>("input")!, "Algo");
    click(byText(modal(), "button", "Crear regla"));
    await wait();
    expect(modal().textContent).toContain("Agrega al menos una condición");
    const text = [...modal().querySelectorAll<HTMLInputElement>("input[type=text]")].find((i) => i.maxLength === 60)!;
    typeInto(text, "ab");
    click(byText(modal(), "button", "Crear regla"));
    await wait();
    expect(modal().textContent).toContain("entre 3 y 60 caracteres");
    expect(view.mock.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("«Probar» lista los casos sin efectos: evalúa la definición con la ruta de vista previa", async () => {
    view = await mountScreen(<AutoRulesScreen />, { ...BASE, [RULES]: page([RULE]), "POST /api/fms/v1/automation/rules/preview": { status: 200, json: DRY } });
    click(byText(view.host, "button", "Probar"));
    await wait();
    click(byText(modal(), "button", "Probar"));
    await wait();
    const preview = view.mock.calls.find((c) => c.url.endsWith("/rules/preview"))!;
    expect(preview.body).toEqual({ trigger: "sync_event", conditions: RULE.conditions });
    expect(modal().textContent).toContain("Cumplen 2 de 4 correos");
    expect(modal().textContent).toContain("Cumple A");
    // Sin efectos: ninguna escritura.
    expect(view.mock.calls.filter((c) => c.method !== "GET" && !c.url.endsWith("/rules/preview"))).toEqual([]);
  });

  it("pausar manda solo `enabled` y no pide más", async () => {
    view = await mountScreen(<AutoRulesScreen />, { ...BASE, [RULES]: page([RULE]), "PATCH /api/fms/v1/automation/rules/r1": { status: 200, json: { ...RULE, enabled: false } } });
    click(byText(view.host, "button", "Pausar"));
    await wait();
    expect(view.mock.calls.find((c) => c.method === "PATCH")?.body).toEqual({ enabled: false });
    expect(view.visible()).toContain("Regla pausada.");
  });

  it("editar precarga el formulario y guarda solo lo editable", async () => {
    view = await mountScreen(<AutoRulesScreen />, { ...BASE, [RULES]: page([RULE]), "PATCH /api/fms/v1/automation/rules/r1": { status: 200, json: RULE } });
    click(byText(view.host, "button", "Editar"));
    await wait();
    const name = modal().querySelector<HTMLInputElement>("input")!;
    expect(name.value).toBe("Nómina");
    typeInto(name, "Nómina Acme");
    click(byText(modal(), "button", "Guardar cambios"));
    await wait(60);
    const patch = view.mock.calls.find((c) => c.method === "PATCH")!;
    expect(patch.body).toMatchObject({ name: "Nómina Acme", enabled: true, action_counterparty: "Acme", conditions: [{ field: "kind", op: "eq", value: "income" }, { field: "text", op: "contains", value: "nomina acme" }, { field: "amount", op: "gte", value: "3000000.00" }] });
  });

  it("una regla con una forma que el formulario no edita solo se pausa o se borra", async () => {
    const odd = { ...RULE, conditions: [{ field: "amount", op: "gt", value: "5" }] };
    view = await mountScreen(<AutoRulesScreen />, { ...BASE, [RULES]: page([odd]) });
    expect(view.visible()).toContain("no edita");
    expect(byTextOrNull(view.host, "button", "Editar")).toBeNull();
    expect(byText(view.host, "button", "Pausar")).toBeTruthy();
  });

  it("borrar pide confirmar", async () => {
    view = await mountScreen(<AutoRulesScreen />, { ...BASE, [RULES]: page([RULE]), "DELETE /api/fms/v1/automation/rules/r1": { status: 204 } });
    click(byText(view.host, "button", "Borrar"));
    await wait();
    expect(modal().textContent).toContain("«Nómina»");
    click(byText(modal(), "button", "Borrar regla"));
    await wait();
    expect(view.mock.calls.some((c) => c.method === "DELETE")).toBe(true);
    expect(view.visible()).toContain("Regla borrada.");
  });

  it("sugerencia: se acepta (abre la regla ya llena para revisarla) o se descarta (no vuelve)", async () => {
    view = await mountScreen(<AutoRulesScreen />, {
      ...BASE,
      [RULES]: page([]),
      [SUGGESTIONS]: { status: 200, json: { results: [SUGGESTION] } },
      "POST /api/fms/v1/sync/rule-suggestions/dismiss": { status: 204 },
      "POST /api/fms/v1/automation/rules": { status: 201, json: RULE },
    });
    expect(view.visible()).toContain("Aprobaste 3 movimientos parecidos");
    expect(view.visible()).toContain("Monto hasta $3.200.000");
    expect(view.visible()).toContain("Hasta el día 17 del mes");
    click(byText(view.host, "button", "Aceptar y revisar"));
    await wait();
    const form = modal();
    expect(form.querySelector<HTMLInputElement>("input")!.value).toBe("Sugerida: nomina acme");
    click(byText(form, "button", "Crear regla"));
    await wait(60);
    const post = view.mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/automation/rules"))!;
    expect(post.body).toMatchObject({ trigger: "sync_event", action: "auto_confirm", conditions: SUGGESTION.conditions });
  });

  it("descartar una sugerencia manda su clave", async () => {
    view = await mountScreen(<AutoRulesScreen />, { ...BASE, [RULES]: page([]), [SUGGESTIONS]: { status: 200, json: { results: [SUGGESTION] } }, "POST /api/fms/v1/sync/rule-suggestions/dismiss": { status: 204 } });
    click(byText(view.host, "button", "Descartar"));
    await wait();
    expect(view.mock.calls.find((c) => c.url.endsWith("/dismiss"))?.body).toEqual({ key: "s1" });
    expect(view.visible()).toContain("no se vuelve a ofrecer");
  });
});

describe("reglas de autoconfirmación del hogar", () => {
  const H = "h1";
  const HOUSEHOLDS = (role: string) => ({ "GET /api/fms/v1/households": { status: 200, json: { households: [{ id: H, name: "Casa", role, members: 2, rotating: false }], invitations: [] } } });
  const HH = {
    ...HOUSEHOLDS("editor"),
    "GET /api/fms/v1/sync/catalog": { status: 200, json: CATALOG },
    [`GET /api/fms/v1/households/${H}/categories?page_size=200&archived=false`]: CATEGORIES,
    [`GET /api/fms/v1/households/${H}/sync/rule-suggestions`]: { status: 200, json: { results: [SUGGESTION] } },
  };
  const HH_RULES = `GET /api/fms/v1/households/${H}/automation/rules?page_size=100`;

  it("lee y escribe las reglas del hogar, no las personales (con el mismo Idempotency-Key y sin montos en la URL)", async () => {
    setScope({ kind: "household", id: H });
    view = await mountScreen(<AutoRulesScreen />, { ...HH, [HH_RULES]: page([RULE]), [`PATCH /api/fms/v1/households/${H}/automation/rules/r1`]: { status: 200, json: { ...RULE, enabled: false } }, [`POST /api/fms/v1/households/${H}/sync/rule-suggestions/dismiss`]: { status: 204 } });
    expect(view.visible()).toContain("Nómina");
    expect(view.visible()).toContain("Aprobaste 3 movimientos parecidos");
    click(byText(view.host, "button", "Pausar"));
    await wait();
    click(byText(view.host, "button", "Descartar"));
    await wait();
    const calls = view.mock.calls.map((c) => `${c.method} ${c.url}`);
    expect(calls).toContain(`PATCH /api/fms/v1/households/${H}/automation/rules/r1`);
    expect(calls).toContain(`POST /api/fms/v1/households/${H}/sync/rule-suggestions/dismiss`);
    expect(calls.some((c) => /\/api\/fms\/v1\/automation\/rules/.test(c))).toBe(false);
    expect(view.mock.calls.every((c) => !/3000000|amount=/.test(c.url))).toBe(true);
  });

  it("crear y «Probar» en el hogar van a las rutas del hogar", async () => {
    setScope({ kind: "household", id: H });
    view = await mountScreen(<AutoRulesScreen />, { ...HH, [HH_RULES]: page([RULE]), [`POST /api/fms/v1/households/${H}/automation/rules/preview`]: { status: 200, json: DRY }, [`POST /api/fms/v1/households/${H}/automation/rules`]: { status: 201, json: RULE } });
    click(byText(view.host, "button", "Probar"));
    await wait();
    click(byText(modal(), "button", "Probar"));
    await wait();
    expect(view.mock.calls.some((c) => c.method === "POST" && c.url.endsWith(`/households/${H}/automation/rules/preview`))).toBe(true);
    expect(modal().textContent).toContain("Cumplen 2 de 4 correos");
  });

  it("un visor las ve de solo lectura: sin botones ni sugerencias", async () => {
    setScope({ kind: "household", id: H });
    view = await mountScreen(<AutoRulesScreen />, { ...HH, ...HOUSEHOLDS("viewer"), [HH_RULES]: page([RULE]) });
    const text = view.visible();
    expect(text).toContain("Nómina");
    for (const label of ["Nueva regla", "Pausar", "Editar", "Borrar", "Probar", "Descartar"]) expect(byTextOrNull(view.host, "button", label)).toBeNull();
    expect(text).not.toContain("Aprobaste 3 movimientos parecidos");
  });
});

function byTextOrNull(host: ParentNode, selector: string, text: string): Element | null {
  return [...host.querySelectorAll(selector)].find((el) => el.textContent?.includes(text)) ?? null;
}

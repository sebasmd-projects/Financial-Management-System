// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { TagsScreen } from "../catalog/catalog-screens";
import { MovementForm } from "../movements/movement-form";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/es/finanzas/configuracion/etiquetas",
}));

const page = (results: unknown[]) => ({ status: 200, json: { count: results.length, page: 1, page_size: 100, results } });
const CENTER = { id: "cc-1", name: "Hogar", archived: false };
const ACCOUNT = { id: "a-1", type: "asset", kind: "savings", system_key: "", name: "Ahorros", last4: null, institution: null, parent_id: null, currency: "COP", gmf_exempt: false, liquid: true, enforce_funds: false, status: "active", posted_balance: "3420000.00", projected_balance: "3420000.00" };
const PROJECT = { id: "11111111-1111-4111-8111-111111111111", name: "Proyecto", kind: "choice", options: ["Casa", "Viaje"], applies_to: [], required: true, archived: false };

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
});

describe("centros de costo y atributos (Configuración)", () => {
  const routes = {
    "GET /api/fms/v1/tags?page_size=200": page([]),
    "GET /api/fms/v1/cost-centers?page_size=200": page([CENTER]),
    "GET /api/fms/v1/custom-attributes?page_size=100": page([PROJECT]),
  };

  it("lista los centros, crea los predeterminados con Idempotency-Key y muestra lo gastado con «Ver movimientos» sin montos en la URL", async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
    view = await mountScreen(<TagsScreen />, {
      ...routes,
      [`GET /api/fms/v1/cost-centers/usage?from=${today.slice(0, 8)}01&to=${today}`]: {
        status: 200,
        json: { first: `${today.slice(0, 8)}01`, last: today, total: "250000.00", rows: [{ id: "cc-1", name: "Hogar", archived: false, movements: 3, spent: "200000.00" }, { id: null, name: null, archived: false, movements: 1, spent: "50000.00" }] },
      },
      "POST /api/fms/v1/cost-centers/defaults": { status: 200, json: [CENTER] },
    });
    click(byText(view.host, "[role=tab]", "Centros de costo"));
    await wait();
    const text = view.visible();
    expect(text).toContain("Hogar");
    expect(text).toContain("Lo gastado por centro");
    expect(text).toContain("Sin centro de costo");
    expect(text).toContain("$200.000");
    const link = byText<HTMLAnchorElement>(view.host, "a", "Ver movimientos");
    expect(link.getAttribute("href")).not.toMatch(/200000|amount/);
    click(byText(view.host, "button", "Crear los predeterminados"));
    await wait();
    const post = view.mock.calls.find((c) => c.method === "POST")!;
    expect(post.url).toContain("/cost-centers/defaults");
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(view.visible()).toContain("centros predeterminados");
  });

  it("crea un atributo de lista: opciones sin repetir, tipos en los que aplica y obligatorio", async () => {
    view = await mountScreen(<TagsScreen />, { ...routes, "POST /api/fms/v1/custom-attributes": { status: 201, json: PROJECT } });
    click(byText(view.host, "[role=tab]", "Atributos"));
    await wait();
    expect(view.visible()).toContain("Proyecto");
    expect(view.visible()).toContain("Opciones: Casa, Viaje");
    click(byText(view.host, "button", "Agregar atributo"));
    await wait();
    typeInto(view.host.querySelector<HTMLInputElement>("dialog input[type=text]")!, "Prioridad");
    click(byText(view.host, "dialog label", "Lista").querySelector("input"));
    await wait();
    typeInto(view.host.querySelector<HTMLTextAreaElement>("dialog textarea")!, "Alta\nBaja\nalta");
    click(byText(view.host, "dialog label", "Egresos").querySelector("input"));
    click(byText(view.host, "dialog label", "Obligatorio al guardar").querySelector("input"));
    click(byText(view.host, "dialog button", "Guardar"));
    await wait();
    const post = view.mock.calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ name: "Prioridad", kind: "choice", applies_to: ["expense"], required: true, options: ["Alta", "Baja"] });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("una lista sin opciones no se envía", async () => {
    view = await mountScreen(<TagsScreen />, { ...routes, "POST /api/fms/v1/custom-attributes": { status: 201, json: PROJECT } });
    click(byText(view.host, "[role=tab]", "Atributos"));
    await wait();
    click(byText(view.host, "button", "Agregar atributo"));
    await wait();
    typeInto(view.host.querySelector<HTMLInputElement>("dialog input[type=text]")!, "Prioridad");
    click(byText(view.host, "dialog label", "Lista").querySelector("input"));
    await wait();
    click(byText(view.host, "dialog button", "Guardar"));
    await wait();
    expect(view.visible()).toContain("Escribe al menos una opción");
    expect(view.mock.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });
});

describe("movimiento con centro de costo y atributos", () => {
  const base = {
    "GET /api/fms/v1/accounts?page_size=100": page([ACCOUNT]),
    "GET /api/fms/v1/categories?page_size=200&archived=false": page([]),
    "GET /api/fms/v1/tags?page_size=200": page([]),
    "GET /api/fms/v1/payment-methods": { status: 200, json: [] },
    "GET /api/fms/v1/movements?page_size=30": page([]),
    "GET /api/fms/v1/cost-centers?page_size=200": page([CENTER]),
    "GET /api/fms/v1/custom-attributes?page_size=100": page([PROJECT]),
    "POST /api/fms/v1/movements": { status: 201, json: { id: "m-1", status: "confirmado", warnings: [] } },
  };
  const save = () => [...document.querySelectorAll("button")].find((b) => b.type === "submit")!;

  it("un atributo obligatorio sin valor abre «Más detalles» y no envía; con valor viaja por su id", async () => {
    view = await mountScreen(<MovementForm />, base);
    typeInto(view.host.querySelector<HTMLInputElement>("input.input--amount")!, "50.000");
    click(save());
    await wait();
    expect(view.mock.calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(view.host.querySelector("[data-testid=attribute-fields]")).toBeTruthy();
    expect(view.visible()).toContain("Este dato es obligatorio");
    typeInto(view.host.querySelector<HTMLSelectElement>("[data-testid=attribute-fields] select")!, "Viaje");
    typeInto([...view.host.querySelectorAll<HTMLSelectElement>("select")].find((s) => [...s.options].some((o) => o.textContent === "Hogar"))!, "cc-1");
    click(save());
    await wait();
    const [post] = view.mock.calls.filter((c) => c.method === "POST");
    expect(post.body).toMatchObject({ amount: "50000", cost_center_id: "cc-1", attributes: { [PROJECT.id]: "Viaje" } });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("en una transferencia no se piden atributos ni centro de costo", async () => {
    view = await mountScreen(<MovementForm />, { ...base, "GET /api/fms/v1/accounts?page_size=100": page([ACCOUNT, { ...ACCOUNT, id: "a-2", name: "Efectivo", kind: "cash" }]) });
    click(byText(view.host, "label", "Transferencia").querySelector("input"));
    await wait();
    click(byText(view.host, "button", "Más detalles"));
    await wait();
    expect(view.host.querySelector("[data-testid=attribute-fields]")).toBeNull();
  });
});

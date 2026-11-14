// @vitest-environment happy-dom
import { useState } from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Category } from "@/api/models";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { CategoryCombobox } from "./category-combobox";
import { useAll } from "./hooks";
import { paths } from "@/api/paths";
import { MovementForm } from "./movements/movement-form";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/es/finanzas/movimientos/nuevo",
}));

const cat = (id: string, path: string[], kind: "expense" | "income" = "expense"): Category =>
  ({ id, name: path[path.length - 1], kind, parent_id: null, path, account_id: "x", default_nature: "", default_classification: "", archived: false }) as Category;
const page = (results: unknown[]) => ({ status: 200, json: { count: results.length, page: 1, page_size: 200, results } });
const ACCOUNT = { id: "a-1", type: "asset", kind: "savings", system_key: "", name: "Ahorros", last4: null, institution: null, parent_id: null, currency: "COP", gmf_exempt: false, liquid: true, enforce_funds: false, posted_balance: "5000000.00", projected_balance: "5000000.00", archived: false, default: true, balance: "5000000.00" };
const LIST = "GET /api/fms/v1/categories?page_size=200&archived=false";

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
});

/** Un formulario mínimo: otro campo ya escrito + el selector, para ver que crear no lo toca. */
function Harness({ kind = "expense" as "expense" | "income" }) {
  const categories = useAll<Category>(paths.categories({ archived: false }));
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <input aria-label="nota" value={note} onChange={(e) => setNote(e.target.value)} />
      <CategoryCombobox label="Categoría" kind={kind} categories={categories} value={value} onChange={setValue} placeholder="Sin categoría" />
      <output data-testid="value">{value}</output>
    </form>
  );
}

const box = (v: Mounted) => v.host.querySelector<HTMLInputElement>('input[role="combobox"]')!;
const options = (v: Mounted) => [...v.host.querySelectorAll('[role="option"]')].map((o) => o.textContent);
const key = (el: Element, k: string) => act(() => { el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); });
const focus = (el: HTMLElement) => act(() => { el.focus(); });

describe("selector de categoría con alta en línea", () => {
  it("expone el patrón ARIA de combobox con lista y etiqueta", async () => {
    view = await mountScreen(<Harness />, { [LIST]: page([cat("1", ["Mercado"])]) });
    const input = box(view);
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(view.host.querySelector(`label[for="${input.id}"]`)?.textContent).toContain("Categoría");
    focus(input);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(view.host.querySelector("#" + input.getAttribute("aria-controls"))?.getAttribute("role")).toBe("listbox");
  });

  it("filtra sin importar tildes ni mayúsculas y por teclado elige con Enter (sin enviar el formulario)", async () => {
    view = await mountScreen(<Harness />, { [LIST]: page([cat("1", ["Alimentación"]), cat("2", ["Mercado"])]) });
    focus(box(view));
    typeInto(box(view), "ALIMENTACION");
    expect(options(view)).toEqual(["Alimentación"]); // existe: no ofrece crear
    const submit = vi.fn();
    view.host.querySelector("form")!.addEventListener("submit", submit);
    key(box(view), "Enter");
    expect(view.host.querySelector('[data-testid="value"]')!.textContent).toBe("1");
    expect(box(view).value).toBe("Alimentación");
    expect(box(view).getAttribute("aria-expanded")).toBe("false");
    // Flechas: abre, baja y elige la segunda.
    focus(box(view));
    typeInto(box(view), "");
    key(box(view), "ArrowDown");
    key(box(view), "ArrowDown");
    expect(box(view).getAttribute("aria-activedescendant")).toBe(view.host.querySelectorAll('[role="option"]')[2].id);
    key(box(view), "Enter");
    expect(view.host.querySelector('[data-testid="value"]')!.textContent).toBe("2");
    key(box(view), "Escape");
  });

  it("un nombre que ya existe selecciona la existente: no ofrece crear ni hace POST", async () => {
    view = await mountScreen(<Harness />, { [LIST]: page([cat("2", ["Transporte", "Combustible"])]) });
    focus(box(view));
    typeInto(box(view), "  combustible ");
    expect(options(view)).toEqual(["Transporte › Combustible"]);
    key(box(view), "Enter");
    expect(view.host.querySelector('[data-testid="value"]')!.textContent).toBe("2");
    expect(view.mock.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("crear una nueva: POST con Idempotency-Key y tipo del formulario; queda seleccionada y lo ya escrito sigue igual", async () => {
    let created = false;
    view = await mountScreen(<Harness kind="income" />, {
      [LIST]: () => page(created ? [cat("9", ["Bonos"], "income")] : [cat("1", ["Salario"], "income")]),
      "POST /api/fms/v1/categories": () => { created = true; return { status: 201, json: cat("9", ["Bonos"], "income") }; },
    });
    const note = view.host.querySelector<HTMLInputElement>('input[aria-label="nota"]')!;
    typeInto(note, "Prima de diciembre");
    focus(box(view));
    typeInto(box(view), "Bonos");
    expect(options(view)).toEqual(["Crear «Bonos»"]);
    click(view.host.querySelector('[role="option"]'));
    await wait();
    const [post] = view.mock.calls.filter((c) => c.method === "POST");
    expect(post.body).toEqual({ name: "Bonos", kind: "income" });
    expect(post.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(view.host.querySelector('[data-testid="value"]')!.textContent).toBe("9");
    expect(box(view).value).toBe("Bonos");
    expect(note.value).toBe("Prima de diciembre"); // nada se reinició
    expect(view.host.querySelector('[role="status"]')!.textContent).toContain("Bonos");
    expect(view.mock.calls.filter((c) => c.method === "GET" && c.url.includes("/categories")).length).toBeGreaterThan(1); // la lista se recargó
  });

  it("si el servidor dice que el nombre ya existe (otra pestaña o archivada): avisa, recarga y no pierde nada", async () => {
    view = await mountScreen(<Harness />, {
      [LIST]: page([]),
      "POST /api/fms/v1/categories": { status: 409, json: { code: "name_taken", detail: "taken" } },
    });
    typeInto(view.host.querySelector<HTMLInputElement>('input[aria-label="nota"]')!, "cena");
    focus(box(view));
    typeInto(box(view), "Gimnasio");
    click(byText(view.host, '[role="option"]', "Crear"));
    await wait();
    expect(view.host.querySelector(".field__error")?.textContent).toContain("Ya tienes uno con ese nombre");
    expect(view.host.querySelector('input[aria-label="nota"]')!.getAttribute("value") ?? (view.host.querySelector('input[aria-label="nota"]') as HTMLInputElement).value).toBe("cena");
    expect(view.host.querySelector('[data-testid="value"]')!.textContent).toBe("");
  });

  it("sin categorías ofrece añadir las de por defecto (solo las que faltan) y no cierra ni reinicia nada", async () => {
    let added = false;
    view = await mountScreen(<Harness />, {
      [LIST]: () => page(added ? [cat("1", ["Alimentación"]), cat("2", ["Mercado"])] : []),
      "POST /api/fms/v1/categories/defaults": () => { added = true; return { status: 200, json: [cat("1", ["Alimentación"]), cat("2", ["Mercado"])] }; },
    });
    typeInto(view.host.querySelector<HTMLInputElement>('input[aria-label="nota"]')!, "cena");
    click(byText(view.host, "button", "Añadir categorías por defecto"));
    await wait();
    expect(view.host.querySelector('[role="status"]')!.textContent).toContain("2 categorías añadidas");
    expect(view.host.querySelector<HTMLInputElement>('input[aria-label="nota"]')!.value).toBe("cena");
    expect(view.host.textContent).not.toContain("Añadir categorías por defecto"); // ya hay
    focus(box(view));
    expect(options(view)).toEqual(["Sin categoría", "Alimentación", "Mercado"]);
  });

  it("con categorías en la Papelera no empuja las de por defecto: avisa y no ofrece el botón", async () => {
    const trashed = { id: "d1", kind: "category", object_id: "c9", label: "Mercado", deleted_at: "2026-11-14T10:00:00Z", purge_after: "2026-12-14T10:00:00Z", days_left: 30, affected: {}, deleted_by: null };
    view = await mountScreen(<Harness />, { [LIST]: page([]), "GET /api/fms/v1/deletions": { status: 200, json: [trashed] } });
    expect(view.host.textContent).toContain("Tienes categorías en la Papelera");
    expect(view.host.textContent).not.toContain("Añadir categorías por defecto");
  });

  it("con la Papelera sin categorías sí ofrece las de por defecto", async () => {
    view = await mountScreen(<Harness />, { [LIST]: page([]), "GET /api/fms/v1/deletions": { status: 200, json: [] } });
    expect(view.host.textContent).toContain("Añadir categorías por defecto");
    expect(view.host.textContent).not.toContain("Papelera");
  });

  it("en inglés ofrece «Create “…”»", async () => {
    view = await mountScreen(<Harness />, { [LIST]: page([cat("1", ["Mercado"])]) }, "en");
    focus(box(view));
    typeInto(box(view), "Gym");
    expect(options(view)).toEqual(["Create “Gym”"]);
  });
});

describe("movimiento nuevo: crear la categoría desde el selector no borra lo ya escrito", () => {
  it("monto y descripción siguen ahí y el movimiento se guarda con la categoría nueva", async () => {
    let created = false;
    const NEW = cat("c-9", ["Gimnasio"]);
    view = await mountScreen(<MovementForm />, {
      "GET /api/fms/v1/accounts?page_size=100": page([ACCOUNT]),
      [LIST]: () => page(created ? [NEW] : [cat("c-1", ["Mercado"])]),
      "GET /api/fms/v1/tags?page_size=200": page([]),
      "GET /api/fms/v1/payment-methods": { status: 200, json: [] },
      "GET /api/fms/v1/movements?page_size=30": page([]),
      "POST /api/fms/v1/categories": () => { created = true; return { status: 201, json: NEW }; },
      "POST /api/fms/v1/movements": { status: 201, json: { id: "m-9" } },
    });
    await wait();
    const amount = view.host.querySelector<HTMLInputElement>("input.input--amount")!;
    typeInto(amount, "85000");
    click(byText(view.host, "button", "Más detalles"));
    const descriptionLabel = byText(view.host, "#more-details label", "Descripción");
    const description = view.host.querySelector<HTMLInputElement>("#" + descriptionLabel.getAttribute("for"))!;
    typeInto(description, "Mensualidad del gimnasio");
    focus(box(view));
    typeInto(box(view), "gimnasio");
    click(byText(view.host, '[role="option"]', "Crear «gimnasio»"));
    await wait();
    expect(amount.value).toBe("85000");
    expect(description.value).toBe("Mensualidad del gimnasio");
    expect(box(view).value).toBe("Gimnasio");
    click([...view.host.querySelectorAll("button")].find((b) => b.type === "submit")!);
    await wait();
    const movement = view.mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/movements"))!;
    expect(movement.body).toMatchObject({ amount: "85000", category_id: "c-9", description: "Mensualidad del gimnasio" });
  });
});

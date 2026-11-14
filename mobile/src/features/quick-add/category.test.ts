import { createIntentKeys } from "@core/api/idempotency";
import type { Category } from "./logic";
import { addDefaultCategories, pickOrCreateCategory, type CategoryDeps } from "./category";

const cat = (id: string, name: string, kind: "expense" | "income" = "expense", archived = false): Category =>
  ({ id, name, kind, parent_id: null, path: [name], account_id: "x", default_nature: "", default_classification: "", archived }) as Category;

function deps(reply: (path: string, body: unknown) => { ok: true; status: number; data: unknown } | { ok: false; status: number; code: string }) {
  const calls: { path: string; body: unknown; key: string }[] = [];
  let n = 0;
  const post = jest.fn(async (path: string, body: unknown, options: { idempotencyKey: string }) => {
    calls.push({ path, body, key: options.idempotencyKey });
    return reply(path, body);
  });
  const value: CategoryDeps = { post: post as unknown as CategoryDeps["post"], scope: { kind: "personal" }, intents: createIntentKeys(() => `k${++n}`) };
  return { value, calls };
}

describe("elegir o crear una categoría desde el registro rápido", () => {
  it("si ya existe (otra mayúscula o sin tilde) la elige y no hace ninguna petición", async () => {
    const { value, calls } = deps(() => ({ ok: false, status: 500, code: "x" }));
    const r = await pickOrCreateCategory(value, [cat("1", "Alimentación")], "expense", "  alimentacion ");
    expect(r).toMatchObject({ ok: true, created: false, category: { id: "1" } });
    expect(calls).toHaveLength(0);
  });

  it("si no existe la crea con el tipo del movimiento y una Idempotency-Key", async () => {
    const { value, calls } = deps(() => ({ ok: true, status: 201, data: cat("9", "Gimnasio") }));
    const r = await pickOrCreateCategory(value, [cat("1", "Mercado"), cat("2", "Gimnasio", "income")], "expense", "Gimnasio");
    expect(r).toMatchObject({ ok: true, created: true, category: { id: "9" } });
    expect(calls).toEqual([{ path: "/categories", body: { name: "Gimnasio", kind: "expense" }, key: "k1" }]);
  });

  it("en un hogar crea dentro del hogar y un reintento tras un corte reusa la misma clave", async () => {
    let first = true;
    const { value, calls } = deps(() => (first ? ((first = false), { ok: false, status: 0, code: "network" }) : { ok: true, status: 201, data: cat("9", "Mascotas") }));
    const household = { ...value, scope: { kind: "household", id: "h1" } as CategoryDeps["scope"] };
    expect(await pickOrCreateCategory(household, [], "expense", "Mascotas")).toEqual({ ok: false, network: true, code: "network" });
    expect(await pickOrCreateCategory(household, [], "expense", "Mascotas")).toMatchObject({ ok: true, created: true });
    expect(calls.map((c) => c.path)).toEqual(["/households/h1/categories", "/households/h1/categories"]);
    expect(calls[0].key).toBe(calls[1].key);
  });

  it("un nombre vacío o de más de 80 letras no se envía; un 409 se devuelve con su código", async () => {
    const { value, calls } = deps(() => ({ ok: false, status: 409, code: "name_taken" }));
    expect(await pickOrCreateCategory(value, [], "expense", "   ")).toMatchObject({ ok: false, code: "invalid_name" });
    expect(await pickOrCreateCategory(value, [], "expense", "x".repeat(81))).toMatchObject({ ok: false, code: "invalid_name" });
    expect(calls).toHaveLength(0);
    expect(await pickOrCreateCategory(value, [cat("1", "Vieja", "expense", true)], "expense", "Vieja")).toEqual({ ok: false, network: false, code: "name_taken" });
  });

  it("las de por defecto: POST sin cuerpo y devuelve solo las añadidas", async () => {
    const { value, calls } = deps(() => ({ ok: true, status: 200, data: [cat("1", "Mercado")] }));
    expect(await addDefaultCategories(value)).toEqual({ ok: true, added: [cat("1", "Mercado")] });
    expect(calls[0]).toMatchObject({ path: "/categories/defaults", body: undefined });
  });
});

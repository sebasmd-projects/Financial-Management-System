import type { ApiResult } from "@core/api/client";
import { findExisting } from "@core/categories";
import { createIntents } from "@/api/ids";
import { paths } from "@/features/common/paths";
import { onMemoryWipe } from "@/features/common/memory";
import { scopedPath, type Scope } from "@/features/scope/scope";
import type { IntentKeys } from "@core/api/idempotency";
import type { Category } from "./logic";

/** Una `Idempotency-Key` por intención (como el movimiento): reintentar «Crear» tras un corte no duplica la categoría. Solo en memoria. */
export const categoryIntents: IntentKeys = createIntents();
onMemoryWipe(() => categoryIntents.done());

export interface CategoryDeps {
  post: <T>(path: string, body: unknown, options: { idempotencyKey: string }) => Promise<ApiResult<T>>;
  scope: Scope;
  intents?: IntentKeys;
}

export type CategoryResult = { ok: true; category: Category; created: boolean } | { ok: false; network: boolean; code: string };

export const MAX_CATEGORY_NAME = 80;

/** Lo que se escribió, con espacios de más recortados. */
export const cleanName = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * Elige la categoría con ese nombre si ya existe (sin mirar mayúsculas ni tildes) y, si no, la crea del tipo del movimiento.
 * Nunca duplica y no toca nada más del borrador: solo devuelve la categoría para que el llamador la seleccione.
 */
export async function pickOrCreateCategory(deps: CategoryDeps, categories: readonly Category[], kind: "income" | "expense", rawName: string): Promise<CategoryResult> {
  const name = cleanName(rawName);
  if (name === "" || name.length > MAX_CATEGORY_NAME) return { ok: false, network: false, code: "invalid_name" };
  const existing = findExisting(
    categories.filter((c) => c.kind === kind && !c.archived),
    name,
  );
  if (existing) return { ok: true, category: existing, created: false };
  const keys = deps.intents ?? categoryIntents;
  const path = scopedPath(paths.categoriesRoot, deps.scope);
  const body = { name, kind };
  const key = keys.keyFor(`${path}|${JSON.stringify(body)}`);
  const result = await deps.post<Category>(path, body, { idempotencyKey: key });
  if (result.ok) {
    keys.done();
    return { ok: true, category: result.data, created: true };
  }
  return { ok: false, network: result.status === 0, code: result.code };
}

/** «Añadir categorías por defecto»: el servidor solo inserta las que faltan y devuelve las nuevas. */
export async function addDefaultCategories(deps: CategoryDeps): Promise<{ ok: true; added: Category[] } | { ok: false; network: boolean; code: string }> {
  const keys = deps.intents ?? categoryIntents;
  const path = scopedPath(paths.categoryDefaults, deps.scope);
  const result = await deps.post<Category[]>(path, undefined, { idempotencyKey: keys.keyFor(path) });
  if (result.ok) {
    keys.done();
    return { ok: true, added: result.data };
  }
  return { ok: false, network: result.status === 0, code: result.code };
}

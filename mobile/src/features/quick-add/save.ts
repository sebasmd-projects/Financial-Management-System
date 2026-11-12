import type { ApiResult } from "@core/api/client";
import type { IntentKeys } from "@core/api/idempotency";
import { createIntents } from "@/api/ids";
import { onMemoryWipe } from "@/features/common/memory";
import { paths } from "@/features/common/paths";
import { scopedPath, type Scope } from "@/features/scope/scope";
import { movementBody, type FormValues, type Movement } from "./logic";

/**
 * Una `Idempotency-Key` por INTENCIÓN de la persona (regla 9): mientras lo que se envía no cambie, «Reintentar» manda la misma
 * clave, de modo que si la primera petición sí llegó el servidor devuelve el movimiento original y no crea otro. Al tener éxito la
 * clave se descarta. Solo en memoria.
 */
export const intents: IntentKeys = createIntents();
onMemoryWipe(() => intents.done());

export type SaveResult = { ok: true; movement: Movement } | { ok: false; network: boolean; code: string };

export interface SaveDeps {
  post: <T>(path: string, body: unknown, options: { idempotencyKey: string }) => Promise<ApiResult<T>>;
  scope: Scope;
  intents?: IntentKeys;
}

export async function saveMovement(deps: SaveDeps, values: FormValues): Promise<SaveResult> {
  const keys = deps.intents ?? intents;
  const path = scopedPath(paths.movements, deps.scope);
  const body = movementBody(values);
  const key = keys.keyFor(`${path}|${JSON.stringify(body)}`);
  const result = await deps.post<Movement>(path, body, { idempotencyKey: key });
  if (result.ok) {
    keys.done();
    return { ok: true, movement: result.data };
  }
  return { ok: false, network: result.status === 0, code: result.code };
}

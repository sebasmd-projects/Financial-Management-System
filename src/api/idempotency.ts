import { createIntentKeys as createCoreIntentKeys } from "../../core/api/idempotency";
import { newIdempotencyKey } from "./client";

export type { IntentKeys } from "../../core/api/idempotency";

/** Una clave por intención de la persona (ver `core/api/idempotency.ts`); en el navegador, UUID de `crypto.randomUUID`. */
export function createIntentKeys(newKey: () => string = newIdempotencyKey) {
  return createCoreIntentKeys(newKey);
}

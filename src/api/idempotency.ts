/**
 * La clave de idempotencia es UNA por intención de la persona (regla 9): el mismo UUID en cada reintento de la misma acción,
 * de modo que si la primera petición sí llegó (y la respuesta se perdió) el servidor devuelve el movimiento original y no
 * crea otro. Si la persona cambia lo que envía, es otra intención y la clave cambia. Al tener éxito se descarta.
 *
 * Todo vive en memoria; la huella (`fingerprint`) no se guarda ni se envía a ningún lado.
 */
import { newIdempotencyKey } from "./client";

export function createIntentKeys(newKey: () => string = newIdempotencyKey) {
  let current: { fingerprint: string; key: string } | null = null;
  return {
    /** La clave para esta huella: la misma mientras no cambie y no haya tenido éxito. */
    keyFor(fingerprint: string): string {
      if (current === null || current.fingerprint !== fingerprint) current = { fingerprint, key: newKey() };
      return current.key;
    },
    /** La acción tuvo éxito: la siguiente, aunque sea idéntica, es una intención nueva. */
    done(): void {
      current = null;
    },
  };
}

export type IntentKeys = ReturnType<typeof createIntentKeys>;

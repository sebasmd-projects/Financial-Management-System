import { randomUUID } from "expo-crypto";
import { createIntentKeys } from "@core/api/idempotency";

/** Una clave de idempotencia por intención de la persona (regla 9): UUID de `expo-crypto`, porque Hermes no trae `crypto.randomUUID`. */
export const newIdempotencyKey = (): string => randomUUID();
export const createIntents = () => createIntentKeys(newIdempotencyKey);

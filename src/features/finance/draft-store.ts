/**
 * Un borrador de movimiento que pasa de una pantalla a otra (p. ej. «Duplicar»). Vive SOLO en memoria del módulo: no se
 * escribe en `localStorage`, ni en la URL (llevaría el monto). Se limpia al guardar; al recargar la página se pierde.
 */
import type { MovementType } from "@/api/models";

export interface MovementDraft {
  type: MovementType;
  amount: string;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  description: string;
  counterparty: string;
  nature: "" | "fixed" | "variable";
  classification: "" | "necessary" | "discretionary";
  tags: string[];
  paymentMethodId: string | null;
}

let pending: MovementDraft | null = null;

export function setDraft(draft: MovementDraft): void {
  pending = draft;
}

/** Lee sin consumir (los inicializadores de React pueden ejecutarse dos veces en desarrollo). */
export function peekDraft(): MovementDraft | null {
  return pending;
}

export function clearDraft(): void {
  pending = null;
}

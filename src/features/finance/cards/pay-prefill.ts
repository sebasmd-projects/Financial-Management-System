/**
 * Lo que «Abonar» (Extractos) le pasa a la pantalla de pagar: el tipo de pago y, en un mes futuro, el monto. Va por MEMORIA del
 * módulo, no por la URL ni por el almacenamiento del navegador (regla del propietario: ningún monto en rutas, ni datos financieros en disco).
 */
export interface PayPrefill {
  cardId: string;
  kind: "minimum" | "total" | "amount";
  /** Cadena decimal tal como llegó de la API; solo con `kind: "amount"`. */
  amount: string | null;
  /** `AAAA-MM` del extracto, solo para decir de qué mes se abona. */
  month: string;
}

let pending: PayPrefill | null = null;

export function setPayPrefill(value: PayPrefill): void {
  pending = value;
}

/** Lo pendiente para esa tarjeta (sin borrarlo: lo borra `clearPayPrefill` al montar, para que el doble montaje de React no lo pierda). */
export function peekPayPrefill(cardId: string): PayPrefill | null {
  return pending && pending.cardId === cardId ? pending : null;
}

export function clearPayPrefill(): void {
  pending = null;
}

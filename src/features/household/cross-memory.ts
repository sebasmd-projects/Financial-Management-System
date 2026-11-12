/**
 * Los traslados entre Personal y Hogar creados en esta sesión: el contrato solo devuelve el identificador del traslado al crearlo
 * (no lo expone en los movimientos), así que para poder anularlo después se recuerda en MEMORIA con los dos movimientos. Sin montos.
 */
export interface KnownTransfer {
  group: string;
  householdId: string;
  personalMovementId: string;
  householdMovementId: string;
}

const known: KnownTransfer[] = [];

export function rememberTransfer(transfer: KnownTransfer): void {
  known.push(transfer);
  if (known.length > 50) known.shift();
}

export function transferOfMovement(movementId: string): KnownTransfer | null {
  return known.find((t) => t.personalMovementId === movementId || t.householdMovementId === movementId) ?? null;
}

export function forgetTransfer(group: string): void {
  const index = known.findIndex((t) => t.group === group);
  if (index >= 0) known.splice(index, 1);
}

export function resetKnownTransfers(): void {
  known.length = 0;
}

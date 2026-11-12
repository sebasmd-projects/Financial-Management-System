/** Cadena decimal tal como llega de la API (`"-180000.00"`). Se opera con `core/money`, nunca con `Number`. */
export type Amount = string;

/** Cuerpo de error de la API: `{ "code": "..." }` (y a veces `detail`, que no se muestra). */
export interface ApiErrorBody {
  code?: string;
}

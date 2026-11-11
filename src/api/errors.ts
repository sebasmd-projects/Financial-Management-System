import type { ApiResult } from "./client";

/** Los textos de error que la interfaz sabe decir; el resto cae en uno genérico por estado. Nunca lleva valores. */
export type ErrorTexts = Record<string, string> & { generic: string; network: string; forbidden: string; notFound: string; conflict: string; invalid: string; validation: string };

/**
 * Del resultado fallido de la API al texto para la persona. El `code` de la API es un identificador (sin montos: lo garantiza
 * el backend), así que puede mostrarse como referencia de soporte cuando no hay un texto propio.
 */
export function errorText(result: Extract<ApiResult<unknown>, { ok: false }>, texts: ErrorTexts): string {
  if (result.status === 0) return result.code === "csrf" ? texts.csrf ?? texts.generic : texts.network;
  const own = texts[result.code];
  if (own) return own;
  switch (result.status) {
    case 400:
      return texts.validation;
    case 401:
    case 403:
      return texts.forbidden;
    case 404:
      return texts.notFound;
    case 409:
      return texts.conflict;
    case 422:
      return texts.invalid;
    default:
      return texts.generic;
  }
}

/** Errores de campo de DRF (`{ campo: ["mensaje"] }`): solo los NOMBRES de los campos, nunca el contenido ni valores. */
export function invalidFields(data: unknown): string[] {
  if (typeof data !== "object" || data === null) return [];
  return Object.keys(data as Record<string, unknown>).filter((key) => key !== "code" && key !== "detail");
}

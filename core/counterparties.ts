/**
 * Contrapartes con nombre por cuenta destino (2026-11-16), sin nada de plataforma: lo comparten la web y la app.
 *
 * Una cuenta (celular, cuenta, referencia, comercio de un QR o PSE) solo se muestra como canal y **últimos 4** («Nequi ··3769»): el valor completo
 * lo guarda el servidor cifrado. «Ponerle nombre» pregunta antes de pisar un nombre: `409 identifier_taken` trae el nombre actual.
 */
export interface IdentifierLike {
  channel: string;
  last4: string;
}

/** Los textos que hacen falta: el nombre de cada canal y la plantilla `{channel} ··{last4}`. */
export interface IdentifierTexts {
  channels: Record<string, string>;
  identifier: string;
}

/** «Nequi ··3769»; sin dígitos (un QR o un PSE) solo el canal. */
export function identifierText(identifier: IdentifierLike, t: IdentifierTexts): string {
  const channel = t.channels[identifier.channel] ?? identifier.channel;
  return identifier.last4 ? t.identifier.replace("{channel}", channel).replace("{last4}", identifier.last4) : channel;
}

/** El nombre actual que trae `409 identifier_taken`, o `null` si el cuerpo no es ese error. */
export function takenName(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const name = (data as Record<string, unknown>).current_name;
  return typeof name === "string" ? name : null;
}

/** Sin tildes ni mayúsculas ni espacios de más, para comparar nombres. */
export function fold(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Las dos salidas de un conflicto de nombre: actualizar el anterior o crear otra contraparte. */
export type OnConflict = "rename" | "move";

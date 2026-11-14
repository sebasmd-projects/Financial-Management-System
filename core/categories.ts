/**
 * Comparar nombres de categoría como el servidor: sin mayúsculas, tildes ni espacios de más. Lo usan la web y la app para
 * SELECCIONAR la categoría que ya existe en vez de crear otra con el mismo nombre.
 */
export interface CategoryLike {
  name: string;
  path: readonly string[];
}

export function fold(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** La que ya se llama así (por nombre o por ruta completa «Transporte › Combustible»); `null` si no hay. */
export function findExisting<T extends CategoryLike>(categories: readonly T[], text: string): T | null {
  const wanted = fold(text);
  if (wanted === "") return null;
  return categories.find((c) => fold(c.name) === wanted) ?? categories.find((c) => fold(c.path.join(" › ")) === wanted) ?? null;
}

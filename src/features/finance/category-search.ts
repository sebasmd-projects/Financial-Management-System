import type { Category } from "@/api/models";
import { findExisting, fold } from "../../../core/categories";

export { findExisting, fold };

export const pathLabel = (category: Category) => category.path.join(" › ");

/** Las categorías del tipo pedido, por ruta («Transporte › Combustible»). */
export function ofKind(categories: readonly Category[], kind: "income" | "expense"): Category[] {
  return categories.filter((c) => c.kind === kind && !c.archived).sort((a, b) => a.path.join("/").localeCompare(b.path.join("/"), "es"));
}

/** Las que contienen lo escrito (en cualquier parte de la ruta), con las coincidencias exactas y las que empiezan igual primero. */
export function filterCategories(categories: readonly Category[], text: string): Category[] {
  const wanted = fold(text);
  if (wanted === "") return [...categories];
  const rank = (c: Category) => (fold(c.name) === wanted ? 0 : fold(c.name).startsWith(wanted) ? 1 : 2);
  return categories
    .filter((c) => fold(pathLabel(c)).includes(wanted))
    .map((c, index) => ({ c, index }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.index - b.index)
    .map(({ c }) => c);
}

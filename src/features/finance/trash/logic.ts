/**
 * Lógica pura de la confirmación de «Eliminar» y de la Papelera (sin React): los textos de «qué se verá afectado» con su singular y plural, las
 * frases de días restantes y de quién eliminó. La regla de qué cae y qué se exporta es del servidor; aquí solo se presenta.
 */
import { formatDate } from "@/lib/dates";
import { fill } from "../helpers";
import { affectedRows, daysLeft, type Deletion, type DeletionPreview } from "../../../../core/trash";

export interface PluralText {
  one: string;
  other: string;
}

/** «3 movimientos» / «1 movimiento»: la forma según la cantidad. Una clave desconocida se muestra tal cual, sin romper. */
export function affectedLabel(key: string, count: number, texts: Record<string, PluralText>): string {
  const entry = Object.hasOwn(texts, key) ? texts[key] : undefined;
  if (!entry) return `${count} ${key}`;
  return fill(count === 1 ? entry.one : entry.other, { n: String(count) });
}

/** Las líneas de «Esto también se verá afectado», sin la fila de la raíz. */
export function affectedLines(preview: Pick<DeletionPreview, "affected">, texts: Record<string, PluralText>): string[] {
  return affectedRows(preview).map((row) => affectedLabel(row.key, row.count, texts));
}

export interface DaysTexts {
  daysLeftOne: string;
  daysLeftOther: string;
  daysLeftToday: string;
}

/** «Quedan 12 días para restaurarlo»; el último día, «Se borra de verdad hoy». */
export function daysLeftText(deletion: Pick<Deletion, "days_left">, texts: DaysTexts): string {
  const n = daysLeft(deletion);
  if (n === 0) return texts.daysLeftToday;
  return n === 1 ? texts.daysLeftOne : fill(texts.daysLeftOther, { n: String(n) });
}

/** Quién y cuándo eliminó (la fecha en hora de Bogotá). Sin nombre (cuenta borrada), solo la fecha. */
export function deletedByText(deletion: Pick<Deletion, "deleted_at" | "deleted_by">, texts: { deletedBy: string; deletedOn: string }): string {
  const date = formatDate(deletion.deleted_at);
  const name = deletion.deleted_by?.name;
  return name ? fill(texts.deletedBy, { name, date }) : fill(texts.deletedOn, { date });
}

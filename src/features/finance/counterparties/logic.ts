import type { DetectedRecurrence } from "@/api/models";
import { formatCop } from "@/lib/money";

type CpDict = {
  channels: Record<string, string>;
  identifier: string;
  import: { line: string; every: Record<"weekly" | "biweekly" | "every_n_days" | "monthly" | "other", string> };
};

/** Los canales que el servidor reconoce, en el orden en que se ofrecen. */
export const CHANNELS = ["nequi", "daviplata", "bancolombia", "davivienda", "bbva", "banco_bogota", "av_villas", "bre_b", "qr", "pse", "other"] as const;
export type Channel = (typeof CHANNELS)[number];

/** Los canales cuyo valor es un nombre de comercio (no tienen dígitos que mostrar). */
export const NAME_CHANNELS: ReadonlySet<string> = new Set(["qr", "pse"]);

export { fold, identifierText, takenName } from "../../../../core/counterparties";

/** «Crear recurrente: $500.000 cada 15 días a Mi Madre» (el monto es la cadena decimal de la API: nunca `Number`). */
export function suggestionLine(s: Pick<DetectedRecurrence, "amount" | "frequency" | "interval_days" | "counterparty" | "type">, t: CpDict): string {
  const known = s.frequency in t.import.every ? (s.frequency as keyof CpDict["import"]["every"]) : "other";
  const every = t.import.every[known].replace("{days}", String(s.interval_days));
  return t.import.line.replace("{amount}", formatCop(s.amount)).replace("{every}", every).replace("{name}", s.counterparty.name);
}

/** El cuerpo de `POST /recurrences/detected` a partir de la sugerencia tal como llegó (los movimientos que cuadran se enlazan como pagados). */
export function detectedBody(s: DetectedRecurrence) {
  return {
    counterparty_id: s.counterparty.id,
    type: s.type,
    account_id: s.account_id ?? "",
    category_id: s.category_id,
    expected_amount: s.amount,
    frequency: s.frequency,
    interval: s.interval,
    day: s.day,
    last_day: s.last_day,
    weekday: s.weekday,
    start_date: s.start_date,
    movement_ids: s.movement_ids,
  };
}

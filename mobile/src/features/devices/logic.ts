import { formatDate, formatTime } from "@core/dates";
import type { components } from "@core/api/schema.gen";
import { es } from "@/i18n/es";

export type Device = components["schemas"]["FmsDevice"];

/** Título y detalle de una fila de «Dispositivos». Las fechas son instantes del servidor, mostrados en Bogotá (UTC−5). */
export function describeDevice(device: Device): { title: string; detail: string } {
  const model = device.model?.trim() || (device.platform === "ios" ? "iPhone" : "Android");
  const parts = [`v${device.app_version || "?"}`, `${es.devices.lastSeen} ${formatDate(device.last_seen_at)} ${formatTime(device.last_seen_at)}`];
  if (device.remember) parts.push(es.devices.remembered);
  return { title: model, detail: parts.join(" · ") };
}

/**
 * Descargar un archivo que el servidor arma en memoria (informes y tabla de amortización: `POST .../export`).
 * Regla del propietario: el archivo NO se guarda en ningún lado. Llega como `Blob` en la respuesta, se le crea una URL de
 * objeto, se dispara la descarga y la URL se revoca de inmediato; nada de `localStorage`, caché ni reintentos con el archivo.
 */
import { api } from "./index";
import type { ApiResult } from "./client";
import type { ExportFormat } from "./models";

export const EXPORT_TYPES: Record<ExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  pdf: "application/pdf",
};

/** El nombre sugerido: el del servidor (`Content-Disposition`) no se lee aquí; se arma con la clave y el formato. */
export function exportFileName(base: string, format: ExportFormat, date: string): string {
  return `${base.replace(/[^A-Za-z0-9_-]/g, "-")}-${date}.${format}`;
}

/** Entrega el blob al navegador y revoca la URL en el acto. */
export function saveBlob(blob: Blob, fileName: string, doc: Document = document, urls: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL): void {
  const url = urls.createObjectURL(blob);
  const link = doc.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  doc.body.append(link);
  link.click();
  link.remove();
  urls.revokeObjectURL(url);
}

/** `POST` de una exportación: el archivo llega en la respuesta y se descarga; devuelve el fallo (o `null` si todo salió bien). */
export async function downloadExport(path: string, body: unknown, fileName: string, locale: string): Promise<Extract<ApiResult<Blob>, { ok: false }> | null> {
  const result = await api.post<Blob>(path, body, { asBlob: true, locale });
  if (!result.ok) return result;
  saveBlob(result.data, fileName);
  return null;
}

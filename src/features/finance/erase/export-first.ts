/**
 * «Exportar primero»: descarga la exportación de la cuenta del sitio (`GET /_allauth/cv/v1/me/export`, un JSON con todo lo de la cuenta; lo financiero va
 * descifrado). Pide reautenticación reciente: si el servidor contesta 401, se abre el aviso (`ask`) y, si la persona confirma, se repite UNA vez. El archivo
 * llega como `Blob`, se entrega al navegador y no se guarda en ningún otro lado.
 */
import { ACCOUNT_EXPORT_PATH } from "../../../../core/erase";

export type ExportOutcome = "ok" | "cancelled" | "error";

export interface ExportDeps {
  fetch: (input: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status" | "blob">>;
  /** Abre el aviso de reautenticación; `true` si la persona confirmó. */
  ask: () => Promise<boolean>;
  save: (blob: Blob, fileName: string) => void;
  today: () => string;
}

export function exportFileName(date: string): string {
  return `my-data-${date.replace(/[^0-9-]/g, "")}.json`;
}

export async function exportAccountData(deps: ExportDeps): Promise<ExportOutcome> {
  const once = () => deps.fetch(ACCOUNT_EXPORT_PATH, { method: "GET", credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
  try {
    let response = await once();
    if (response.status === 401) {
      if (!(await deps.ask())) return "cancelled";
      response = await once();
    }
    if (!response.ok) return response.status === 401 ? "cancelled" : "error";
    deps.save(await response.blob(), exportFileName(deps.today()));
    return "ok";
  } catch {
    return "error";
  }
}

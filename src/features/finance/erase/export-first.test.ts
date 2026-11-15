import { describe, expect, it, vi } from "vitest";
import { exportAccountData, exportFileName, type ExportDeps } from "./export-first";

const blob = new Blob(["{}"], { type: "application/json" });
const reply = (status: number) => ({ ok: status >= 200 && status < 300, status, blob: () => Promise.resolve(blob) });

function deps(statuses: number[], ask = true): ExportDeps & { saved: string[]; calls: string[] } {
  const saved: string[] = [];
  const calls: string[] = [];
  const queue = [...statuses];
  return {
    saved,
    calls,
    fetch: vi.fn((input: string) => {
      calls.push(input);
      return Promise.resolve(reply(queue.shift() ?? 500));
    }),
    ask: vi.fn(() => Promise.resolve(ask)),
    save: (_blob, name) => void saved.push(name),
    today: () => "2026-11-15",
  };
}

describe("exportar primero", () => {
  it("descarga el JSON de la cuenta", async () => {
    const d = deps([200]);
    expect(await exportAccountData(d)).toBe("ok");
    expect(d.calls).toEqual(["/_allauth/cv/v1/me/export"]);
    expect(d.saved).toEqual(["my-data-2026-11-15.json"]);
    expect(d.ask).not.toHaveBeenCalled();
  });
  it("si pide reautenticación, abre el aviso y repite una sola vez", async () => {
    const d = deps([401, 200]);
    expect(await exportAccountData(d)).toBe("ok");
    expect(d.ask).toHaveBeenCalledTimes(1);
    expect(d.calls).toHaveLength(2);
  });
  it("si la persona cancela el aviso no descarga nada", async () => {
    const d = deps([401], false);
    expect(await exportAccountData(d)).toBe("cancelled");
    expect(d.saved).toEqual([]);
  });
  it("un 401 que se repite tras confirmar no entra en bucle", async () => {
    const d = deps([401, 401]);
    expect(await exportAccountData(d)).toBe("cancelled");
    expect(d.ask).toHaveBeenCalledTimes(1);
  });
  it("un fallo del servidor o de la red es un error y no guarda nada", async () => {
    const d = deps([500]);
    expect(await exportAccountData(d)).toBe("error");
    const broken: ExportDeps = { ...deps([]), fetch: () => Promise.reject(new Error("red")) };
    expect(await exportAccountData(broken)).toBe("error");
    expect(d.saved).toEqual([]);
  });
  it("el nombre del archivo solo lleva cifras y guiones", () => {
    expect(exportFileName("2026-11-15/../x")).toBe("my-data-2026-11-15.json");
  });
});

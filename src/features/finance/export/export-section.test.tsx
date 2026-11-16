// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, click, mountScreen, wait, type Mounted } from "@/test/render";
import type { ExportJob } from "../../../../core/export";
import { ExportSection } from "./export-section";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas/perfil" }));
const saved = vi.hoisted(() => vi.fn());
vi.mock("@/api/download", async (original) => ({ ...(await original<typeof import("@/api/download")>()), saveBlob: saved }));

const JOB: ExportJob = {
  id: "j1", household_id: null, status: "pending", progress: 0, step: "", error_code: "", created_at: "2026-11-16T10:00:00Z", finished_at: null,
  expires_at: null, size: 0, download_url: null, download_expires_at: null,
};
const READY: ExportJob = { ...JOB, status: "ready", progress: 100, step: "done", size: 4096, download_url: "/api/fms/v1/me/export/j1/download?t=tok1", download_expires_at: "2026-11-16T10:20:00Z" };
const API = "/api/fms/v1";
const NONE = { status: 200, json: { latest: null } };

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  saved.mockReset();
});
const text = () => mounted?.text() ?? "";
const button = (label: string) => byText(document.body, "button", label) as HTMLButtonElement;

async function open(routes: Parameters<typeof mountScreen>[1], scope: Parameters<typeof ExportSection>[0] = {}, locale: "es" | "en" = "es") {
  mounted = await mountScreen(<ExportSection {...scope} />, routes, locale);
  return mounted;
}

describe("exportar mis datos de Finanzas", () => {
  it("explica qué trae el ZIP, avisa de que no va cifrado y no pide nada hasta que se pulsa", async () => {
    await open({ [`GET ${API}/me/export`]: NONE });
    expect(text()).toContain("Exportar mis datos de Finanzas");
    expect(text()).toContain("finanzas.json");
    expect(text()).toContain("NO va cifrado");
    expect(text()).toContain("Hasta 3 exportaciones por día");
    expect(mounted?.mock.calls.map((c) => `${c.method} ${c.url}`)).toEqual([`GET ${API}/me/export`]);
  });

  it("pide el export, y cuando está listo pide un enlace NUEVO y baja el ZIP con el nombre del día", async () => {
    await open({
      [`GET ${API}/me/export`]: NONE,
      [`POST ${API}/me/export`]: { status: 201, json: READY },
      [`GET ${API}/me/export/j1`]: { status: 200, json: { ...READY, download_url: "/api/fms/v1/me/export/j1/download?t=tok2" } },
      [`GET ${API}/me/export/j1/download?t=tok2`]: { status: 200, body: "ZIPDATA" },
    });
    click(button("Exportar mis datos"));
    await wait();
    expect(text()).toContain("El archivo está listo");
    click(button("Descargar el ZIP"));
    await wait();
    const urls = mounted?.mock.calls.map((c) => `${c.method} ${c.url}`) ?? [];
    expect(urls).toContain(`GET ${API}/me/export/j1/download?t=tok2`);
    expect(urls).not.toContain(`GET ${API}/me/export/j1/download?t=tok1`); // el primer enlace no se usa: se pide uno nuevo
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.calls[0]?.[1]).toMatch(/^finanzas-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(text()).toContain("Archivo descargado");
    expect(mounted?.mock.calls.find((c) => c.method === "POST")?.credentials).toBe("same-origin");
  });

  it("si ya había uno armándose al abrir la página, enseña el progreso y lo sigue", async () => {
    await open({
      [`GET ${API}/me/export`]: { status: 200, json: { latest: { ...JOB, status: "running", progress: 40, step: "files" } } },
      [`GET ${API}/me/export/j1`]: { status: 200, json: READY },
    });
    expect(text()).toContain("Armando los archivos");
    expect(mounted?.host.querySelector("progress")?.getAttribute("value")).toBe("40");
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await wait();
    expect(text()).toContain("El archivo está listo");
  });

  it("el cupo diario se dice con su texto y deja reintentar", async () => {
    await open({ [`GET ${API}/me/export`]: NONE, [`POST ${API}/me/export`]: { status: 429, json: { code: "throttled" } } });
    click(button("Exportar mis datos"));
    await wait();
    expect(text()).toContain("Demasiadas solicitudes");
    expect(text()).toContain("Reintentar");
  });

  it("un enlace ya usado (410) se explica y no deja el archivo a medias", async () => {
    await open({
      [`GET ${API}/me/export`]: { status: 200, json: { latest: READY } },
      [`GET ${API}/me/export/j1`]: { status: 200, json: READY },
      [`GET ${API}/me/export/j1/download?t=tok1`]: { status: 410, json: { code: "link_used_or_expired" } },
    });
    click(button("Descargar el ZIP"));
    await wait();
    expect(saved).not.toHaveBeenCalled();
    expect(text()).toContain("ya se usó o caducó");
  });

  it("un trabajo que ya se bajó ofrece pedir otro, no volver a bajarlo", async () => {
    await open({ [`GET ${API}/me/export`]: { status: 200, json: { latest: { ...JOB, status: "downloaded", progress: 100 } } } });
    expect(text()).toContain("Exportar mis datos");
    expect(text()).not.toContain("Descargar el ZIP");
  });

  it("en un hogar usa las rutas del hogar y habla del hogar (cualquier miembro, también el visor)", async () => {
    await open(
      {
        [`GET ${API}/households/h1/export`]: NONE,
        [`POST ${API}/households/h1/export`]: { status: 201, json: { ...READY, household_id: "h1" } },
      },
      { scope: { kind: "household", id: "h1" } },
    );
    expect(text()).toContain("Exportar los datos del hogar");
    expect(text()).toContain("también quien solo lee");
    click(button("Exportar mis datos"));
    await wait();
    expect(mounted?.mock.calls.map((c) => `${c.method} ${c.url}`)).toEqual([`GET ${API}/households/h1/export`, `POST ${API}/households/h1/export`]);
  });

  it("en inglés", async () => {
    await open({ [`GET ${API}/me/export`]: NONE }, {}, "en");
    expect(text()).toContain("Export my Finances data");
    expect(text()).toContain("is NOT encrypted");
  });

  it("nada del trabajo queda en el almacenamiento del navegador", async () => {
    await open({ [`GET ${API}/me/export`]: { status: 200, json: { latest: READY } } });
    expect(JSON.stringify({ ...localStorage })).not.toContain("j1");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("tok1");
  });
});

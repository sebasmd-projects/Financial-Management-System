// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { ProfileScreen } from "./profile-screen";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas/perfil" }));

const SETTINGS = "GET /api/fms/v1/sync/settings";
let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

describe("«Guardar mi cédula para abrir extractos PDF»", () => {
  it("apagado por defecto: se pide cada vez; al encenderlo se escribe y se guarda (PUT) sin dejar rastro", async () => {
    let saved = false;
    view = await mountScreen(<ProfileScreen />, {
      [SETTINGS]: () => ({ status: 200, json: { document_saved: saved, document_set_at: saved ? "2026-11-14T15:00:00Z" : null } }),
      "PUT /api/fms/v1/sync/settings/document": () => {
        saved = true;
        return { status: 200, json: { document_saved: true, document_set_at: "2026-11-14T15:00:00Z" } };
      },
    });
    expect(view.visible()).toContain("el FMS te la pedirá cada vez");
    const toggle = view.host.querySelector<HTMLInputElement>("input[type=checkbox]")!;
    expect(toggle.checked).toBe(false);
    click(toggle);
    await wait();
    const field = view.host.querySelector<HTMLInputElement>("input[type=password]")!;
    typeInto(field, "12");
    click(byText(view.host, "button", "Guardar cédula"));
    await wait();
    expect(view.host.textContent).toContain("entre 4 y 20 letras o cifras");
    expect(view.mock.calls.some((c) => c.method === "PUT")).toBe(false);
    typeInto(field, "1.020.304.050");
    click(byText(view.host, "button", "Guardar cédula"));
    await wait(60);
    const put = view.mock.calls.find((c) => c.method === "PUT")!;
    expect(put.body).toEqual({ document: "1020304050" });
    expect(view.visible()).toContain("Cédula guardada.");
    expect(view.visible()).toContain("Tu cédula está guardada");
    // Ni en la URL ni en el almacenamiento.
    expect(view.mock.calls.every((c) => !c.url.includes("1020304050"))).toBe(true);
    expect(window.localStorage.length).toBe(0);
    expect(view.host.querySelector("input[type=password]")).toBeNull();
  });

  it("verla es un POST (nada en la URL), se muestra solo mientras la pidas y se oculta", async () => {
    view = await mountScreen(<ProfileScreen />, {
      [SETTINGS]: { status: 200, json: { document_saved: true, document_set_at: "2026-11-14T15:00:00Z" } },
      "POST /api/fms/v1/sync/settings/document/reveal": { status: 200, json: { document: "1020304050" } },
    });
    expect(view.visible()).not.toContain("1020304050");
    click(byText(view.host, "button", "Mostrar mi cédula"));
    await wait();
    expect(view.visible()).toContain("Tu cédula: 1020304050");
    expect(view.mock.calls.find((c) => c.url.endsWith("/reveal"))?.method).toBe("POST");
    click(byText(view.host, "button", "Ocultar"));
    expect(view.visible()).not.toContain("1020304050");
  });

  it("apagarlo la borra (DELETE)", async () => {
    let saved = true;
    view = await mountScreen(<ProfileScreen />, {
      [SETTINGS]: () => ({ status: 200, json: { document_saved: saved, document_set_at: saved ? "2026-11-14T15:00:00Z" : null } }),
      "DELETE /api/fms/v1/sync/settings/document": () => {
        saved = false;
        return { status: 200, json: { document_saved: false, document_set_at: null } };
      },
    });
    click(view.host.querySelector<HTMLInputElement>("input[type=checkbox]")!);
    await wait(60);
    expect(view.mock.calls.some((c) => c.method === "DELETE")).toBe(true);
    expect(view.visible()).toContain("Cédula borrada");
  });
});

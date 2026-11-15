// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionProvider } from "@/features/session/provider";
import type { SessionStore } from "@/features/session/store";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import type { ErasePreview } from "../../../../core/erase";
import { EraseSection } from "./erase-section";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas/perfil" }));

const PREVIEW_URL = "GET /api/fms/v1/me/erase/preview";
const ERASE_URL = "POST /api/fms/v1/me/erase";
const PREVIEW: ErasePreview = {
  counts: { accounts: 3, movements: 120, cards: 0, loans: 1, debts: 0, rules: 0, connections: 1 },
  in_trash: 4,
  households: [{ id: "h1", name: "Casa", role: "editor", action: "leave", accounts: 2 }],
  households_affected: 1,
  blocked: false,
  export_recommended: true,
  phrases: { es: "BORRAR MIS FINANZAS", en: "DELETE MY FINANCES" },
};
const DONE = { erased: true, already: false, rows: 130, households_left: 1, households_deleted: 0, devices_revoked: 0 };

const load = vi.fn();
const store = { load, abort: () => undefined, subscribe: () => () => undefined, getState: () => ({ status: "loading" }) } as unknown as SessionStore;

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  load.mockReset();
});
const dialog = () => document.querySelector("dialog")?.textContent ?? "";
const submit = () => byText(document.body, "button", "Borrar todo definitivamente") as HTMLButtonElement;
const field = () => document.querySelector("dialog input") as HTMLInputElement;

async function open(routes: Parameters<typeof mountScreen>[1], locale: "es" | "en" = "es") {
  mounted = await mountScreen(
    <SessionProvider store={store}>
      <EraseSection />
    </SessionProvider>,
    routes,
    locale,
  );
  click(byText(document.body, "button", locale === "es" ? "Borrar todos mis datos de Finanzas" : "Erase all my Finances data"));
  await wait();
  return mounted;
}

describe("borrar todos mis datos de Finanzas", () => {
  it("enseña los recuentos, el hogar y el aviso de las copias, y no borra sin la frase", async () => {
    await open({ [PREVIEW_URL]: { status: 200, json: PREVIEW } });
    expect(dialog()).toContain("inmediato e irreversible");
    expect(dialog()).toContain("Cuentas: 3");
    expect(dialog()).toContain("Movimientos: 120");
    expect(dialog()).not.toContain("Tarjetas");
    expect(dialog()).toContain("4 elementos que están en la papelera");
    expect(dialog()).toContain("Casa");
    expect(dialog()).toContain("2 cuentas compartidas");
    expect(dialog()).toContain("copias de seguridad");
    expect(dialog()).toContain("conservan tu llave de datos envuelta hasta que caducan");
    expect(dialog()).toContain("Exportar primero");
    expect(submit().disabled).toBe(true);
    typeInto(field(), "borrar");
    expect(submit().disabled).toBe(true);
    expect(mounted?.mock.calls.filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("con la frase confirma: manda la frase con una Idempotency-Key y vuelve a leer la sesión (la compuerta muestra la activación)", async () => {
    await open({ [PREVIEW_URL]: { status: 200, json: PREVIEW }, [ERASE_URL]: { status: 200, json: DONE } });
    typeInto(field(), "borrar mis finanzas");
    expect(submit().disabled).toBe(false);
    click(submit());
    await wait();
    const post = mounted?.mock.calls.find((c) => c.method === "POST");
    expect(post?.body).toEqual({ confirm: "borrar mis finanzas" });
    expect(post?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(load).toHaveBeenCalledWith({ quiet: true });
  });

  it("en inglés pide la frase en inglés", async () => {
    await open({ [PREVIEW_URL]: { status: 200, json: PREVIEW } }, "en");
    expect(dialog()).toContain("DELETE MY FINANCES");
    typeInto(field(), "BORRAR MIS FINANZAS");
    expect((byText(document.body, "button", "Erase everything for good") as HTMLButtonElement).disabled).toBe(true);
    typeInto(field(), "delete my finances");
    expect((byText(document.body, "button", "Erase everything for good") as HTMLButtonElement).disabled).toBe(false);
  });

  it("si eres propietario de un hogar con más miembros no hay frase ni botón que valga", async () => {
    const blocked = { ...PREVIEW, blocked: true, households: [{ id: "h1", name: "Casa", role: "owner", action: "blocked", accounts: 2 }] } as ErasePreview;
    await open({ [PREVIEW_URL]: { status: 200, json: blocked } });
    expect(dialog()).toContain("Antes tienes que ceder o borrar estos hogares");
    expect(field()).toBeNull();
    expect(submit().disabled).toBe(true);
  });

  it("un 409 household_owner del servidor se explica y no cierra la sesión", async () => {
    await open({ [PREVIEW_URL]: { status: 200, json: PREVIEW }, [ERASE_URL]: { status: 409, json: { code: "household_owner" } } });
    typeInto(field(), "BORRAR MIS FINANZAS");
    click(submit());
    await wait();
    expect(dialog()).toContain("Eres propietario de un hogar que tiene más miembros");
    expect(load).not.toHaveBeenCalledWith({ quiet: true });
  });

  it("una cuenta sin datos no ofrece exportar", async () => {
    const empty = { ...PREVIEW, counts: { accounts: 0, movements: 0, cards: 0, loans: 0, debts: 0, rules: 0, connections: 0 }, in_trash: 0, households: [], households_affected: 0, export_recommended: false } as ErasePreview;
    await open({ [PREVIEW_URL]: { status: 200, json: empty } });
    expect(dialog()).toContain("Todavía no tienes datos financieros");
    expect(dialog()).not.toContain("Exportar primero");
  });
});

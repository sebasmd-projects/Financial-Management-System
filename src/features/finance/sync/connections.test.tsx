// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { ACCOUNTS, CATALOG, CONNECTION, page } from "@/test/sync-fixtures";
import { ConnectionsScreen } from "./connections-screen";
import { ReauthDialog } from "./reauth-dialog";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas/configuracion/conexiones" }));

const ADDRESS = "abcdefghijklmnopqrstuvwxyz234567@recibir.example.test";
const LIST = "GET /api/fms/v1/sync/connections?page_size=100";
const BASE = {
  "GET /api/fms/v1/sync/catalog": { status: 200, json: CATALOG },
  "GET /api/fms/v1/accounts?page_size=100": ACCOUNTS,
};

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
});
const dialogs = () => [...document.querySelectorAll("dialog[open]")];
const lastDialog = () => dialogs().at(-1)!;

describe("conexiones de correo (W1)", () => {
  it("lista las conexiones con su salud y avisa de lo que se activa en la app", async () => {
    const quiet = { ...CONNECTION, id: "c2", institution_name: "Davivienda", last_event_at: "2026-10-01T10:00:00Z" };
    const paused = { ...CONNECTION, id: "c3", institution_name: "AV Villas", status: "paused" };
    const waiting = { ...CONNECTION, id: "c4", institution_name: "Nu", last_event_at: null };
    view = await mountScreen(<ConnectionsScreen />, { ...BASE, [LIST]: page([CONNECTION, quiet, paused, waiting]) });
    const text = view.visible();
    expect(text).toContain("Al día: último correo el");
    expect(text).toContain("Sin correos desde hace");
    expect(text).toContain("monto mínimo de las alertas");
    expect(text).toContain("Pausada: no se lee ningún correo");
    expect(text).toContain("Esperando el primer correo del banco");
    expect(text).toContain("Nequi y Nu se activan desde la app móvil");
  });

  it("una conexión que no es tuya no muestra acciones ni configuración", async () => {
    view = await mountScreen(<ConnectionsScreen />, { ...BASE, [LIST]: page([{ ...CONNECTION, is_manager: false, provider: null, label: null }]) });
    expect(view.visible()).toContain("Solo quien creó esta conexión");
    expect(byTextOrNull(view.host, "button", "Rotar la dirección")).toBeNull();
    expect(byTextOrNull(view.host, "button", "Borrar")).toBeNull();
  });

  it("el asistente: elige banco (sin Nequi ni Nu), crea con Idempotency-Key y muestra la dirección UNA vez con botón de copiar", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    let created = false;
    view = await mountScreen(<ConnectionsScreen />, {
      ...BASE,
      [LIST]: () => page(created ? [CONNECTION] : []),
      "POST /api/fms/v1/sync/connections": () => {
        created = true;
        return { status: 201, json: { ...CONNECTION, address: ADDRESS } };
      },
      "GET /api/fms/v1/sync/connections/c1": { status: 200, json: { ...CONNECTION, forwarding_code: "123456", forwarding_code_expires_at: "2099-01-01T00:00:00Z" } },
    });
    click(byText(view.host, "button", "Conectar un banco"));
    await wait();
    const dialog = lastDialog();
    const bank = dialog.querySelectorAll<HTMLSelectElement>("select")[0];
    expect([...bank.options].map((o) => o.textContent)).toEqual(["Elige un banco", "Bancolombia"]);
    const account = dialog.querySelectorAll<HTMLSelectElement>("select")[1];
    expect([...account.options].map((o) => o.textContent)).toEqual(["Elige una cuenta", "Ahorros Bancolombia"]);
    typeInto(bank, "1");
    typeInto(account, "acc-1");
    click(byText(dialog, "button", "Crear la dirección"));
    await wait();

    const post = view.mock.calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ institution_id: 1, account_id: "acc-1", provider: "gmail", include_statements: true, locale: "es" });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();

    const shown = lastDialog();
    expect((shown.querySelector("#sync-address") as HTMLInputElement).value).toBe(ADDRESS);
    expect(shown.textContent).toContain("se muestra una sola vez");
    // El filtro paso a paso para Gmail y el monto mínimo (plan §3.1).
    expect(shown.textContent).toContain("Reenvío y correo POP/IMAP");
    expect(shown.textContent).toContain("Pon ese mínimo en $0");
    // La dirección no queda en la URL, ni en el almacenamiento del navegador, ni en otra petición.
    expect(window.location.href).not.toContain("abcdefghijkl");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(JSON.stringify(view.mock.calls.filter((c) => c.method === "GET"))).not.toContain("abcdefghijkl");

    click(byText(shown, "button", "Copiar dirección"));
    await wait();
    expect(writeText).toHaveBeenCalledWith(ADDRESS);
    expect(shown.textContent).toContain("Dirección copiada.");

    // «Comprobar»: trae el código de confirmación de Gmail y dice que ya llegó un correo.
    click(byText(shown, "button", "Comprobar si llegó"));
    await wait();
    expect(lastDialog().textContent).toContain("123456");
    expect(lastDialog().textContent).toContain("Llegó un correo el");
    // La dirección sigue ahí mientras la ventana esté abierta, pero la consulta de la conexión nunca la trae.
    expect((lastDialog().querySelector("#sync-address") as HTMLInputElement).value).toBe(ADDRESS);
  });

  it("si copiar falla, lo dice y deja la dirección seleccionada para copiarla a mano", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) } });
    view = await mountScreen(<ConnectionsScreen />, {
      ...BASE,
      [LIST]: page([]),
      "POST /api/fms/v1/sync/connections": { status: 201, json: { ...CONNECTION, address: ADDRESS } },
      "GET /api/fms/v1/sync/connections/c1": { status: 200, json: CONNECTION },
    });
    click(byText(view.host, "button", "Conectar un banco"));
    await wait();
    const dialog = lastDialog();
    typeInto(dialog.querySelectorAll<HTMLSelectElement>("select")[0], "1");
    typeInto(dialog.querySelectorAll<HTMLSelectElement>("select")[1], "acc-1");
    click(byText(dialog, "button", "Crear la dirección"));
    await wait();
    click(byText(lastDialog(), "button", "Copiar dirección"));
    await wait();
    expect(lastDialog().textContent).toContain("No se pudo copiar");
  });

  it("sin la dirección (una respuesta repetida) ofrece rotarla y no inventa una", async () => {
    view = await mountScreen(<ConnectionsScreen />, {
      ...BASE,
      [LIST]: page([]),
      "POST /api/fms/v1/sync/connections": { status: 200, json: { ...CONNECTION, address: null } },
      "GET /api/fms/v1/sync/connections/c1": { status: 200, json: CONNECTION },
    });
    click(byText(view.host, "button", "Conectar un banco"));
    await wait();
    const dialog = lastDialog();
    typeInto(dialog.querySelectorAll<HTMLSelectElement>("select")[0], "1");
    typeInto(dialog.querySelectorAll<HTMLSelectElement>("select")[1], "acc-1");
    click(byText(dialog, "button", "Crear la dirección"));
    await wait();
    expect(lastDialog().querySelector("#sync-address")).toBeNull();
    expect(byText(lastDialog(), "button", "Rotar la dirección")).toBeTruthy();
  });

  it("el servidor sin subdominio de ingesta lo dice y no deja conectar", async () => {
    view = await mountScreen(<ConnectionsScreen />, { ...BASE, "GET /api/fms/v1/sync/catalog": { status: 200, json: { ...CATALOG, configured: false } }, [LIST]: page([]) });
    expect(view.visible()).toContain("todavía no recibe correos de bancos");
    expect(byText<HTMLButtonElement>(view.host, "button", "Conectar un banco").disabled).toBe(true);
  });

  it("pausar no pide reautenticación y manda solo el estado", async () => {
    view = await mountScreen(<ConnectionsScreen />, { ...BASE, [LIST]: page([CONNECTION]), "PATCH /api/fms/v1/sync/connections/c1": { status: 200, json: { ...CONNECTION, status: "paused" } } });
    click(byText(view.host, "button", "Pausar"));
    await wait();
    expect(view.mock.calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "paused" });
    expect(view.visible()).toContain("Conexión pausada.");
  });
});

describe("rotar y borrar piden reautenticación", () => {
  it("rotar: el 403 abre el aviso, al confirmar la contraseña se repite la MISMA petición y sale la dirección nueva una vez", async () => {
    let rotates = 0;
    view = await mountScreen(
      <>
        <ConnectionsScreen />
        <ReauthDialog />
      </>,
      {
        ...BASE,
        [LIST]: page([CONNECTION]),
        "POST /api/fms/v1/sync/connections/c1/rotate": () => {
          rotates += 1;
          return rotates === 1 ? { status: 403, json: { code: "reauthentication_required" } } : { status: 201, json: { ...CONNECTION, address: "nueva234567abcdefghijklmnopqrstuv@recibir.example.test" } };
        },
        "POST /_allauth/browser/v1/auth/reauthenticate": { status: 200, json: {} },
        "GET /api/fms/v1/sync/connections/c1": { status: 200, json: CONNECTION },
      },
    );
    click(byText(view.host, "button", "Rotar la dirección"));
    await wait();
    click(byText(lastDialog(), "button", "Rotar"));
    await wait();
    // Abierto el aviso de «Confirma que eres tú».
    const ask = dialogs().find((d) => d.textContent?.includes("Confirma que eres tú"))!;
    expect(ask).toBeTruthy();
    const input = ask.querySelector<HTMLInputElement>("input[type=password]")!;
    typeInto(input, "mi-clave");
    click(byText(ask, "button", "Confirmar"));
    await wait(60);

    const reauth = view.mock.calls.find((c) => c.url === "/_allauth/browser/v1/auth/reauthenticate")!;
    expect(reauth.body).toEqual({ password: "mi-clave" });
    expect(reauth.headers.get("X-CSRFToken")).toBe("tok-test");
    const rotate = view.mock.calls.filter((c) => c.url.endsWith("/rotate"));
    expect(rotate).toHaveLength(2);
    expect(rotate[0].headers.get("Idempotency-Key")).toBe(rotate[1].headers.get("Idempotency-Key"));
    expect((document.querySelector("#sync-address") as HTMLInputElement).value).toContain("nueva234567");
    // Lo escrito se borró y el aviso se cerró.
    expect(dialogs().some((d) => d.textContent?.includes("Confirma que eres tú"))).toBe(false);
  });

  it("si la persona cancela el aviso, no se rota nada y se dice por qué", async () => {
    view = await mountScreen(
      <>
        <ConnectionsScreen />
        <ReauthDialog />
      </>,
      { ...BASE, [LIST]: page([CONNECTION]), "POST /api/fms/v1/sync/connections/c1/rotate": { status: 403, json: { code: "reauthentication_required" } } },
    );
    click(byText(view.host, "button", "Rotar la dirección"));
    await wait();
    click(byText(lastDialog(), "button", "Rotar"));
    await wait();
    const ask = dialogs().find((d) => d.textContent?.includes("Confirma que eres tú"))!;
    click(byText(ask, "button", "Cancelar"));
    await wait();
    expect(view.mock.calls.filter((c) => c.url.endsWith("/rotate"))).toHaveLength(1);
    expect(document.body.textContent).toContain("tienes que confirmar tu contraseña o tu código");
  });

  it("una contraseña equivocada se dice y el aviso sigue abierto; con el código usa la ruta del segundo factor", async () => {
    let attempts = 0;
    view = await mountScreen(
      <>
        <ConnectionsScreen />
        <ReauthDialog />
      </>,
      {
        ...BASE,
        [LIST]: page([CONNECTION]),
        "DELETE /api/fms/v1/sync/connections/c1": { status: 403, json: { code: "reauthentication_required" } },
        "POST /_allauth/browser/v1/auth/reauthenticate": () => {
          attempts += 1;
          return { status: 400, json: {} };
        },
        "POST /_allauth/browser/v1/auth/2fa/reauthenticate": { status: 200, json: {} },
      },
    );
    click(byText(view.host, "button", "Borrar"));
    await wait();
    click(byText(lastDialog(), "button", "Borrar conexión"));
    await wait();
    const ask = () => dialogs().find((d) => d.textContent?.includes("Confirma que eres tú"))!;
    typeInto(ask().querySelector<HTMLInputElement>("input[type=password]")!, "mal");
    click(byText(ask(), "button", "Confirmar"));
    await wait();
    expect(attempts).toBe(1);
    expect(ask().textContent).toContain("No coincide");
    click(byText(ask(), "button", "Usar código"));
    await wait();
    typeInto(ask().querySelector<HTMLInputElement>("input")!, "123456");
    click(byText(ask(), "button", "Confirmar"));
    await wait();
    expect(view.mock.calls.find((c) => c.url.endsWith("/2fa/reauthenticate"))?.body).toEqual({ code: "123456" });
  });
});

function byTextOrNull(host: ParentNode, selector: string, text: string): Element | null {
  return [...host.querySelectorAll(selector)].find((el) => el.textContent?.includes(text)) ?? null;
}

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { setScope } from "../../household/scope-store";
import { ACCOUNTS, CATEGORIES, CONNECTION, EVENT, page } from "@/test/sync-fixtures";
import { NavReviewCount, ReviewCountProvider } from "./review-count";
import { ReviewScreen } from "./review-screen";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas/movimientos/por-revisar" }));

const PROPOSED = "GET /api/fms/v1/sync/events?status=proposed&page=1&page_size=50";
const BASE = {
  "GET /api/fms/v1/sync/connections?page_size=100": page([CONNECTION]),
  "GET /api/fms/v1/accounts?page_size=100": ACCOUNTS,
  "GET /api/fms/v1/categories?page_size=200&archived=false": CATEGORIES,
};
const events = (...rows: unknown[]) => ({ status: 200, json: { count: rows.length, page: 1, page_size: 50, results: rows } });

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  setScope({ kind: "personal" });
  vi.unstubAllGlobals();
});
const modal = () => document.querySelector("dialog[open]")!;

describe("«Por revisar» (W2)", () => {
  it("muestra solo los campos extraídos, con el monto como cadena decimal formateada, y «Ir al correo» seguro", async () => {
    view = await mountScreen(<ReviewScreen />, { ...BASE, [PROPOSED]: events(EVENT) });
    const text = view.visible();
    expect(text).toContain("Exito");
    expect(text).toContain("Egreso");
    expect(text).toContain("13/11/2026");
    expect(text).toContain("Tarjeta ••1234");
    expect(text).toContain("Ahorros Bancolombia");
    expect(text).toContain("−$180.000");
    // El monto nunca viaja en una URL.
    expect(view.mock.calls.every((c) => !/180000|amount/.test(c.url))).toBe(true);
    const link = byText<HTMLAnchorElement>(view.host, "a", "Ir al correo");
    expect(link.getAttribute("href")).toMatch(/^https:\/\/mail\.google\.com\//);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.textContent).toContain("pestaña nueva");
  });

  it("un enlace que no es de un servidor de correo conocido NO se pinta: solo queda la pista de búsqueda", async () => {
    const evil = { ...EVENT, mail_link: { exact: true, provider: "gmail", search_hint: "from:bancolombia.test 2026-11-13", url: "javascript:alert(1)" } };
    view = await mountScreen(<ReviewScreen />, { ...BASE, [PROPOSED]: events(evil) });
    expect([...view.host.querySelectorAll("a")].some((a) => a.textContent?.includes("Ir al correo"))).toBe(false);
    expect(view.host.innerHTML).not.toContain("javascript:");
    expect(view.visible()).toContain("from:bancolombia.test 2026-11-13");
  });

  it("si el enlace no abre el mensaje exacto, da la pista de búsqueda (remitente y fecha)", async () => {
    const outlook = { ...EVENT, mail_link: { exact: false, provider: "outlook", search_hint: "from:banco.test 2026-11-13", url: "https://outlook.live.com/mail/0/" } };
    view = await mountScreen(<ReviewScreen />, { ...BASE, [PROPOSED]: events(outlook) });
    expect(view.visible()).toContain("búscalo con: from:banco.test 2026-11-13");
  });

  it("Aprobar manda una Idempotency-Key y deja «Deshacer» a mano; deshacer anula", async () => {
    let state: "proposed" | "approved" | "undone" = "proposed";
    view = await mountScreen(<ReviewScreen />, {
      ...BASE,
      [PROPOSED]: () => events(...(state === "proposed" ? [EVENT] : [])),
      "POST /api/fms/v1/sync/events/e1/approve": () => {
        state = "approved";
        return { status: 200, json: { ...EVENT, status: "approved" } };
      },
      "POST /api/fms/v1/sync/events/e1/undo": () => {
        state = "undone";
        return { status: 200, json: { ...EVENT, status: "undone" } };
      },
    });
    click(byText(view.host, "button", "Aprobar"));
    await wait();
    const approve = view.mock.calls.find((c) => c.url.endsWith("/approve"))!;
    expect(approve.method).toBe("POST");
    expect(approve.headers.get("Idempotency-Key")).toBeTruthy();
    expect(view.visible()).toContain("Aprobado. Puedes deshacerlo.");
    click(byText(view.host, "button", "Deshacer"));
    await wait();
    expect(view.mock.calls.find((c) => c.url.endsWith("/undo"))?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(view.visible()).toContain("Deshecho");
    expect(byTextOrNull(view.host, "button", "Deshacer")).toBeNull();
  });

  it("Descartar", async () => {
    view = await mountScreen(<ReviewScreen />, { ...BASE, [PROPOSED]: events(EVENT), "POST /api/fms/v1/sync/events/e1/discard": { status: 200, json: { ...EVENT, status: "discarded" } } });
    click(byText(view.host, "button", "Descartar"));
    await wait();
    expect(view.mock.calls.find((c) => c.url.endsWith("/discard"))?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(view.visible()).toContain("Descartado.");
  });

  it("Modificar: todos los campos son editables, el monto incluido, y se envía SOLO lo que cambió", async () => {
    view = await mountScreen(<ReviewScreen />, { ...BASE, [PROPOSED]: events(EVENT), "POST /api/fms/v1/sync/events/e1/modify": { status: 200, json: { ...EVENT, status: "modified" } } });
    click(byText(view.host, "button", "Modificar"));
    await wait();
    const form = modal();
    // Todos los campos del contrato están: tipo, monto, fecha, cuenta, categoría, contraparte, descripción y nota.
    for (const label of ["Tipo", "Monto", "Fecha", "Cuenta", "Categoría", "Comercio o contraparte", "Descripción", "Nota"]) expect(form.textContent, label).toContain(label);
    const amount = form.querySelector<HTMLInputElement>("input.input--amount")!;
    expect(amount.value).toBe("180000.00");
    typeInto(amount, "250.000");
    expect(form.querySelector("[data-testid=amount-preview]")?.textContent).toBe("$250.000");
    click(byText(form, "button", "Guardar y aprobar"));
    await wait();
    const post = view.mock.calls.find((c) => c.url.endsWith("/modify"))!;
    expect(post.body).toEqual({ amount: "250000" });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(view.visible()).toContain("Aprobado con tus cambios");
  });

  it("modificar sin cambiar nada no sale a la red", async () => {
    view = await mountScreen(<ReviewScreen />, { ...BASE, [PROPOSED]: events(EVENT) });
    click(byText(view.host, "button", "Modificar"));
    await wait();
    click(byText(modal(), "button", "Guardar y aprobar"));
    await wait();
    expect(modal().textContent).toContain("No cambiaste nada");
    expect(view.mock.calls.some((c) => c.url.endsWith("/modify"))).toBe(false);
  });

  it("un monto con tres decimales o en cero se rechaza antes de enviar", async () => {
    view = await mountScreen(<ReviewScreen />, { ...BASE, [PROPOSED]: events(EVENT) });
    click(byText(view.host, "button", "Modificar"));
    await wait();
    typeInto(modal().querySelector<HTMLInputElement>("input.input--amount")!, "0");
    click(byText(modal(), "button", "Guardar y aprobar"));
    await wait();
    expect(modal().textContent).toContain("Escribe un monto mayor que cero");
    expect(view.mock.calls.some((c) => c.url.endsWith("/modify"))).toBe(false);
  });

  it("lo que cruzó con un movimiento que ya tienes solo se aprueba: no hay «Modificar»", async () => {
    view = await mountScreen(<ReviewScreen />, { ...BASE, [PROPOSED]: events({ ...EVENT, match: "matches_confirmed" }) });
    expect(view.visible()).toContain("Ya tienes este movimiento");
    expect(byTextOrNull(view.host, "button", "Modificar")).toBeNull();
    expect(byText(view.host, "button", "Aprobar")).toBeTruthy();
  });

  it("si cruzó con un pago pendiente se avisa y no se cambia el tipo ni la cuenta", async () => {
    view = await mountScreen(<ReviewScreen />, { ...BASE, [PROPOSED]: events({ ...EVENT, match: "matches_pending" }) });
    expect(view.visible()).toContain("Coincide con un pago pendiente");
    click(byText(view.host, "button", "Modificar"));
    await wait();
    expect(modal().textContent).toContain("no se cambia el tipo ni la cuenta");
    expect([...modal().querySelectorAll("label")].some((l) => l.textContent === "Cuenta")).toBe(false);
  });

  it("un 409 «ya decidido» se dice con un texto propio", async () => {
    view = await mountScreen(<ReviewScreen />, { ...BASE, [PROPOSED]: events(EVENT), "POST /api/fms/v1/sync/events/e1/approve": { status: 409, json: { code: "event_not_proposed" } } });
    click(byText(view.host, "button", "Aprobar"));
    await wait();
    expect(view.visible()).toContain("Ese movimiento ya se decidió");
  });

  it("sin conexiones, el estado vacío invita a conectar un banco", async () => {
    view = await mountScreen(<ReviewScreen />, { ...BASE, "GET /api/fms/v1/sync/connections?page_size=100": page([]), [PROPOSED]: events() });
    expect(view.visible()).toContain("Aún no conectas un banco");
    expect(byText<HTMLAnchorElement>(view.host, "a", "Conectar un banco").getAttribute("href")).toBe("/es/finanzas/configuracion/conexiones");
  });

  it("el historial trae lo decidido y se puede deshacer; lo rechazado o ilegible solo se nombra, sin contenido", async () => {
    view = await mountScreen(<ReviewScreen />, {
      ...BASE,
      [PROPOSED]: events(),
      "GET /api/fms/v1/sync/events?status=all&page=1&page_size=50": events({ ...EVENT, id: "e2", status: "approved" }, { ...EVENT, id: "e3", status: "rejected_auth", amount: null, date: null, counterparty: null, kind: "", mail_link: null }, { ...EVENT, id: "e4", status: "parse_error", amount: null, counterparty: null, mail_link: null }),
    });
    click(byText(view.host, "button", "Historial"));
    await wait();
    const text = view.visible();
    expect(text).toContain("Aprobado");
    expect(text).toContain("Rechazado: no venía firmado por el banco");
    expect(text).toContain("No se pudo leer el correo");
    expect(byText(view.host, "button", "Deshacer")).toBeTruthy();
  });

  it("en un hogar las propuestas se piden al hogar", async () => {
    setScope({ kind: "household", id: "h1" });
    view = await mountScreen(<ReviewScreen />, { "GET /api/fms/v1/households/h1/sync/connections?page_size=100": page([CONNECTION]), "GET /api/fms/v1/households/h1/sync/events?status=proposed&page=1&page_size=50": events(EVENT) });
    expect(view.visible()).toContain("Exito");
  });
});

describe("el contador de «Por revisar»", () => {
  it("se pide una vez por pantalla, solo el número, y se lee como texto", async () => {
    view = await mountScreen(
      <ReviewCountProvider pathname="/es/finanzas">
        <NavReviewCount route="movimientos-por-revisar" />
        <NavReviewCount route="movimientos" />
      </ReviewCountProvider>,
      { "GET /api/fms/v1/sync/events/summary": { status: 200, json: { proposed: 3 } } },
    );
    expect(view.text()).toContain("3");
    expect(view.text()).toContain("(3)");
    expect(view.host.querySelectorAll(".nav-count")).toHaveLength(1);
    expect(view.mock.calls).toHaveLength(1);
  });
  it("sin nada por revisar no pinta nada", async () => {
    view = await mountScreen(
      <ReviewCountProvider pathname="/es/finanzas">
        <NavReviewCount route="movimientos-por-revisar" />
      </ReviewCountProvider>,
      { "GET /api/fms/v1/sync/events/summary": { status: 200, json: { proposed: 0 } } },
    );
    expect(view.host.querySelector(".nav-count")).toBeNull();
  });
});

function byTextOrNull(host: ParentNode, selector: string, text: string): Element | null {
  return [...host.querySelectorAll(selector)].find((el) => el.textContent?.includes(text)) ?? null;
}

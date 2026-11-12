// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { act } from "react";
import { periodOf, todayBogota } from "@/lib/dates";
import { es } from "@/i18n/dictionaries/es";
import type { MockReply } from "@/test/mock-fetch";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { AccountsScreen } from "../finance/accounts/accounts-screen";
import { MovementDetail } from "../finance/movements/movement-detail";
import { MovementsScreen } from "../finance/movements/movements-screen";
import { FinanceScreen } from "../finance/screens";
import { SummaryScreen } from "../finance/summary/summary-screen";
import { ReportView } from "../finance/reports/report-view";
import { rememberTransfer, resetKnownTransfers } from "./cross-memory";
import { CrossTransferDialog } from "./cross-transfer";
import { HouseholdScreen } from "./household-detail";
import { HouseholdsScreen } from "./households-screen";
import { InvitationsScreen } from "./invitations-screen";
import { ScopeSwitcher } from "./scope-switcher";
import { ShareAccountDialog } from "./share-account";
import { getScope, resetHouseholdState, setScope } from "./scope-store";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas" }));

const API = "/api/fms/v1";
const H = "7b0a6f0e-0000-4000-8000-000000000001";
const ME_ID = 7;
const hh = (role: string, extra: Record<string, unknown> = {}) => ({ id: H, name: "Casa", role, members: 2, rotating: false, ...extra });
const list = (role: string, invitations: unknown[] = []) => ({ status: 200, json: { households: [hh(role)], invitations } });
const page = (results: unknown[]) => ({ status: 200, json: { count: results.length, page: 1, page_size: 100, results } });
const account = (id: string, name: string, kind = "savings") => ({
  id, type: "asset", kind, system_key: "", name, last4: null, institution: null, parent_id: null, currency: "COP", gmf_exempt: false, liquid: true, enforce_funds: false, status: "active", posted_balance: "100000.00", projected_balance: "100000.00",
});
const movement = (over: Record<string, unknown> = {}) => ({
  id: "m1", created_by: { id: 3, name: "Ana" }, updated_by: { id: 5, name: "Beto" }, type: "expense", origin: "manual", status: "confirmado", voided: false, date: todayBogota(), amount: "45000.00", currency: "COP", original: null, attributes: {}, description: "Mercado", notes: null, counterparty: null, category: null, nature: "", classification: "", tags: [], cost_center: null, payment_method: null,
  account: { id: "a1", name: "Ahorros Casa" }, to_account: null, refund_of_id: null, replaces_id: null, gmf: null, entry_id: "e1", entry_number: 1, attachments: 0, installment_plan: null, warnings: [], ...over,
});

let mounted: Mounted | null = null;
async function mount(element: ReactElement, routes: Record<string, MockReply>) {
  mounted = await mountScreen(element, routes);
  return mounted;
}
beforeEach(() => {
  resetHouseholdState();
  resetKnownTransfers();
});
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  resetHouseholdState();
  vi.unstubAllGlobals();
});
/** Los botones y enlaces visibles (sin los de los diálogos cerrados, cuyos títulos siempre están en el DOM). */
const controls = (m: Mounted) => [...m.host.querySelectorAll("a, button")].filter((el) => !el.closest("dialog")).map((el) => el.textContent?.trim() ?? "");
const hasControl = (m: Mounted, text: string) => controls(m).some((label) => label.includes(text));
const urls = (m: Mounted) => m.mock.calls.map((c) => `${c.method} ${c.url}`);

describe("selector de ámbito", () => {
  it("ofrece Personal, Hogar X y Ambos · X; elegir el hogar cambia el ámbito (en memoria)", async () => {
    const m = await mount(<ScopeSwitcher />, { [`GET ${API}/households`]: list("editor") });
    const select = m.host.querySelector("select")!;
    expect([...select.options].map((o) => o.textContent)).toEqual(["Personal", "Hogar Casa", "Ambos · Casa"]);
    expect(select.labels?.[0]?.textContent).toBe("Ámbito");
    typeInto(select, `household:${H}`);
    expect(getScope()).toEqual({ kind: "household", id: H });
    typeInto(select, `both:${H}`);
    expect(getScope()).toEqual({ kind: "both", id: H });
    expect(window.location.href).not.toContain(H);
    expect(localStorage.length).toBe(0);
  });
  it("muestra las invitaciones pendientes con un enlace", async () => {
    const inv = { id: "i1", household_id: H, household_name: "Casa", role: "editor", status: "pending", invited_by: "Ana", expires_at: "2026-12-01T10:00:00Z" };
    const m = await mount(<ScopeSwitcher />, { [`GET ${API}/households`]: list("editor", [inv]) });
    expect(m.text()).toContain("Invitaciones (1)");
  });
  it("si el hogar activo ya no está en la lista, vuelve a Personal", async () => {
    setScope({ kind: "household", id: "otro" });
    await mount(<ScopeSwitcher />, { [`GET ${API}/households`]: list("editor") });
    expect(getScope()).toEqual({ kind: "personal" });
  });
});

describe("cuentas en el hogar", () => {
  it("el editor pide las cuentas a households/{id}/…, puede crear, y no ve tarjetas (solo personales)", async () => {
    setScope({ kind: "household", id: H });
    const m = await mount(<AccountsScreen tab="todas" />, {
      [`GET ${API}/households`]: list("editor"),
      [`GET ${API}/households/${H}/accounts?page_size=100`]: page([account("a1", "Ahorros Casa")]),
      [`GET ${API}/households/${H}/summary`]: { status: 200, json: { period: "2026-11-01", spent: "0", income: "0", available_today: "100000.00", owed: "0", installment_purchases: [] } },
    });
    expect(urls(m)).toContain(`GET ${API}/households/${H}/accounts?page_size=100`);
    expect(urls(m).some((u) => u.includes("/accounts") && !u.includes("/households/"))).toBe(false);
    expect(urls(m).some((u) => u.includes("/cards"))).toBe(false);
    expect(m.visible()).toContain("Ahorros Casa");
    expect(hasControl(m, es.fin.accounts.add)).toBe(true);
    expect(hasControl(m, es.fin.accounts.tabs.credito)).toBe(false);
    expect(m.visible()).toContain(es.fin.hh.accounts.cardsPersonal);
  });

  it("el visor lee: aviso de solo lectura y ningún botón de crear", async () => {
    setScope({ kind: "household", id: H });
    const m = await mount(<AccountsScreen tab="todas" />, {
      [`GET ${API}/households`]: list("viewer"),
      [`GET ${API}/households/${H}/accounts?page_size=100`]: page([]),
      [`GET ${API}/households/${H}/summary`]: { status: 404 },
    });
    expect(m.visible()).toContain("Solo lectura");
    expect(hasControl(m, es.fin.accounts.add)).toBe(false);
    expect(hasControl(m, es.fin.accounts.addFirst)).toBe(false);
  });

  it("un 403 household_read_only al crear se explica sin romper la pantalla", async () => {
    setScope({ kind: "household", id: H });
    const m = await mount(<AccountsScreen tab="todas" />, {
      [`GET ${API}/households`]: list("editor"),
      [`GET ${API}/households/${H}/accounts?page_size=100`]: page([]),
      [`GET ${API}/households/${H}/summary`]: { status: 404 },
      [`POST ${API}/households/${H}/accounts`]: { status: 403, json: { code: "household_read_only", detail: "x" } },
    });
    click(byText(m.host, "button", es.fin.accounts.add));
    await wait();
    typeInto(m.host.querySelector<HTMLInputElement>("dialog input[type=text]")!, "Nueva");
    click(byText(m.host, "dialog button[type=submit]", es.fin.accounts.create));
    await wait();
    const post = m.mock.calls.find((c) => c.method === "POST")!;
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(m.text()).toContain(es.fin.errors.household_read_only);
  });

  it("«Ambos»: las personales y las del hogar, cada una en su sección", async () => {
    setScope({ kind: "both", id: H });
    const m = await mount(<AccountsScreen tab="todas" />, {
      [`GET ${API}/households`]: list("editor"),
      [`GET ${API}/accounts?page_size=100`]: page([account("p1", "Mi ahorro")]),
      [`GET ${API}/households/${H}/accounts?page_size=100`]: page([account("a1", "Ahorros Casa")]),
      [`GET ${API}/summary?scope=both&household_id=${H}`]: { status: 200, json: { period: "2026-11-01", spent: "0", income: "0", available_today: "1", owed: "0", installment_purchases: [] } },
      [`GET ${API}/cards?page_size=100`]: page([]),
    });
    expect(m.visible()).toContain("Mi ahorro");
    expect(m.visible()).toContain("Ahorros Casa");
    expect(m.visible()).toContain("Del hogar Casa");
    // abrir una cuenta del hogar desde «Ambos» cambia el ámbito a ese hogar
    click(byText(m.host, "a", "Ahorros Casa"));
    expect(getScope()).toEqual({ kind: "household", id: H });
  });
});

describe("movimientos en el hogar: autoría y solo lectura", () => {
  const search = (role: string) => ({
    [`GET ${API}/households`]: list(role),
    [`POST ${API}/households/${H}/movements/search`]: page([movement()]),
    [`GET ${API}/households/${H}/accounts?page_size=100`]: page([]),
    [`GET ${API}/households/${H}/categories?page_size=200`]: page([]),
  });
  it("cada movimiento dice quién lo creó y quién lo editó", async () => {
    setScope({ kind: "household", id: H });
    const m = await mount(<MovementsScreen preset="all" routeId="movimientos" />, search("editor"));
    expect(m.visible()).toContain("Creado por Ana");
    expect(m.visible()).toContain("Editado por Beto");
    expect(hasControl(m, es.nav.newMovement)).toBe(true);
  });
  it("el visor no ve «Movimiento» nuevo", async () => {
    setScope({ kind: "household", id: H });
    const m = await mount(<MovementsScreen preset="all" routeId="movimientos" />, search("viewer"));
    expect(hasControl(m, es.nav.newMovement)).toBe(false);
    expect(m.visible()).toContain("Solo lectura");
  });
  it("«Ambos» avisa que la lista es la personal y ofrece pasar al hogar", async () => {
    setScope({ kind: "both", id: H });
    const m = await mount(<MovementsScreen preset="all" routeId="movimientos" />, { [`GET ${API}/households`]: list("editor"), [`POST ${API}/movements/search`]: page([]), [`GET ${API}/accounts?page_size=100`]: page([]), [`GET ${API}/categories?page_size=200`]: page([]) });
    expect(m.visible()).toContain(es.fin.hh.bothNotice.body);
    click(byText(m.host, "button", es.fin.hh.bothNotice.action));
    expect(getScope()).toEqual({ kind: "household", id: H });
  });
  it("el detalle: el editor tiene acciones y el visor no", async () => {
    setScope({ kind: "household", id: H });
    const routes = (role: string) => ({ ...search(role), [`GET ${API}/households/${H}/movements/m1`]: { status: 200, json: movement() } });
    let m = await mount(<MovementDetail id="m1" />, routes("editor"));
    expect(m.visible()).toContain("Creado por Ana");
    expect(hasControl(m, es.fin.detail.annul)).toBe(true);
    expect(hasControl(m, es.screens["movimiento-historial"])).toBe(false);
    m.unmount();
    resetHouseholdState();
    setScope({ kind: "household", id: H });
    m = mounted = await mountScreen(<MovementDetail id="m1" />, routes("viewer"));
    expect(hasControl(m, es.fin.detail.annul)).toBe(false);
    expect(hasControl(m, es.fin.detail.edit)).toBe(false);
    expect(hasControl(m, es.fin.detail.duplicate)).toBe(false);
    expect(m.visible()).toContain("Solo lectura");
  });
  it("la mitad de un traslado entre ámbitos no se anula sola y lo dice", async () => {
    setScope({ kind: "household", id: H });
    const m = await mount(<MovementDetail id="m1" />, { ...search("editor"), [`GET ${API}/households/${H}/movements/m1`]: { status: 200, json: movement({ origin: "household_transfer" }) } });
    expect(hasControl(m, es.fin.detail.annul)).toBe(false);
    expect(hasControl(m, es.fin.detail.adjust)).toBe(false);
    expect(m.visible()).toContain(es.fin.hh.cross.cannotKnow);
  });
});

describe("pantallas solo personales", () => {
  it("en el hogar se explican y no piden nada a la API", async () => {
    setScope({ kind: "household", id: H });
    const m = await mount(<FinanceScreen routeId="pagos-fijos" params={[]} />, { [`GET ${API}/households`]: list("owner") });
    expect(m.visible()).toContain(es.fin.hh.personalOnly.title);
    expect(m.visible()).toContain(es.screens["pagos-fijos"]);
    expect(urls(m).filter((u) => !u.endsWith("/households"))).toEqual([]);
  });
  it("en Personal la misma pantalla sí se monta", async () => {
    const m = await mount(<FinanceScreen routeId="pagos-fijos" params={[]} />, {});
    expect(m.visible()).not.toContain(es.fin.hh.personalOnly.title);
  });
});

describe("resumen e informes consolidados", () => {
  it("«Ambos» pide summary?scope=both&household_id (sin montos en la URL) y no el tablero", async () => {
    setScope({ kind: "both", id: H });
    const m = await mount(<SummaryScreen />, {
      [`GET ${API}/households`]: list("editor"),
      [`GET ${API}/summary?scope=both&household_id=${H}&period=${periodOf(todayBogota())}`]: { status: 200, json: { period: "2026-11-01", spent: "2310000.00", income: "5200000.00", available_today: "3420000.00", owed: "2170000.00", installment_purchases: [] } },
    });
    expect(urls(m).some((u) => u.includes("/dashboard"))).toBe(false);
    expect(m.visible()).toContain(es.fin.hh.summary.available);
    expect(m.text()).toContain("3.420.000");
    for (const url of urls(m)) expect(url).not.toMatch(/amount|balance|total/i);
  });
  it("el Resumen del hogar usa el tablero del hogar y no muestra pagos fijos", async () => {
    setScope({ kind: "household", id: H });
    const m = await mount(<SummaryScreen />, { [`GET ${API}/households`]: list("editor"), [`GET ${API}/households/${H}/dashboard`]: { status: 404 } });
    expect(urls(m)).toContain(`GET ${API}/households/${H}/dashboard`);
  });
  it("un informe en «Ambos» pide el consolidado en el cuerpo", async () => {
    setScope({ kind: "both", id: H });
    const m = await mount(<ReportView reportKey="income_statement" />, { [`POST ${API}/reports/income_statement/query`]: { status: 404 } });
    const call = m.mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/query"))!;
    expect(call.url).not.toContain(H);
    expect(call.body).toMatchObject({ scope: "both", household_id: H });
  });
  it("un informe en el hogar usa la ruta del hogar", async () => {
    setScope({ kind: "household", id: H });
    const m = await mount(<ReportView reportKey="income_statement" />, { [`POST ${API}/households/${H}/reports/income_statement/query`]: { status: 404 } });
    expect(urls(m)).toContain(`POST ${API}/households/${H}/reports/income_statement/query`);
  });
});

describe("gestión del hogar", () => {
  const detail = (role: string, over: Record<string, unknown> = {}) => ({
    status: 200,
    json: {
      id: H, name: "Casa", role, members: 3, rotating: false,
      members_list: [
        { user_id: ME_ID, name: "Yo", role, joined_at: "2026-10-01T10:00:00Z", you: true },
        { user_id: 8, name: "Beto", role: "editor", joined_at: "2026-10-02T10:00:00Z", you: false },
        { user_id: 9, name: "Cami", role: "admin", joined_at: "2026-10-03T10:00:00Z", you: false },
      ],
      invitations: [{ id: "i9", household_id: H, household_name: "Casa", role: "viewer", status: "pending", invited_by: "Yo", invitee: "Dani", expires_at: "2026-12-01T10:00:00Z" }],
      ...over,
    },
  });
  it("crear un hogar lleva Idempotency-Key y pasa a verlo", async () => {
    const m = await mount(<HouseholdsScreen />, { [`GET ${API}/households`]: { status: 200, json: { households: [], invitations: [] } }, [`POST ${API}/households`]: { status: 201, json: hh("owner") } });
    expect(m.visible()).toContain(es.fin.hh.list.emptyTitle);
    click(byText(m.host, "button", es.fin.hh.list.create));
    await wait();
    typeInto(m.host.querySelector<HTMLInputElement>("dialog input")!, "Casa");
    click(byText(m.host, "dialog button[type=submit]", es.fin.hh.list.create));
    await wait();
    const post = m.mock.calls.find((c) => c.method === "POST")!;
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(post.body).toEqual({ name: "Casa" });
    expect(getScope()).toEqual({ kind: "household", id: H });
  });
  it("el propietario ve miembros con roles, invitaciones pendientes y puede ceder o borrar; no «salir»", async () => {
    const m = await mount(<HouseholdScreen id={H} />, { [`GET ${API}/households/${H}`]: detail("owner") });
    for (const text of ["Yo", "Beto", "Cami", "Propietario", "Administrador", "Editor", "Dani"]) expect(m.visible()).toContain(text);
    expect(hasControl(m, es.fin.hh.detail.transfer)).toBe(true);
    expect(hasControl(m, es.fin.hh.detail.delete)).toBe(true);
    // el propietario no «sale»: cede la propiedad o borra
    expect(hasControl(m, es.fin.hh.detail.leave)).toBe(false);
  });
  it("invitar por correo siempre responde igual y no confirma si existe", async () => {
    const m = await mount(<HouseholdScreen id={H} />, { [`GET ${API}/households/${H}`]: detail("owner"), [`POST ${API}/households/${H}/invitations`]: { status: 202, json: { status: "sent" } } });
    typeInto(m.host.querySelector<HTMLInputElement>("input[type=email]")!, "dani@example.com");
    click(byText(m.host, "button[type=submit]", es.fin.hh.detail.inviteSend));
    await wait();
    const post = m.mock.calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ email: "dani@example.com", role: "viewer" });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(m.text()).toContain("No confirmamos qué correos tienen cuenta");
  });
  it("un administrador no puede cambiar ni quitar a otro administrador ni ceder la propiedad", async () => {
    const m = await mount(<HouseholdScreen id={H} />, { [`GET ${API}/households/${H}`]: detail("admin") });
    const cami = [...m.host.querySelectorAll(".hh-member")].find((el) => el.textContent?.includes("Cami"))!;
    expect(cami.querySelector("select")).toBeNull();
    expect(cami.textContent).not.toContain(es.fin.hh.detail.remove);
    const beto = [...m.host.querySelectorAll(".hh-member")].find((el) => el.textContent?.includes("Beto"))!;
    expect(beto.querySelector("select")).not.toBeNull();
    expect(hasControl(m, es.fin.hh.detail.transfer)).toBe(false);
    expect(hasControl(m, es.fin.hh.detail.delete)).toBe(false);
    expect(hasControl(m, es.fin.hh.detail.leave)).toBe(true);
  });
  it("un visor solo ve: sin invitar, sin cambiar roles", async () => {
    const m = await mount(<HouseholdScreen id={H} />, { [`GET ${API}/households/${H}`]: detail("viewer", { invitations: [] }) });
    expect(m.host.querySelector("input[type=email]")).toBeNull();
    expect(m.host.querySelector(".hh-member select")).toBeNull();
    expect(hasControl(m, es.fin.hh.detail.leave)).toBe(true);
  });
  it("cambiar el rol de un miembro hace PATCH con el rol", async () => {
    const m = await mount(<HouseholdScreen id={H} />, { [`GET ${API}/households/${H}`]: detail("owner"), [`PATCH ${API}/households/${H}/members/8`]: { status: 200, json: {} }, [`GET ${API}/households`]: list("owner") });
    const beto = [...m.host.querySelectorAll(".hh-member")].find((el) => el.textContent?.includes("Beto"))!;
    typeInto(beto.querySelector("select")!, "viewer");
    click(byText(beto, "button", es.fin.hh.detail.saveRole));
    await wait();
    const patch = m.mock.calls.find((c) => c.method === "PATCH")!;
    expect(patch.body).toEqual({ role: "viewer" });
  });
  it("borrar explica el borrado criptográfico y exige escribir el nombre", async () => {
    const m = await mount(<HouseholdScreen id={H} />, { [`GET ${API}/households/${H}`]: detail("owner"), [`POST ${API}/households/${H}/delete`]: { status: 204 }, [`GET ${API}/households`]: { status: 200, json: { households: [], invitations: [] } } });
    const open = [...m.host.querySelectorAll("button")].find((b) => b.className.includes("button--danger") && b.textContent === es.fin.hh.detail.delete)!;
    click(open);
    await wait();
    expect(m.text()).toContain("crypto-shredding");
    expect(m.text()).toContain(es.fin.hh.detail.deleteWarn);
    const confirm = byText<HTMLButtonElement>(m.host, "dialog button[type=submit]", es.fin.hh.detail.deleteConfirm);
    expect(confirm.disabled).toBe(true);
    typeInto(m.host.querySelector<HTMLInputElement>("dialog input")!, "Casa");
    expect(confirm.disabled).toBe(false);
    click(confirm);
    await wait();
    const post = m.mock.calls.find((c) => c.url.endsWith("/delete"))!;
    expect(post.body).toEqual({ confirm: "delete" });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
  });
  it("muestra que la llave se está cambiando", async () => {
    const m = await mount(<HouseholdScreen id={H} />, { [`GET ${API}/households/${H}`]: detail("owner", { rotating: true }) });
    expect(m.visible()).toContain(es.fin.hh.detail.rotatingTitle);
  });
  it("un hogar que no es mío da 404 explicado", async () => {
    const m = await mount(<HouseholdScreen id={H} />, { [`GET ${API}/households/${H}`]: { status: 404, json: { code: "household_not_found", detail: "x" } } });
    expect(m.visible()).toContain(es.fin.hh.detail.notFound);
  });
  it("aceptar una invitación la responde y refresca los hogares", async () => {
    const inv = { id: "i1", household_id: H, household_name: "Casa", role: "editor", status: "pending", invited_by: "Ana", expires_at: "2026-12-01T10:00:00Z" };
    let calls = 0;
    const m = await mount(<InvitationsScreen />, {
      [`GET ${API}/households`]: () => ({ status: 200, json: calls++ === 0 ? { households: [], invitations: [inv] } : { households: [hh("editor")], invitations: [] } }),
      [`POST ${API}/household-invitations/i1/accept`]: { status: 200, json: {} },
    });
    expect(m.visible()).toContain("Casa");
    expect(m.visible()).toContain("Te invitó Ana");
    click(byText(m.host, "button", es.fin.hh.invitations.accept));
    await wait();
    expect(m.mock.calls.find((c) => c.method === "POST")!.headers.get("Idempotency-Key")).toBeTruthy();
    expect(m.visible()).toContain("Entraste al hogar Casa");
    expect(m.visible()).toContain(es.fin.hh.invitations.emptyTitle);
  });
  it("rechazar una invitación", async () => {
    const inv = { id: "i1", household_id: H, household_name: "Casa", role: "viewer", status: "pending", invited_by: null, expires_at: "2026-12-01T10:00:00Z" };
    const m = await mount(<InvitationsScreen />, { [`GET ${API}/households`]: { status: 200, json: { households: [], invitations: [inv] } }, [`POST ${API}/household-invitations/i1/decline`]: { status: 200, json: {} } });
    click(byText(m.host, "button", es.fin.hh.invitations.decline));
    await wait();
    expect(m.visible()).toContain(es.fin.hh.invitations.declined);
  });
});

describe("pasar una cuenta al hogar: los bloqueos del servidor", () => {
  const acct = account("p1", "Mi ahorro") as never;
  async function share(reply: { status: number; json?: unknown }) {
    const m = await mount(<ShareAccountDialog open account={acct} onClose={() => undefined} onDone={() => undefined} />, { [`GET ${API}/households`]: list("editor"), [`POST ${API}/accounts/p1/share`]: reply });
    await act(async () => undefined);
    click(byText(m.host, "dialog button[type=submit]", es.fin.hh.share.confirm));
    await wait();
    return m;
  }
  it("envía el hogar en el cuerpo con Idempotency-Key", async () => {
    const m = await share({ status: 200, json: { id: "p1", scope: "household" } });
    const post = m.mock.calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe(`${API}/accounts/p1/share`);
    expect(post.body).toEqual({ household_id: H });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
  });
  it("pending_entries: confirmar o descartar los pendientes primero, con enlace a verlos", async () => {
    const m = await share({ status: 409, json: { code: "pending_entries", detail: "pending entries" } });
    expect(m.text()).toContain(es.fin.hh.share.blockers.pending_entries);
    expect(m.text()).toContain(es.fin.hh.share.goPending);
  });
  it("linked_transfers: anular el traslado primero", async () => {
    const m = await share({ status: 409, json: { code: "linked_transfers", detail: "x" } });
    expect(m.text()).toContain(es.fin.hh.share.blockers.linked_transfers);
    expect(m.text()).toContain(es.fin.hh.share.goTransfers);
  });
  it("account_in_use: nombra cada módulo personal que la usa", async () => {
    const m = await share({ status: 409, json: { code: "account_in_use", detail: "finance_reconcile.reconciliation, finance_recurring.recurrence, finance_planning.budget, finance_planning.goal, finance_imports.importbatch" } });
    const text = m.text();
    expect(text).toContain(es.fin.hh.share.blockers.account_in_use);
    for (const label of ["Conciliaciones", "Recurrencias", "Presupuestos", "Metas", "Importaciones"]) expect(text).toContain(label);
  });
  it("reconciled_entries", async () => {
    const m = await share({ status: 409, json: { code: "reconciled_entries", detail: "x" } });
    expect(m.text()).toContain(es.fin.hh.share.blockers.reconciled_entries);
  });
  it("un visor recibe 403 household_read_only explicado", async () => {
    const m = await share({ status: 403, json: { code: "household_read_only", detail: "x" } });
    expect(m.text()).toContain(es.fin.hh.share.blockers.household_read_only);
  });
});

describe("traslados entre Personal y Hogar", () => {
  const routes = {
    [`GET ${API}/accounts?page_size=100`]: page([account("p1", "Mi ahorro")]),
    [`GET ${API}/households/${H}/accounts?page_size=100`]: page([account("a1", "Ahorros Casa")]),
    [`GET ${API}/households`]: list("editor"),
  };
  it("pide las dos listas por su ruta propia y envía el traslado con Idempotency-Key", async () => {
    setScope({ kind: "household", id: H }); // aunque se esté en el hogar, la lista personal es la personal
    const m = await mount(<CrossTransferDialog open householdId={H} onClose={() => undefined} />, { ...routes, [`POST ${API}/households/${H}/cross-transfers`]: { status: 201, json: { group: "g1", personal_movement_id: "pm1", household_movement_id: "hm1" } } });
    expect(urls(m)).toContain(`GET ${API}/accounts?page_size=100`);
    typeInto(m.host.querySelector<HTMLInputElement>("dialog input[inputmode=decimal]")!, "180000");
    click(byText(m.host, "dialog button[type=submit]", es.fin.hh.cross.submit));
    await wait();
    const post = m.mock.calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe(`${API}/households/${H}/cross-transfers`);
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(post.body).toMatchObject({ personal_account_id: "p1", household_account_id: "a1", direction: "to_household", amount: "180000" });
    expect(m.text()).toContain(es.fin.hh.cross.done);
  });
  it("sin una cuenta en cada ámbito lo dice, sin formulario muerto", async () => {
    const m = await mount(<CrossTransferDialog open householdId={H} onClose={() => undefined} />, { ...routes, [`GET ${API}/households/${H}/accounts?page_size=100`]: page([]) });
    expect(m.text()).toContain(es.fin.hh.cross.needAccounts);
    expect(m.host.querySelector("dialog form")).toBeNull();
  });
  it("un traslado de esta sesión se anula desde su movimiento, con motivo", async () => {
    setScope({ kind: "household", id: H });
    rememberTransfer({ group: "g1", householdId: H, personalMovementId: "pm1", householdMovementId: "m1" });
    const m = await mount(<MovementDetail id="m1" />, {
      [`GET ${API}/households`]: list("editor"),
      [`GET ${API}/households/${H}/movements/m1`]: { status: 200, json: movement({ origin: "household_transfer" }) },
      [`POST ${API}/households/${H}/cross-transfers/g1/annul`]: { status: 204 },
    });
    click(byText(m.host, "button", es.fin.hh.cross.annul));
    await wait();
    typeInto(m.host.querySelector<HTMLTextAreaElement>("dialog textarea")!, "Error de digitación");
    click(byText(m.host, "dialog button[type=submit]", es.fin.hh.cross.annul));
    await wait();
    const post = m.mock.calls.find((c) => c.url.endsWith("/annul"))!;
    expect(post.body).toEqual({ reason: "Error de digitación" });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
  });
});

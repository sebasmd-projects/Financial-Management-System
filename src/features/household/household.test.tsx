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
  account: { id: "a1", name: "Ahorros Casa" }, to_account: null, refund_of_id: null, replaces_id: null, gmf: null, entry_id: "e1", entry_number: 1, attachments: 0, installment_plan: null, warnings: [], split_group: null, linked_transfer: null, ...over,
});

let mounted: Mounted | null = null;
async function mount(element: ReactElement, routes: Record<string, MockReply>) {
  mounted = await mountScreen(element, routes);
  return mounted;
}
beforeEach(() => {
  resetHouseholdState();
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
  it("la mitad de un traslado entre ámbitos no se anula ni se ajusta sola: ofrece anular el traslado", async () => {
    setScope({ kind: "household", id: H });
    const m = await mount(<MovementDetail id="m1" />, { ...search("editor"), [`GET ${API}/households/${H}/movements/m1`]: { status: 200, json: movement({ origin: "household_transfer", split_group: "g1", linked_transfer: { group: "g1" } }) } });
    expect(controls(m)).not.toContain(es.fin.detail.annul);
    expect(controls(m)).not.toContain(es.fin.detail.adjust);
    expect(controls(m)).toContain(es.fin.hh.cross.annul);
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
  it("el propietario renombra el hogar con PATCH e Idempotency-Key; el visor y el editor no ven el formulario", async () => {
    const m = await mount(<HouseholdScreen id={H} />, { [`GET ${API}/households/${H}`]: detail("owner"), [`GET ${API}/households`]: list("owner"), [`PATCH ${API}/households/${H}`]: { status: 200, json: hh("owner", { name: "Casa Nueva" }) } });
    const input = m.host.querySelector<HTMLInputElement>(`input[value="Casa"]`)!;
    typeInto(input, "Casa Nueva");
    click(byText(m.host, "button", es.fin.hh.detail.renameSave));
    await wait();
    const patch = m.mock.calls.find((c) => c.method === "PATCH" && c.url === `${API}/households/${H}`)!;
    expect(patch.body).toEqual({ name: "Casa Nueva" });
    expect(patch.headers.get("Idempotency-Key")).toBeTruthy();
    expect(m.visible()).toContain(es.fin.hh.detail.renamed);
    for (const role of ["editor", "viewer"]) {
      const other = await mountScreen(<HouseholdScreen id={H} />, { [`GET ${API}/households/${H}`]: detail(role) });
      expect(hasControl(other, es.fin.hh.detail.renameSave)).toBe(false);
      other.unmount();
    }
  });
  it("un 403 al renombrar se explica", async () => {
    const m = await mount(<HouseholdScreen id={H} />, { [`GET ${API}/households/${H}`]: detail("admin"), [`GET ${API}/households`]: list("admin"), [`PATCH ${API}/households/${H}`]: { status: 403, json: { code: "household_manage_forbidden", detail: "x" } } });
    typeInto(m.host.querySelector<HTMLInputElement>(`input[value="Casa"]`)!, "Otra");
    click(byText(m.host, "button", es.fin.hh.detail.renameSave));
    await wait();
    expect(m.visible()).toContain(es.fin.errors.household_manage_forbidden);
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
  const blocked = (code: string, blockers: { kind: string; count: number }[]) => ({ status: 409, json: { code, detail: "x", blockers } });
  it("pending_entries: un mensaje con su cuenta y enlace a verlos", async () => {
    const m = await share(blocked("pending_entries", [{ kind: "pending_entry", count: 2 }]));
    expect(m.text()).toContain("Tiene movimientos pendientes (2)");
    expect(m.text()).toContain(es.fin.hh.share.go.pending_entry);
  });
  it("linked_transfers: anular el traslado primero", async () => {
    const m = await share(blocked("linked_transfers", [{ kind: "linked_transfer", count: 1 }]));
    expect(m.text()).toContain("traslados vigentes entre Personal y Hogar (1)");
    expect(m.text()).toContain(es.fin.hh.share.go.linked_transfer);
  });
  it("account_in_use: un mensaje y un enlace por cada tipo, sin interpretar el texto del detalle", async () => {
    const kinds = ["reconciliation", "recurrence", "budget", "goal", "import", "credit", "asset", "category"] as const;
    const m = await share(blocked("account_in_use", kinds.map((kind, i) => ({ kind, count: i + 1 }))));
    const items = [...m.host.querySelectorAll(".hh-blocker li")];
    expect(items).toHaveLength(kinds.length);
    kinds.forEach((kind, i) => {
      expect(items[i].textContent).toContain(`(${i + 1})`);
      expect(items[i].textContent).toContain(es.fin.hh.share.go[kind]);
      expect(items[i].querySelector("a")).not.toBeNull();
    });
  });
  it("reconciled_entries y account_not_movable", async () => {
    let m = await share(blocked("reconciled_entries", [{ kind: "reconciled_entry", count: 3 }]));
    expect(m.text()).toContain("movimientos conciliados (3)");
    m.unmount();
    m = mounted = await share(blocked("account_not_movable", [{ kind: "child_account", count: 1 }, { kind: "system_account", count: 1 }]));
    expect(m.text()).toContain(es.fin.hh.share.kinds.child_account);
    expect(m.text()).toContain(es.fin.hh.share.kinds.system_account);
  });
  it("sin lista de bloqueos (servidor viejo) explica el código", async () => {
    const m = await share({ status: 409, json: { code: "pending_entries", detail: "x" } });
    expect(m.text()).toContain(es.fin.hh.share.blockers.pending_entries);
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
  async function annulFrom(m: Mounted) {
    click(byText(m.host, "button", es.fin.hh.cross.annul));
    await wait();
    typeInto(m.host.querySelector<HTMLTextAreaElement>("dialog textarea")!, "Error de digitación");
    click(byText(m.host, "dialog button[type=submit]", es.fin.hh.cross.annul));
    await wait();
  }
  it("un traslado se anula desde su movimiento con el grupo que trae el servidor, sin haberlo creado en esta sesión", async () => {
    setScope({ kind: "household", id: H });
    const m = await mount(<MovementDetail id="m1" />, {
      [`GET ${API}/households`]: list("editor"),
      [`GET ${API}/households/${H}/movements/m1`]: { status: 200, json: movement({ origin: "household_transfer", split_group: "g1", linked_transfer: { group: "g1" } }) },
      [`POST ${API}/households/${H}/cross-transfers/g1/annul`]: { status: 204 },
    });
    await annulFrom(m);
    const post = m.mock.calls.find((c) => c.url.endsWith("/annul"))!;
    expect(post.body).toEqual({ reason: "Error de digitación" });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
  });
  it("desde el ámbito Personal usa el único hogar donde se puede escribir", async () => {
    const m = await mount(<MovementDetail id="m1" />, {
      [`GET ${API}/households`]: list("editor"),
      [`GET ${API}/movements/m1`]: { status: 200, json: movement({ origin: "household_transfer", split_group: "g2", linked_transfer: { group: "g2" } }) },
      [`POST ${API}/households/${H}/cross-transfers/g2/annul`]: { status: 204 },
    });
    await annulFrom(m);
    expect(m.mock.calls.some((c) => c.method === "POST" && c.url === `${API}/households/${H}/cross-transfers/g2/annul`)).toBe(true);
  });
  it("con varios hogares en Personal pregunta cuál", async () => {
    const H2 = "7b0a6f0e-0000-4000-8000-000000000002";
    const m = await mount(<MovementDetail id="m1" />, {
      [`GET ${API}/households`]: { status: 200, json: { households: [hh("editor"), { ...hh("owner"), id: H2, name: "Finca" }], invitations: [] } },
      [`GET ${API}/movements/m1`]: { status: 200, json: movement({ origin: "household_transfer", split_group: "g3", linked_transfer: { group: "g3" } }) },
      [`POST ${API}/households/${H2}/cross-transfers/g3/annul`]: { status: 204 },
    });
    click(byText(m.host, "button", es.fin.hh.cross.annul));
    await wait();
    typeInto(m.host.querySelector<HTMLSelectElement>("dialog select")!, H2);
    typeInto(m.host.querySelector<HTMLTextAreaElement>("dialog textarea")!, "Duplicado");
    click(byText(m.host, "dialog button[type=submit]", es.fin.hh.cross.annul));
    await wait();
    expect(m.mock.calls.some((c) => c.method === "POST" && c.url === `${API}/households/${H2}/cross-transfers/g3/annul`)).toBe(true);
  });
  it("una cuenta pasada al hogar (split_group sin traslado) no ofrece anular traslado", async () => {
    setScope({ kind: "household", id: H });
    const m = await mount(<MovementDetail id="m1" />, { [`GET ${API}/households`]: list("editor"), [`GET ${API}/households/${H}/movements/m1`]: { status: 200, json: movement({ split_group: "g9" }) } });
    expect(controls(m)).not.toContain(es.fin.hh.cross.annul);
    expect(controls(m)).toContain(es.fin.detail.annul);
  });
});

describe("editar un movimiento confirmado del hogar", () => {
  const EFFECTS = { mode: "adjustment", changed_fields: ["amount"], chained: [], entries_annulled: [], entries_created: [], balances: [], spent: [], gmf: { before: null, after: null }, installments: null, notes: [] };
  const base = {
    [`GET ${API}/households`]: list("editor"),
    [`GET ${API}/households/${H}/movements/m1`]: { status: 200, json: movement() },
    [`GET ${API}/households/${H}/accounts?page_size=100`]: page([account("a1", "Ahorros Casa")]),
  };
  async function openEdit(routes: Record<string, MockReply>) {
    setScope({ kind: "household", id: H });
    const m = await mount(<MovementDetail id="m1" />, { ...base, ...routes });
    click(byText(m.host, "button", es.fin.detail.edit));
    await wait();
    return m;
  }
  const submitEdit = async (m: Mounted) => {
    typeInto(m.host.querySelector<HTMLInputElement>("dialog input[inputmode=decimal]")!, "50000");
    click(byText(m.host, "dialog button[type=submit]", es.fin.edit.preview));
    await wait();
  };
  it("el monto ya no está bloqueado: pide la vista previa del hogar y aplica con el token", async () => {
    const m = await openEdit({
      [`POST ${API}/households/${H}/movements/m1/edit/preview`]: { status: 200, json: { token: "tok-1", expires_at: "2026-11-10T19:32:00Z", version: "v1", effects: EFFECTS } },
      [`POST ${API}/households/${H}/movements/m1/edit/apply`]: { status: 200, json: { movement: movement({ id: "m2" }), effects: EFFECTS } },
    });
    await submitEdit(m);
    const preview = m.mock.calls.find((c) => c.url.endsWith("/edit/preview"))!;
    expect(preview.body).toMatchObject({ amount: "50000" });
    expect(preview.headers.get("Idempotency-Key")).toBeTruthy();
    expect(m.host.querySelector('[data-testid="edit-mode"]')?.textContent).toContain("asiento de ajuste");
    typeInto(m.host.querySelector<HTMLTextAreaElement>("dialog textarea")!, "Corrección");
    click(byText(m.host, "dialog button[type=submit]", es.fin.edit.apply));
    await wait();
    const apply = m.mock.calls.find((c) => c.url.endsWith("/edit/apply"))!;
    expect(apply.url).toBe(`${API}/households/${H}/movements/m1/edit/apply`);
    expect(apply.body).toEqual({ token: "tok-1", reason: "Corrección" });
    expect(apply.headers.get("Idempotency-Key")).toBeTruthy();
  });
  it("409 linked_entry: dice que se anula el traslado y se registra de nuevo", async () => {
    const m = await openEdit({ [`POST ${API}/households/${H}/movements/m1/edit/preview`]: { status: 409, json: { code: "linked_entry", detail: "x" } } });
    await submitEdit(m);
    expect(m.text()).toContain(es.fin.errors.linked_entry);
    expect(es.fin.errors.linked_entry).toContain("vuelve a registrarlo");
    expect(m.host.querySelector('[data-testid="edit-mode"]')).toBeNull();
  });
});
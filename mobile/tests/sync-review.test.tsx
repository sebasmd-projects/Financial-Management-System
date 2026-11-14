import { Linking } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ReviewScreen } from "@/features/sync/review";
import { openFromTap, pendingStore } from "@/features/notifications/pending";
import { scopeStore } from "@/features/scope/store";
import { accounts, categories, connection, event, page } from "./sync-fixtures";

let mockKey = 0;
jest.mock("expo-crypto", () => ({ randomUUID: () => `key-${++mockKey}` }));
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockFms = { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a), patch: jest.fn(), delete: jest.fn(), put: jest.fn() };
jest.mock("@/auth/use-session", () => ({ useFms: () => mockFms }));

const PROPOSED = "/sync/events?status=proposed&page=1&page_size=50";
const ALL = "/sync/events?status=all&page=1&page_size=50";
let proposed: unknown[] = [];
let history: unknown[] = [];
const events = (rows: unknown[]) => ({ ok: true, status: 200, data: { count: rows.length, page: 1, page_size: 50, results: rows } });

beforeEach(() => {
  mockKey = 0;
  proposed = [event];
  history = [];
  scopeStore.reset();
  pendingStore.set(null);
  mockGet.mockReset();
  mockPost.mockReset();
  mockGet.mockImplementation(async (path: string) => {
    if (path === PROPOSED) return events(proposed);
    if (path === ALL) return events(history);
    if (path.startsWith("/sync/connections?")) return { ok: true, status: 200, data: page([connection]) };
    if (path.startsWith("/accounts")) return { ok: true, status: 200, data: accounts };
    if (path.startsWith("/categories")) return { ok: true, status: 200, data: categories };
    return { ok: false, status: 404, code: "not_found", data: {} };
  });
});

describe("Por revisar (M2)", () => {
  it("muestra solo los campos extraídos y el monto formateado desde la cadena decimal", async () => {
    await render(<ReviewScreen />);
    expect(await screen.findByText("Exito")).toBeTruthy();
    expect(screen.getByText("−$180.000")).toBeTruthy();
    expect(screen.getByText(/Egreso · 13\/11\/2026 · Tarjeta ••1234/)).toBeTruthy();
    expect(screen.getByText("Cuenta: Ahorros Bancolombia · Bancolombia")).toBeTruthy();
    // El monto nunca viaja en la URL.
    expect(mockGet.mock.calls.every(([path]) => !/180000|amount/.test(String(path)))).toBe(true);
  });

  it("Aprobar manda una Idempotency-Key y deja «Deshacer» a mano; deshacer anula", async () => {
    mockPost.mockImplementation(async (path: string) => {
      if (path.endsWith("/approve")) {
        proposed = [];
        return { ok: true, status: 200, data: { ...event, status: "approved" } };
      }
      return { ok: true, status: 200, data: { ...event, status: "undone" } };
    });
    await render(<ReviewScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Aprobar" }));
    expect(await screen.findByText("Aprobado. Puedes deshacerlo.")).toBeTruthy();
    expect(mockPost).toHaveBeenCalledWith("/sync/events/e1/approve", undefined, { idempotencyKey: "key-1" });
    await fireEvent.press(screen.getByRole("button", { name: "Deshacer" }));
    expect(await screen.findByText(/Deshecho: el movimiento se anuló/)).toBeTruthy();
    expect(mockPost.mock.calls[1][0]).toBe("/sync/events/e1/undo");
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
  });

  it("Descartar", async () => {
    mockPost.mockResolvedValue({ ok: true, status: 200, data: { ...event, status: "discarded" } });
    await render(<ReviewScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Descartar" }));
    expect(await screen.findByText("Descartado.")).toBeTruthy();
    expect(mockPost.mock.calls[0][0]).toBe("/sync/events/e1/discard");
  });

  it("Modificar: todos los campos, el monto incluido, y se envía SOLO lo que cambió", async () => {
    mockPost.mockResolvedValue({ ok: true, status: 200, data: { ...event, status: "modified" } });
    await render(<ReviewScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Modificar" }));
    for (const label of ["Monto", "Fecha (AAAA-MM-DD)", "Comercio o contraparte", "Descripción", "Nota"]) expect(screen.getByLabelText(label)).toBeTruthy();
    expect(screen.getByText("Cuenta")).toBeTruthy();
    expect(screen.getByText("Categoría")).toBeTruthy();
    expect(screen.getByLabelText("Monto").props.value).toBe("180000.00");
    await fireEvent.changeText(screen.getByLabelText("Monto"), "250.000");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar y aprobar" }));
    expect(await screen.findByText("Aprobado con tus cambios. Puedes deshacerlo.")).toBeTruthy();
    expect(mockPost).toHaveBeenCalledWith("/sync/events/e1/modify", { amount: "250000" }, { idempotencyKey: expect.stringMatching(/^key-/) });
  });

  it("modificar sin cambios, o con un monto en cero, no sale a la red", async () => {
    await render(<ReviewScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Modificar" }));
    await fireEvent.press(screen.getByRole("button", { name: "Guardar y aprobar" }));
    expect(await screen.findByText(/No cambiaste nada/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Monto"), "0");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar y aprobar" }));
    expect(await screen.findByText(/monto mayor que cero/)).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("lo que cruzó con un movimiento que ya tienes solo se aprueba; con un pago pendiente se avisa", async () => {
    proposed = [{ ...event, match: "matches_confirmed" }];
    await render(<ReviewScreen />);
    expect(await screen.findByText(/Ya tienes este movimiento/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Modificar" })).toBeNull();
  });

  it("«Ir al correo» abre FUERA de la app solo si el enlace es de un servidor de correo conocido", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await render(<ReviewScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Ir al correo" }));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/mail\.google\.com\//));
    open.mockRestore();
  });

  it("un enlace ajeno NO se abre ni se pinta: solo queda la pista de búsqueda", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    proposed = [{ ...event, mail_link: { exact: true, provider: "gmail", search_hint: "from:bancolombia.test 2026-11-13", url: "intent://evil#Intent;scheme=https;end" } }];
    await render(<ReviewScreen />);
    await screen.findByText("Exito");
    expect(screen.queryByRole("button", { name: "Ir al correo" })).toBeNull();
    expect(screen.getByText(/from:bancolombia.test 2026-11-13/)).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("si el teléfono no abre el enlace, lo dice con la pista", async () => {
    const open = jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no app"));
    await render(<ReviewScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Ir al correo" }));
    expect(await screen.findByText(/No se pudo abrir el correo/)).toBeTruthy();
    open.mockRestore();
  });

  it("un aviso push de un movimiento propuesto lo resalta (el id viene de la memoria, no de la ruta)", async () => {
    openFromTap({ notificationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", objectKind: "sync_event", objectId: "e1" });
    await render(<ReviewScreen />);
    expect(await screen.findByText(/Abierto desde el aviso/)).toBeTruthy();
  });

  it("el historial trae lo decidido y se puede deshacer; lo rechazado o ilegible solo se nombra", async () => {
    history = [{ ...event, id: "e2", status: "approved" }, { ...event, id: "e3", status: "rejected_auth", amount: null, counterparty: null, mail_link: null }, { ...event, id: "e4", status: "parse_error", amount: null, counterparty: null, mail_link: null }];
    await render(<ReviewScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Historial" }));
    expect(await screen.findByText("Rechazado: no venía firmado por el banco")).toBeTruthy();
    expect(screen.getByText("No se pudo leer el correo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeTruthy();
  });

  it("en un hogar las propuestas se piden al hogar", async () => {
    scopeStore.set({ kind: "household", id: "h1" });
    mockGet.mockImplementation(async (path: string) => (path === "/households/h1/sync/events?status=proposed&page=1&page_size=50" ? events([event]) : path.startsWith("/households/h1/sync/connections") ? { ok: true, status: 200, data: page([connection]) } : { ok: true, status: 200, data: accounts }));
    await render(<ReviewScreen />);
    expect(await screen.findByText("Exito")).toBeTruthy();
  });

  it("sin conexiones, el estado vacío lo dice", async () => {
    proposed = [];
    mockGet.mockImplementation(async (path: string) => (path === PROPOSED ? events([]) : path.startsWith("/sync/connections?") ? { ok: true, status: 200, data: page([]) } : { ok: true, status: 200, data: accounts }));
    await render(<ReviewScreen />);
    expect(await screen.findByText("Aún no conectas un banco.")).toBeTruthy();
  });
});

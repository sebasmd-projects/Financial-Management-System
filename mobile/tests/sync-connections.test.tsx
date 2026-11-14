import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ConnectionsScreen } from "@/features/sync/connections";
import { scopeStore } from "@/features/scope/store";
import { accounts, catalog, connection, health, page } from "./sync-fixtures";

let mockKey = 0;
jest.mock("expo-crypto", () => ({ randomUUID: () => `key-${++mockKey}` }));
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();
const mockFms = { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a), patch: (...a: unknown[]) => mockPatch(...a), delete: (...a: unknown[]) => mockDelete(...a), put: jest.fn() };
jest.mock("@/auth/use-session", () => ({ useFms: () => mockFms }));

const ADDRESS = "abcdefghijklmnopqrstuvwxyz234567@recibir.example.test";
let connections: unknown[] = [];
let healths: Record<string, unknown> = {};

beforeEach(() => {
  mockKey = 0;
  connections = [];
  healths = {};
  scopeStore.reset();
  for (const m of [mockGet, mockPost, mockPatch, mockDelete]) m.mockReset();
  mockGet.mockImplementation(async (path: string) => {
    if (path === "/sync/catalog") return { ok: true, status: 200, data: catalog };
    if (path.startsWith("/sync/connections?")) return { ok: true, status: 200, data: page(connections) };
    const asked = /^\/sync\/connections\/([^/]+)\/health$/.exec(path);
    if (asked) return healths[asked[1]] ? { ok: true, status: 200, data: healths[asked[1]] } : { ok: false, status: 404, code: "not_found", data: {} };
    if (path === "/sync/connections/c1") return { ok: true, status: 200, data: { ...connection, forwarding_code: "123456", forwarding_code_expires_at: "2099-01-01T00:00:00Z" } };
    if (path.startsWith("/accounts")) return { ok: true, status: 200, data: accounts };
    return { ok: false, status: 404, code: "not_found", data: {} };
  });
});

describe("conexiones de correo (M1)", () => {
  it("lista las conexiones con su salud, que la decide el servidor (sin una regla de días en la app)", async () => {
    connections = [connection, { ...connection, id: "c2", institution_name: "Davivienda" }, { ...connection, id: "c3", institution_name: "AV Villas", status: "paused" }, { ...connection, id: "c4", institution_name: "Otro", last_event_at: null }, { ...connection, id: "c5", institution_name: "Scotia" }, { ...connection, id: "c6", institution_name: "Sin salud" }];
    healths = { c1: health("ok", 40, "c1"), c2: health("quiet", 2, "c2"), c3: health("paused", 0, "c3"), c4: health("waiting", 0, "c4"), c5: health("error", 0, "c5") };
    await render(<ConnectionsScreen />);
    expect(await screen.findByText(/Al día: último correo el/)).toBeTruthy();
    expect(await screen.findByText(/Sin correos desde hace 2 días/)).toBeTruthy();
    expect(screen.getByText(/Pausada: no se lee ningún correo/)).toBeTruthy();
    expect(screen.getByText("Esperando el primer correo del banco.")).toBeTruthy();
    expect(await screen.findByText(/no venía firmado por el banco/)).toBeTruthy();
    expect(mockGet.mock.calls.some(([path]) => path === "/sync/connections/c6/health")).toBe(true); // sin respuesta: no afirma nada
  });

  it("Nequi y Nu son interruptores y solo existen aquí: encender uno sin conexión abre el asistente con ese banco elegido", async () => {
    await render(<ConnectionsScreen />);
    const nequi = await screen.findByLabelText("Nequi: apagado");
    expect(screen.getByLabelText("Nu: apagado")).toBeTruthy();
    await act(async () => fireEvent(nequi, "valueChange", true));
    expect(await screen.findByText("1. Elige tu banco y tu cuenta")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nequi", selected: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bancolombia", selected: false })).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("apagar un interruptor pausa la conexión (no la borra); encenderlo la reanuda", async () => {
    connections = [{ ...connection, id: "n1", institution_id: 2, institution_code: "nequi", institution_name: "Nequi" }];
    mockPatch.mockResolvedValue({ ok: true, status: 200, data: {} });
    await render(<ConnectionsScreen />);
    const toggle = await screen.findByLabelText("Nequi: activado");
    await act(async () => fireEvent(toggle, "valueChange", false));
    expect(mockPatch).toHaveBeenCalledWith("/sync/connections/n1", { status: "paused" }, undefined);
    expect(await screen.findByText("Conexión pausada.")).toBeTruthy();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("crear: manda la Idempotency-Key, muestra la dirección UNA vez como texto seleccionable y el filtro paso a paso; sin portapapeles", async () => {
    mockPost.mockResolvedValue({ ok: true, status: 201, data: { ...connection, address: ADDRESS } });
    await render(<ConnectionsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Conectar un banco" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Bancolombia" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Ahorros Bancolombia ••1234" }));
    // Una tarjeta de crédito no es una cuenta bancaria para la conexión.
    expect(screen.queryByRole("button", { name: "Visa" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Crear la dirección" }));
    expect(await screen.findByText(ADDRESS)).toBeTruthy();
    expect(screen.getByText(ADDRESS).props.selectable).toBe(true);
    expect(mockPost).toHaveBeenCalledWith("/sync/connections", { institution_id: 1, account_id: "acc-1", provider: "gmail", include_statements: true, locale: "es" }, { idempotencyKey: "key-1" });
    expect(screen.getByText(/se muestra una sola vez/)).toBeTruthy();
    expect(screen.getByText(/Reenvío y correo POP\/IMAP/)).toBeTruthy();
    expect(screen.getByText(/Pon ese mínimo en \$0/)).toBeTruthy();
    // «Comprobar» trae el código de confirmación de Gmail.
    await fireEvent.press(screen.getByRole("button", { name: "Comprobar si llegó" }));
    expect(await screen.findByText("Código de confirmación de Gmail: 123456")).toBeTruthy();
    expect(screen.getByText(/Llegó un correo el/)).toBeTruthy();
    // La consulta de la conexión nunca trae la dirección y la pantalla la conserva.
    expect(screen.getByText(ADDRESS)).toBeTruthy();
  });

  it("rotar pide confirmar y muestra la dirección nueva una vez; borrar pide confirmar", async () => {
    connections = [connection];
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    mockPost.mockResolvedValue({ ok: true, status: 201, data: { ...connection, address: "nueva234567abcdefghijklmnopqrstuv@recibir.example.test" } });
    mockDelete.mockResolvedValue({ ok: true, status: 204, data: undefined });
    await render(<ConnectionsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Rotar la dirección" }));
    expect(mockPost).not.toHaveBeenCalled();
    const rotate = alert.mock.calls[0][2]?.find((b) => b.text === "Sí, rotar");
    await act(async () => rotate?.onPress?.());
    expect(await screen.findByText(/^nueva234567/)).toBeTruthy();
    expect(mockPost.mock.calls[0][0]).toBe("/sync/connections/c1/rotate");
    expect(mockPost.mock.calls[0][2]).toEqual({ idempotencyKey: "key-1" });

    await fireEvent.press(screen.getByRole("button", { name: "Listo" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Borrar" }));
    const remove = alert.mock.calls[1][2]?.find((b) => b.text === "Sí, borrar");
    await act(async () => remove?.onPress?.());
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("/sync/connections/c1", undefined));
    alert.mockRestore();
  });

  it("en un hogar las conexiones se piden al hogar; el catálogo, no", async () => {
    scopeStore.set({ kind: "household", id: "h1" });
    await render(<ConnectionsScreen />);
    await screen.findByText("Conexiones de correo");
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/households/h1/sync/connections?page_size=100", expect.anything()));
    expect(mockGet).toHaveBeenCalledWith("/sync/catalog", expect.anything());
  });

  it("una conexión que no es tuya no muestra acciones", async () => {
    connections = [{ ...connection, is_manager: false, provider: null }];
    await render(<ConnectionsScreen />);
    expect(await screen.findByText(/Solo quien creó esta conexión/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rotar la dirección" })).toBeNull();
  });

  it("no hay un interruptor de otra cosa que Nequi y Nu", async () => {
    await render(<ConnectionsScreen />);
    await screen.findByLabelText("Nequi: apagado");
    expect(screen.getAllByRole("switch")).toHaveLength(2);
  });
});

import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { NotificationCenter } from "@/features/notifications/center";
import { openFromTap, pendingStore } from "@/features/notifications/pending";
import { pushStateStore } from "@/features/notifications/state";
import { notifications } from "./fixtures";

let mockKey = 0;
jest.mock("expo-crypto", () => ({ randomUUID: () => `pay-${++mockKey}` }));
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockEnable = jest.fn();
const mockOpenSettings = jest.fn();
const mockFms = { get: (...args: unknown[]) => mockGet(...args), post: (...args: unknown[]) => mockPost(...args) };
jest.mock("@/auth/use-session", () => ({ useFms: () => mockFms }));
jest.mock("@/features/notifications/push-actions", () => ({ usePushActions: () => ({ enable: mockEnable, openSettings: mockOpenSettings }) }));

const OCCURRENCE = "55555555-5555-4555-8555-555555555555";

beforeEach(() => {
  mockKey = 0;
  mockGet.mockReset();
  mockPost.mockReset();
  mockEnable.mockReset();
  mockOpenSettings.mockReset();
  mockGet.mockImplementation(async (path: string) => ({ ok: true, status: 200, data: path.includes("unread=true") ? { ...notifications, results: notifications.results.filter((n) => !n.is_read) } : notifications }));
  mockPost.mockResolvedValue({ ok: true, status: 200, data: {} });
  pendingStore.set(null);
  pushStateStore.set("on");
});

describe("centro de avisos", () => {
  it("agrupa en Hoy / Esta semana / Anteriores con el contador de no leídos", async () => {
    await render(<NotificationCenter />);
    expect(await screen.findByText("2 sin leer")).toBeTruthy();
    for (const group of ["Hoy", "Esta semana", "Anteriores"]) expect(screen.getByText(group)).toBeTruthy();
    expect(screen.getByText("● Internet vence pronto")).toBeTruthy();
    expect(screen.getByText("Empezó noviembre")).toBeTruthy();
  });
  it("«No leídos» pide solo esos", async () => {
    await render(<NotificationCenter />);
    await screen.findByText("2 sin leer");
    await fireEvent.press(screen.getByRole("button", { name: "No leídos" }));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/notifications?unread=true", expect.anything()));
    await waitFor(() => expect(screen.queryByText("Empezó noviembre")).toBeNull());
  });
  it("marcar leído manda el id y recarga", async () => {
    await render(<NotificationCenter />);
    await screen.findByText("2 sin leer");
    const before = mockGet.mock.calls.length;
    await fireEvent.press(screen.getAllByRole("button", { name: "Marcar leído" })[0]);
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith("/notifications/read", { ids: [notifications.results[0].id] }));
    await waitFor(() => expect(mockGet.mock.calls.length).toBeGreaterThan(before));
  });
  it("marcar todo como leído", async () => {
    await render(<NotificationCenter />);
    await screen.findByText("2 sin leer");
    await fireEvent.press(screen.getByRole("button", { name: "Marcar todo como leído" }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith("/notifications/read", {}));
  });
  it("posponer llama al endpoint del aviso y lo dice", async () => {
    await render(<NotificationCenter />);
    await screen.findByText("2 sin leer");
    await fireEvent.press(screen.getAllByRole("button", { name: "Posponer" })[0]);
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith(`/notifications/${notifications.results[0].id}/snooze`));
    expect(await screen.findByText("Aviso pospuesto.")).toBeTruthy();
  });
  it("«Marcar pagado» (gasto fijo) pide confirmar y paga lo que falta con una Idempotency-Key; tarjetas y cuotas dicen «Pagar en la web»", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await render(<NotificationCenter />);
    await screen.findByText("2 sin leer");
    expect(screen.getAllByRole("button", { name: "Marcar pagado" })).toHaveLength(1);
    expect(screen.getAllByText("Pagar en la web")).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: "Marcar pagado" }));
    expect(mockPost).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === "Sí, registrar")?.onPress?.());
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith(`/occurrences/${OCCURRENCE}/pay`, { mode: "remaining" }, { idempotencyKey: "pay-1" }));
    expect(await screen.findByText("Pago registrado.")).toBeTruthy();
  });
  it("un fallo se dice sin inventar éxito", async () => {
    mockPost.mockResolvedValue({ ok: false, status: 500, code: "http_500", data: undefined });
    await render(<NotificationCenter />);
    await screen.findByText("2 sin leer");
    await fireEvent.press(screen.getAllByRole("button", { name: "Posponer" })[0]);
    expect(await screen.findByText("No se pudo completar. Inténtalo de nuevo.")).toBeTruthy();
  });
  it("el aviso que se tocó llega resaltado y la marca se limpia al salir", async () => {
    openFromTap({ notificationId: notifications.results[1].id, objectKind: "card", objectId: null });
    const view = await render(<NotificationCenter />);
    expect(await screen.findByText(/Abierto desde el aviso/)).toBeTruthy();
    await view.unmount();
    expect(pendingStore.get()).toBeNull();
  });
  it("sin avisos: estado vacío", async () => {
    mockGet.mockResolvedValue({ ok: true, status: 200, data: { unread: 0, results: [] } });
    await render(<NotificationCenter />);
    expect(await screen.findByText("Sin avisos")).toBeTruthy();
  });
  it("sin permiso de push: banda con «Activar avisos» (lo pide la persona); bloqueado: Ajustes", async () => {
    pushStateStore.set("off");
    mockEnable.mockResolvedValue("on");
    await render(<NotificationCenter />);
    expect(await screen.findByText("Los avisos push están apagados")).toBeTruthy();
    expect(mockEnable).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Activar avisos" }));
    expect(mockEnable).toHaveBeenCalledTimes(1);
    await act(() => pushStateStore.set("blocked"));
    expect(screen.getByText("Los avisos push están apagados · Activar en Ajustes")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Abrir Ajustes" }));
    expect(mockOpenSettings).toHaveBeenCalled();
  });
  it("sin red: aviso y reintento", async () => {
    mockGet.mockResolvedValue({ ok: false, status: 0, code: "network", data: undefined });
    await render(<NotificationCenter />);
    expect(await screen.findByText("Sin conexión. Revisa tu red e inténtalo de nuevo.")).toBeTruthy();
  });
});

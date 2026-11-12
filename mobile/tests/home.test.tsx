import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import Home from "@/app/(app)/(tabs)/home";
import { hiddenStore } from "@/features/common/hidden";
import { draftStore } from "@/features/quick-add/store";
import { householdsStore, scopeStore } from "@/features/scope/store";
import { accounts, dashboard, notifications } from "./fixtures";

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockGet = jest.fn();
const mockFms = { get: (...args: unknown[]) => mockGet(...args) };
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, navigate: mockNavigate }) }));
jest.mock("@/auth/use-session", () => ({
  usePhase: () => ({ name: "ready", me: { user: { display_name: "Ana" } } }),
  useFms: () => mockFms,
}));

const summary = { period: "2026-11-01", spent: "100.00", income: "300.00", available_today: "2000.00", owed: "50.00", installment_purchases: [] };

beforeEach(() => {
  mockPush.mockReset();
  mockNavigate.mockReset();
  mockGet.mockReset();
  mockGet.mockImplementation(async (path: string) => {
    if (path.startsWith("/dashboard") || path.startsWith("/households/h1/dashboard")) return { ok: true, status: 200, data: dashboard };
    if (path.startsWith("/summary")) return { ok: true, status: 200, data: summary };
    if (path.startsWith("/notifications")) return { ok: true, status: 200, data: notifications };
    return { ok: true, status: 200, data: accounts };
  });
});
afterEach(() =>
  act(() => {
    scopeStore.reset();
    householdsStore.reset();
    draftStore.reset();
    hiddenStore.reset();
  }),
);

describe("pantalla Resumen", () => {
  it("pide el tablero del periodo actual sin montos en la URL y lo pinta", async () => {
    await render(<Home />);
    expect(await screen.findByText("$1.840.000")).toBeTruthy();
    const urls = mockGet.mock.calls.map((call) => call[0] as string);
    expect(urls).toContain("/dashboard");
    expect(urls.every((url) => !/amount|balance|total/i.test(url))).toBe(true);
    expect(screen.getByLabelText("Avisos, 2 sin leer")).toBeTruthy();
  });
  it("un atajo guarda la plantilla EN MEMORIA y abre la hoja con una ruta literal, sin monto", async () => {
    await render(<Home />);
    await fireEvent.press(await screen.findByRole("button", { name: "Gasolina" }));
    expect(draftStore.get()).toEqual({ type: "expense", amount: "180000", description: "Gasolina", categoryId: "77777777-7777-4777-8777-777777777777", accountId: null });
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/quick-add");
  });
  it("el ojo oculta los montos y la campana abre los avisos", async () => {
    await render(<Home />);
    await screen.findByText("$1.840.000");
    await fireEvent.press(screen.getByRole("button", { name: "Ocultar montos" }));
    expect(screen.queryByText("$1.840.000")).toBeNull();
    expect(screen.getByRole("button", { name: "Mostrar montos" })).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Avisos, 2 sin leer"));
    expect(mockNavigate).toHaveBeenCalledWith("/notifications");
  });
  it("cambia de periodo y pide el anterior; «Volver a hoy» regresa", async () => {
    await render(<Home />);
    await screen.findByText("$1.840.000");
    await fireEvent.press(screen.getByRole("button", { name: "Periodo anterior" }));
    await waitFor(() => expect(mockGet.mock.calls.some((call) => /^\/dashboard\?period=\d{4}-\d{2}$/.test(call[0]))).toBe(true));
    await fireEvent.press(await screen.findByRole("button", { name: "Volver a hoy" }));
    expect(screen.queryByRole("button", { name: "Volver a hoy" })).toBeNull();
  });
  it("con un hogar aparece el selector; «Ambos» pide el consolidado, «Hogar» el tablero del hogar", async () => {
    householdsStore.set([{ id: "h1", name: "Casa", role: "owner", members: 2, rotating: false }]);
    await render(<Home />);
    await screen.findByText("$1.840.000");
    await fireEvent.press(screen.getByRole("button", { name: "Ambos · Casa" }));
    expect(await screen.findByText("Tus cifras personales y las del hogar, sumadas.")).toBeTruthy();
    expect(mockGet.mock.calls.map((c) => c[0])).toContain("/summary?scope=both&household_id=h1");
    expect(screen.getByText("$2.000")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Casa" }));
    await waitFor(() => expect(mockGet.mock.calls.map((c) => c[0])).toContain("/households/h1/dashboard"));
    await fireEvent.press(screen.getByRole("button", { name: "Personal" }));
  });
  it("si falla la red: aviso y «Reintentar», no cifras de mentira", async () => {
    mockGet.mockImplementation(async (path: string) => (path.startsWith("/dashboard") ? { ok: false, status: 0, code: "network", data: undefined } : { ok: true, status: 200, data: notifications }));
    await render(<Home />);
    expect(await screen.findByText("Sin conexión. Revisa tu red e inténtalo de nuevo.")).toBeTruthy();
    expect(screen.queryByText("$1.840.000")).toBeNull();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });
});

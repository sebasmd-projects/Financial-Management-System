import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QuickAddSheet } from "@/features/quick-add/sheet";
import { intents } from "@/features/quick-add/save";
import { draftStore, startQuickAdd } from "@/features/quick-add/store";
import { householdsStore, scopeStore } from "@/features/scope/store";
import { accounts, categories, emptyPage, movement } from "./fixtures";

let mockKeyCounter = 0;
jest.mock("expo-crypto", () => ({ randomUUID: () => `key-${++mockKeyCounter}` }));
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockFms = { get: (...args: unknown[]) => mockGet(...args), post: (...args: unknown[]) => mockPost(...args) };
jest.mock("@/auth/use-session", () => ({ useFms: () => mockFms }));

const created = { ok: true, status: 201, data: movement({ warnings: [] }) };

beforeEach(() => {
  mockKeyCounter = 0;
  mockGet.mockReset();
  mockPost.mockReset();
  mockGet.mockImplementation(async (path: string) => {
    if (path.includes("/accounts")) return { ok: true, status: 200, data: accounts };
    if (path.includes("/categories")) return { ok: true, status: 200, data: categories };
    if (path.includes("/movements")) return { ok: true, status: 200, data: { ...emptyPage, count: 1, results: [movement({ account: { id: accounts.results[1].id, name: "Visa Bancolombia" } })] } };
    return { ok: false, status: 404, code: "x", data: undefined };
  });
});
afterEach(() =>
  act(() => {
    draftStore.reset();
    scopeStore.reset();
    householdsStore.reset();
    intents.done();
  }),
);

const shortcut = () => startQuickAdd({ description: "Gasolina", amount: "180000", categoryId: categories.results[0].id });

describe("alta rápida en 2 toques", () => {
  it("atajo → «Guardar»: un solo POST con Idempotency-Key, el monto en el cuerpo y la fecha de Bogotá", async () => {
    mockPost.mockResolvedValue(created);
    shortcut();
    const onClose = jest.fn();
    await render(<QuickAddSheet onClose={onClose} />);
    expect(screen.getByText("$180.000")).toBeTruthy();
    expect(screen.getByText("Gasolina")).toBeTruthy();
    const save = await screen.findByRole("button", { name: "Guardar" });
    await waitFor(() => expect(save.props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(save);
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    const [path, body, options] = mockPost.mock.calls[0];
    expect(path).toBe("/movements");
    expect(path).not.toMatch(/\d{3}/);
    expect(body).toMatchObject({ type: "expense", amount: "180000", status: "confirmed", description: "Gasolina", category_id: categories.results[0].id });
    // El medio de pago por defecto es el del último movimiento (la tarjeta), no el primero de la lista.
    expect(body.account_id).toBe(accounts.results[1].id);
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(options).toEqual({ idempotencyKey: "key-1" });
    expect(await screen.findByText("Guardado.")).toBeTruthy();
    expect(draftStore.get()).not.toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Listo" }));
    expect(onClose).toHaveBeenCalled();
    expect(draftStore.get()).toBeNull();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("si falla, «Reintentar» reenvía con la MISMA Idempotency-Key; al lograrlo, otra intención usa otra clave", async () => {
    mockPost.mockResolvedValueOnce({ ok: false, status: 0, code: "network", data: undefined }).mockResolvedValue(created);
    shortcut();
    await render(<QuickAddSheet onClose={jest.fn()} />);
    await waitFor(async () => expect((await screen.findByRole("button", { name: "Guardar" })).props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("No hubo conexión. Si la petición llegó, no se duplicará: toca Reintentar.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByText("Guardado.");
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost.mock.calls[0][2]).toEqual({ idempotencyKey: "key-1" });
    expect(mockPost.mock.calls[1][2]).toEqual({ idempotencyKey: "key-1" });
    expect(mockPost.mock.calls[1][1]).toEqual(mockPost.mock.calls[0][1]);

    // Tras el éxito, un movimiento idéntico es una intención nueva: otra clave.
    await fireEvent.press(screen.getByRole("button", { name: "Agregar otro" }));
    for (const key of ["1", "8", "0", "0", "0", "0"]) await fireEvent.press(screen.getByRole("button", { name: key }));
    await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(3));
    expect(mockPost.mock.calls[2][2]).toEqual({ idempotencyKey: "key-2" });
  });

  it("si la persona cambia el monto antes de reintentar, es otra intención y otra clave", async () => {
    mockPost.mockResolvedValueOnce({ ok: false, status: 500, code: "http_500", data: undefined }).mockResolvedValue(created);
    shortcut();
    await render(<QuickAddSheet onClose={jest.fn()} />);
    await waitFor(async () => expect((await screen.findByRole("button", { name: "Guardar" })).props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("No se pudo guardar. Toca Reintentar.");
    await fireEvent.press(screen.getByRole("button", { name: "Borrar" }));
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[0][2].idempotencyKey).toBe("key-1");
    expect(mockPost.mock.calls[1][2].idempotencyKey).toBe("key-2");
    expect(mockPost.mock.calls[1][1].amount).toBe("18000");
  });

  it("dos toques seguidos en «Guardar» no envían dos veces", async () => {
    let release: (value: unknown) => void = () => undefined;
    mockPost.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    shortcut();
    await render(<QuickAddSheet onClose={jest.fn()} />);
    await waitFor(async () => expect((await screen.findByRole("button", { name: "Guardar" })).props.accessibilityState.disabled).toBe(false));
    const save = screen.getByRole("button", { name: "Guardar" });
    await fireEvent.press(save);
    await fireEvent.press(save);
    expect(mockPost).toHaveBeenCalledTimes(1);
    await act(async () => release(created));
    await screen.findByText("Guardado.");
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("sin monto, «Guardar» queda inactivo; el teclado propio arma el monto y no hay campo de texto del sistema", async () => {
    mockPost.mockResolvedValue(created);
    startQuickAdd();
    await render(<QuickAddSheet onClose={jest.fn()} />);
    await screen.findByText("Ahorros Bancolombia");
    expect(screen.getByRole("button", { name: "Guardar" }).props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByLabelText("Monto")).toBeNull();
    for (const key of ["1", "2", "000"]) await fireEvent.press(screen.getByRole("button", { name: key === "000" ? "Tres ceros" : key }));
    await fireEvent.press(screen.getByRole("button", { name: "Coma decimal" }));
    await fireEvent.press(screen.getByRole("button", { name: "5" }));
    expect(screen.getByText("$12.000,5")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar" }).props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0][1].amount).toBe("12000.5");
  });

  it("en el hogar guarda en la ruta del hogar y el visor no puede guardar", async () => {
    householdsStore.set([{ id: "h1", name: "Casa", role: "editor", members: 2, rotating: false }]);
    scopeStore.set({ kind: "household", id: "h1" });
    mockPost.mockResolvedValue(created);
    shortcut();
    await render(<QuickAddSheet onClose={jest.fn()} />);
    await waitFor(async () => expect((await screen.findByRole("button", { name: "Guardar" })).props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0][0]).toBe("/households/h1/movements");
  });

  it("visor del hogar: aviso y «Guardar» inactivo", async () => {
    householdsStore.set([{ id: "h1", name: "Casa", role: "viewer", members: 2, rotating: false }]);
    scopeStore.set({ kind: "household", id: "h1" });
    shortcut();
    await render(<QuickAddSheet onClose={jest.fn()} />);
    expect(await screen.findByText("Eres visor en este hogar: no puedes registrar movimientos.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar" }).props.accessibilityState.disabled).toBe(true);
  });

  it("sin cuentas: estado vacío y nada que guardar", async () => {
    mockGet.mockImplementation(async (path: string) => ({ ok: true, status: 200, data: path.includes("/accounts") ? { ...emptyPage } : path.includes("/categories") ? categories : emptyPage }));
    shortcut();
    await render(<QuickAddSheet onClose={jest.fn()} />);
    expect(await screen.findByText("Aún no tienes cuentas")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar" }).props.accessibilityState.disabled).toBe(true);
  });

  it("los avisos del servidor (posible duplicado) se muestran sin bloquear", async () => {
    mockPost.mockResolvedValue({ ok: true, status: 201, data: movement({ warnings: [{ code: "possible_duplicate" }] }) });
    shortcut();
    await render(<QuickAddSheet onClose={jest.fn()} />);
    await waitFor(async () => expect((await screen.findByRole("button", { name: "Guardar" })).props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Se parece a un movimiento reciente. Revisa que no esté repetido.")).toBeTruthy();
  });
});

import { fireEvent, render, screen } from "@testing-library/react-native";
import { NameSheet } from "@/features/counterparties/name-sheet";
import { scopeStore } from "@/features/scope/store";

let mockKey = 0;
jest.mock("expo-crypto", () => ({ randomUUID: () => `key-${++mockKey}` }));
const mockPost = jest.fn();
const mockFms = { get: jest.fn(), post: (...a: unknown[]) => mockPost(...a), patch: jest.fn(), delete: jest.fn(), put: jest.fn() };
jest.mock("@/auth/use-session", () => ({ useFms: () => mockFms }));

const PATH = "/movements/m-1/counterparty";

beforeEach(() => {
  mockKey = 0;
  scopeStore.reset();
  mockPost.mockReset();
});

describe("Ponerle nombre (app)", () => {
  it("guarda el nombre desde el movimiento y avisa; la cuenta la lee el servidor, no la app", async () => {
    mockPost.mockResolvedValue({ ok: true, status: 200, data: {} });
    const done = jest.fn();
    await render(<NameSheet open movementId="m-1" onClose={() => undefined} onDone={done} />);
    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Mi Madre");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar nombre" }));
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0][0]).toBe(PATH);
    expect(mockPost.mock.calls[0][1]).toEqual({ name: "Mi Madre" });
    expect(mockPost.mock.calls[0][2]).toMatchObject({ idempotencyKey: expect.any(String) });
    expect(done).toHaveBeenCalledWith("Mi Madre");
  });

  it("si la cuenta ya tiene otro nombre pregunta «¿Actualizar anterior → nuevo?» y reintenta con renombrar o crear otro", async () => {
    mockPost
      .mockResolvedValueOnce({ ok: false, status: 409, code: "identifier_taken", data: { code: "identifier_taken", current_name: "Mi Madre" } })
      .mockResolvedValueOnce({ ok: true, status: 200, data: {} });
    const done = jest.fn();
    await render(<NameSheet open movementId="m-1" onClose={() => undefined} onDone={done} />);
    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Mamá");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar nombre" }));
    expect(await screen.findByText("¿Actualizar «Mi Madre» → «Mamá»?")).toBeTruthy();
    expect(done).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Actualizar nombre" }));
    expect(mockPost.mock.calls[1][1]).toEqual({ name: "Mamá", on_conflict: "rename" });
    expect(done).toHaveBeenCalledWith("Mamá");
  });

  it("«Crear otro» manda on_conflict move", async () => {
    mockPost
      .mockResolvedValueOnce({ ok: false, status: 409, code: "identifier_taken", data: { current_name: "Mi Madre" } })
      .mockResolvedValueOnce({ ok: true, status: 200, data: {} });
    await render(<NameSheet open movementId="m-1" onClose={() => undefined} onDone={() => undefined} />);
    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Yennis");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar nombre" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Crear otro" }));
    expect(mockPost.mock.calls[1][1]).toEqual({ name: "Yennis", on_conflict: "move" });
  });

  it("dentro de un hogar usa la ruta del hogar", async () => {
    scopeStore.set({ kind: "household", id: "h-1" });
    mockPost.mockResolvedValue({ ok: true, status: 200, data: {} });
    await render(<NameSheet open movementId="m-1" onClose={() => undefined} onDone={() => undefined} />);
    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Mi Padre");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar nombre" }));
    expect(mockPost.mock.calls[0][0]).toBe("/households/h-1/movements/m-1/counterparty");
  });
});

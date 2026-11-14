import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { RulesScreen } from "@/features/sync/rules";
import { householdsStore, scopeStore } from "@/features/scope/store";
import { catalog, categories, rule, suggestion } from "./sync-fixtures";

let mockKey = 0;
jest.mock("expo-crypto", () => ({ randomUUID: () => `key-${++mockKey}` }));
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();
const mockFms = { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a), patch: (...a: unknown[]) => mockPatch(...a), delete: (...a: unknown[]) => mockDelete(...a), put: jest.fn() };
jest.mock("@/auth/use-session", () => ({ useFms: () => mockFms }));

let rules: unknown[] = [];
let suggestions: unknown[] = [];

beforeEach(() => {
  mockKey = 0;
  rules = [rule];
  suggestions = [];
  scopeStore.reset();
  householdsStore.reset();
  for (const m of [mockGet, mockPost, mockPatch, mockDelete]) m.mockReset();
  mockGet.mockImplementation(async (path: string) => {
    if (path.startsWith("/automation/rules") || path.startsWith("/households/h1/automation/rules")) return { ok: true, status: 200, data: { count: rules.length, results: rules } };
    if (path === "/sync/rule-suggestions" || path === "/households/h1/sync/rule-suggestions") return { ok: true, status: 200, data: { results: suggestions } };
    if (path === "/sync/catalog") return { ok: true, status: 200, data: catalog };
    if (path.startsWith("/categories") || path.startsWith("/households/h1/categories")) return { ok: true, status: 200, data: categories };
    return { ok: false, status: 404, code: "not_found", data: {} };
  });
});

describe("reglas de autoconfirmación (M2, simple)", () => {
  it("la condición se lee en lenguaje de persona y solo salen las reglas de los correos", async () => {
    rules = [rule, { ...rule, id: "r2", name: "Tarjeta al límite", trigger: "card_utilization", action: "notify" }];
    await render(<RulesScreen />);
    expect(await screen.findByText("Nómina")).toBeTruthy();
    expect(screen.queryByText("Tarjeta al límite")).toBeNull();
    expect(screen.getByText("• Tipo: Ingreso")).toBeTruthy();
    expect(screen.getByText("• El comercio o la contraparte contiene «nomina acme»")).toBeTruthy();
    expect(screen.getByText("• Monto desde $3.000.000")).toBeTruthy();
    expect(screen.getByText("Aplicada 3 veces · Última vez: 10/11/2026")).toBeTruthy();
  });

  it("pausar manda solo `enabled`", async () => {
    mockPatch.mockResolvedValue({ ok: true, status: 200, data: { ...rule, enabled: false } });
    await render(<RulesScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Pausar" }));
    expect(await screen.findByText("Regla pausada.")).toBeTruthy();
    expect(mockPatch).toHaveBeenCalledWith("/automation/rules/r1", { enabled: false }, undefined);
  });

  it("borrar pide confirmar", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    mockDelete.mockResolvedValue({ ok: true, status: 204, data: undefined });
    await render(<RulesScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Borrar" }));
    expect(mockDelete).not.toHaveBeenCalled();
    await act(async () => alert.mock.calls[0][2]?.find((b) => b.text === "Sí, borrar")?.onPress?.());
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("/automation/rules/r1", undefined));
    alert.mockRestore();
  });

  it("aceptar una sugerencia enseña las condiciones y la crea con una Idempotency-Key (texto literal, sin monto obligatorio)", async () => {
    rules = [];
    suggestions = [suggestion];
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    mockPost.mockResolvedValue({ ok: true, status: 201, data: rule });
    await render(<RulesScreen />);
    expect(await screen.findByText("Aprobaste 3 movimientos parecidos")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Aceptar" }));
    expect(alert.mock.calls[0][1]).toContain("• El comercio o la contraparte empieza por «nomina acme»");
    expect(mockPost).not.toHaveBeenCalled();
    await act(async () => alert.mock.calls[0][2]?.find((b) => b.text === "Sí, crear la regla")?.onPress?.());
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0][0]).toBe("/automation/rules");
    expect(mockPost.mock.calls[0][1]).toMatchObject({ trigger: "sync_event", action: "auto_confirm", name: "Sugerida: nomina acme", conditions: suggestion.conditions });
    expect(mockPost.mock.calls[0][2]).toEqual({ idempotencyKey: "key-1" });
    alert.mockRestore();
  });

  it("descartar una sugerencia manda su clave", async () => {
    rules = [];
    suggestions = [suggestion];
    mockPost.mockResolvedValue({ ok: true, status: 204, data: undefined });
    await render(<RulesScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Descartar" }));
    expect(mockPost).toHaveBeenCalledWith("/sync/rule-suggestions/dismiss", { key: "s1" }, undefined);
  });

  it("en un hogar lee y escribe las reglas del hogar (no las personales)", async () => {
    scopeStore.set({ kind: "household", id: "h1" });
    householdsStore.set([{ id: "h1", name: "Casa", role: "editor", members: 2, rotating: false }]);
    suggestions = [suggestion];
    mockPatch.mockResolvedValue({ ok: true, status: 200, data: { ...rule, enabled: false } });
    mockPost.mockResolvedValue({ ok: true, status: 204, data: undefined });
    await render(<RulesScreen />);
    expect(await screen.findByText("Nómina")).toBeTruthy();
    const paths = mockGet.mock.calls.map((c) => c[0]);
    expect(paths).toContain("/households/h1/automation/rules?page_size=100");
    expect(paths).toContain("/households/h1/sync/rule-suggestions");
    expect(paths).toContain("/sync/catalog");
    expect(paths).not.toContain("/automation/rules?page_size=100");
    await fireEvent.press(screen.getByRole("button", { name: "Pausar" }));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith("/households/h1/automation/rules/r1", { enabled: false }, undefined));
    await fireEvent.press(screen.getByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith("/households/h1/sync/rule-suggestions/dismiss", { key: "s1" }, undefined));
  });

  it("un visor del hogar las ve sin botones ni sugerencias", async () => {
    scopeStore.set({ kind: "household", id: "h1" });
    householdsStore.set([{ id: "h1", name: "Casa", role: "viewer", members: 2, rotating: false }]);
    suggestions = [suggestion];
    await render(<RulesScreen />);
    expect(await screen.findByText("Nómina")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pausar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Borrar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Descartar" })).toBeNull();
  });

  it("un fallo de red se dice y se puede reintentar", async () => {
    mockGet.mockImplementation(async () => ({ ok: false, status: 0, code: "network", data: undefined }));
    await render(<RulesScreen />);
    expect(await screen.findByText("Sin conexión. Revisa tu red e inténtalo de nuevo.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });
});

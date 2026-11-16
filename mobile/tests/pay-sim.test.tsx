import { act, fireEvent, render, screen } from "@testing-library/react-native";
import PaySim from "@/app/(app)/pay-sim";
import { cardBody, loanBody } from "@/features/pay-sim/logic";

const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
const mockFms = { get: (...args: unknown[]) => mockGet(...args), post: (...args: unknown[]) => mockPost(...args) };
jest.mock("@/auth/use-session", () => ({ useFms: () => mockFms }));

const CARD = "11111111-1111-4111-8111-111111111111";
const LOAN = "22222222-2222-4222-8222-222222222222";
const params = { pay_now: null, continue_with: "total", defer_terms: null, defer_rate: null, defer_rate_convention: null, defer_scope: "statement" };
const outcome = (key: string, extra: Record<string, unknown> = {}) => ({ key, params, notes: [], pay_now: "2000000", months: 7, total_interest: "130000", total_cost: "2857400", extra_cost: "0", truncated: false, cheapest: false, rows: [], ...extra });
const STRATEGY = {
  card_id: CARD, cheapest_index: 0, warnings: [], skipped: [], assumptions: [],
  statement: { month: "2026-11", cutoff: "2026-11-30", due_date: "2026-12-16", closed: false, estimated: true, total_due: "2000000", minimum_due: "320000" },
  strategies: [outcome("total", { cheapest: true }), outcome("minimum", { pay_now: "320000", truncated: true, total_interest: "862333.63", extra_cost: "4140933.63" }), outcome("defer", { params: { ...params, defer_terms: 12 }, pay_now: "800000", total_interest: "300367.62", extra_cost: "349767.62" })],
};
const LOAN_SIM = {
  loan_id: LOAN, balance: "17364601.49", installments_left: 30, next_payment: "723047.91", warnings: [], assumptions: [], finish_in: null,
  strategies: [
    { key: "installment", extra_now: "0", installments: 30, first_payment: "723047.91", total_interest: "4326835.83", saved: "0", cheapest: false },
    { key: "reduce_term", extra_now: "2000000", installments: 25, first_payment: "723047.91", total_interest: "3276129.88", saved: "1050705.95", cheapest: true },
  ],
};

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockGet.mockImplementation((path: string) =>
    Promise.resolve({ ok: true, status: 200, data: path.startsWith("/cards") ? { results: [{ id: CARD, name: "Visa sintética", status: "active" }] } : { results: [{ id: LOAN, name: "Libre inversión", status: "active" }] } }),
  );
});

describe("peticiones", () => {
  it("el valor va como cadena decimal; uno inválido no se envía", () => {
    expect(cardBody("")).toEqual({ continue_with: "same", defer_terms: [6, 12, 24], defer_scope: "statement", horizon_months: 120 });
    expect(cardBody("800.000")).toMatchObject({ pay_amount: "800000", pay_now: "800000" });
    expect(cardBody("abc")).toBeNull();
    expect(loanBody("")).toEqual({});
    expect(loanBody("2.000.000")).toEqual({ extra: "2000000" });
    expect(loanBody("0")).toBeNull();
  });
});

describe("Simular un pago (app)", () => {
  it("lista tarjetas y créditos sin montos en la URL", async () => {
    await render(<PaySim />);
    expect(await screen.findByText("Visa sintética")).toBeTruthy();
    expect(screen.getByText("Libre inversión")).toBeTruthy();
    expect(mockGet.mock.calls.map((c) => c[0])).toEqual(["/cards?page_size=100", "/loans?page_size=100"]);
  });

  it("tarjeta: compara las estrategias, marca la más barata con texto y manda el valor en el cuerpo", async () => {
    mockPost.mockResolvedValue({ ok: true, status: 200, data: STRATEGY });
    await render(<PaySim />);
    await act(async () => fireEvent.press(await screen.findByLabelText("Tarjeta Visa sintética")));
    const pay = await screen.findByLabelText("Quiero pagar este mes (opcional)");
    await act(async () => fireEvent.changeText(pay, "800.000"));
    await act(async () => fireEvent.press(screen.getByLabelText("Simular")));
    expect(mockPost).toHaveBeenCalledWith(`/cards/${CARD}/simulators/payment-strategy`, { pay_amount: "800000", pay_now: "800000", continue_with: "same", defer_terms: [6, 12, 24], defer_scope: "statement", horizon_months: 120 });
    expect(await screen.findByText("Pagar el total")).toBeTruthy();
    expect(screen.getByText("La más barata")).toBeTruthy();
    expect(screen.getByText("Pagar el mínimo")).toBeTruthy();
    expect(screen.getByText("Sin saldar en 10 años")).toBeTruthy();
    expect(screen.getByText("Pagar ahora y diferir a 12 cuotas")).toBeTruthy();
  });

  it("préstamo: pagar solo la cuota frente a abonar", async () => {
    mockPost.mockResolvedValue({ ok: true, status: 200, data: LOAN_SIM });
    await render(<PaySim />);
    await act(async () => fireEvent.press(await screen.findByLabelText("Crédito Libre inversión")));
    const extra = await screen.findByLabelText("Abono extra a capital (opcional)");
    await act(async () => fireEvent.changeText(extra, "2000000"));
    await act(async () => fireEvent.press(screen.getByLabelText("Simular")));
    expect(mockPost).toHaveBeenCalledWith(`/loans/${LOAN}/simulators/payment-strategy`, { extra: "2000000" });
    expect(await screen.findByText("Abonar y reducir el plazo")).toBeTruthy();
    expect(screen.getByText("Pagar solo la cuota")).toBeTruthy();
    expect(screen.getByText("La más barata")).toBeTruthy();
  });

  it("un error del servidor se dice con palabras", async () => {
    mockPost.mockResolvedValue({ ok: false, status: 422, code: "nothing_due" });
    await render(<PaySim />);
    await act(async () => fireEvent.press(await screen.findByLabelText("Tarjeta Visa sintética")));
    await act(async () => fireEvent.press(await screen.findByLabelText("Simular")));
    expect(await screen.findByText("No hay un extracto con algo por pagar.")).toBeTruthy();
  });
});

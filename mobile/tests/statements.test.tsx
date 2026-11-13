import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { components } from "@core/api/schema.gen";
import { periodOf, shiftPeriod, todayBogota } from "@core/dates";
import Statements from "@/app/(app)/statements";

const mockGet = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
const mockFms = { get: (...args: unknown[]) => mockGet(...args) };
jest.mock("@/auth/use-session", () => ({ useFms: () => mockFms }));

type Timeline = components["schemas"]["Timeline"];
const today = todayBogota();
const current = periodOf(today);
const PAST = shiftPeriod(current, -1);
const NEXT = shiftPeriod(current, 1);
const NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const name = (p: string) => `${NAMES[+p.slice(5) - 1]} ${p.slice(0, 4)}`;

const entry = (id: string, label: string, m: string, min: string, total: string) => ({
  card_id: id, card_label: label, cutoff: `${m}-05`, due_date: `${m}-20`, estimated: m > current, carried: "0.00", total_due: total, minimum_due: min, paid_so_far: "0.00", rate_assumed: m > current, rate_valid_from: null, rate_outdated: false,
});
const line = (id: string, label: string, m: string, estimated: boolean) => ({
  date: `${m}-05`, description: `Compra ${label}`, card_id: id, card_label: label, kind: "installment" as const, installment_number: 2, installment_total: 6, amount: "150000.00", capital: "100000.00", interest: "50000.00", purchase_date: "2026-04-10", estimated, rate_assumed: false,
});
const month = (m: string, rows: ReturnType<typeof entry>[], min: string, total: string) => ({
  month: m, cutoff: rows[0].cutoff, due_date: rows[0].due_date, estimated: m > current, rate_assumed: m > current, rate_outdated: false, total_due: total, minimum_due: min, paid_so_far: "0.00",
  cards: rows, lines: rows.map((r) => line(r.card_id, r.card_label, m, m > current)),
});
const TIMELINE: Timeline = {
  months: [
    month(PAST, [entry("visa", "Visa", PAST, "90000.00", "300000.00"), entry("nu", "Nu", PAST, "30000.00", "100000.00")], "120000.00", "400000.00"),
    month(NEXT, [entry("visa", "Visa", NEXT, "171908.34", "450000.00"), entry("nu", "Nu", NEXT, "20000.00", "80000.00")], "191908.34", "530000.00"),
  ],
} as unknown as Timeline;

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ ok: true, status: 200, data: TIMELINE });
});

describe("pantalla Extractos (app)", () => {
  it("pide la línea de tiempo sin montos en la URL y pinta el mes por omisión con el mínimo estimado", async () => {
    await render(<Statements />);
    expect(await screen.findByText("Este es tu pago mínimo estimado")).toBeTruthy();
    const url = mockGet.mock.calls[0][0] as string;
    expect(url).toBe("/cards/statements/timeline?months_back=6");
    expect(screen.getByText("~$191.908,34")).toBeTruthy();
  });

  it("las barras son botones con etiqueta legible; la proyectada dice «estimado» y la cerrada no", async () => {
    await render(<Statements />);
    await screen.findByText("Este es tu pago mínimo estimado");
    expect(screen.getByLabelText(`${name(NEXT)}, pago mínimo estimado $191.908,34`)).toBeTruthy();
    expect(screen.getByLabelText(`${name(PAST)}, pago mínimo $120.000`)).toBeTruthy();
    expect(screen.getByTestId(`bar-${NEXT}`).props.style.borderStyle).toBe("dashed");
    expect(screen.getByTestId(`bar-${PAST}`).props.style.borderStyle).toBe("solid");
  });

  it("tocar una barra cambia el mes: «Pago mínimo» del cerrado", async () => {
    await render(<Statements />);
    await screen.findByText("Este es tu pago mínimo estimado");
    await fireEvent.press(screen.getByLabelText(`${name(PAST)}, pago mínimo $120.000`));
    expect(screen.queryByText("Este es tu pago mínimo estimado")).toBeNull();
    expect(screen.getAllByText("Pago mínimo")).toHaveLength(2); // la ficha del mes cerrado y la opción de la gráfica
    expect(screen.getByText("$120.000", { exact: true })).toBeTruthy();
  });

  it("«Por tarjeta» filtra las líneas y los montos a la tarjeta elegida", async () => {
    await render(<Statements />);
    await screen.findByText("Este es tu pago mínimo estimado");
    expect(screen.getAllByText(/^Compra /)).toHaveLength(2);
    await fireEvent.press(screen.getByRole("button", { name: "Por tarjeta" }));
    await fireEvent.press(screen.getByRole("button", { name: "Nu" }));
    expect(screen.getAllByText(/^Compra /)).toHaveLength(1);
    expect(screen.getByText("Compra Nu")).toBeTruthy();
    expect(screen.getByText("~$20.000")).toBeTruthy();
  });

  it("el detalle de una línea muestra capital, interés y fecha de compra", async () => {
    await render(<Statements />);
    await screen.findByText("Este es tu pago mínimo estimado");
    await fireEvent.press(screen.getAllByRole("button", { name: "Ver detalle" })[0]);
    expect(screen.getByText("Capital")).toBeTruthy();
    expect(screen.getByText("Interés")).toBeTruthy();
    expect(screen.getByText("10/04/2026")).toBeTruthy();
  });

  it("Abonar dice «Disponible en la web» (la app aún no paga tarjetas)", async () => {
    await render(<Statements />);
    await screen.findByText("Este es tu pago mínimo estimado");
    await fireEvent.press(screen.getByRole("button", { name: "Abonar" }));
    expect(screen.getByText(/Disponible en la web/)).toBeTruthy();
  });

  it("avisa que la proyección usa la última tasa conocida", async () => {
    await render(<Statements />);
    expect(await screen.findByText(/Proyección con la última tasa conocida/)).toBeTruthy();
  });

  it("con error de red ofrece reintentar", async () => {
    mockGet.mockResolvedValue({ ok: false, status: 0, code: "network" });
    await render(<Statements />);
    expect(await screen.findByText("No pudimos cargar los extractos.")).toBeTruthy();
    await act(async () => {});
  });
});

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { hiddenStore } from "@/features/common/hidden";
import { SummaryView } from "@/features/summary/view";
import { dashboard, emptyDashboard } from "./fixtures";

const actions = () => ({ onShortcut: jest.fn(), onAlert: jest.fn() });

afterEach(() => act(() => hiddenStore.reset()));

describe("Resumen: se pinta desde el tablero del servidor", () => {
  it("Te queda, gastado, disponible hoy y liquidez a 30 días con el formato de core/money", async () => {
    await render(<SummaryView data={dashboard} past={false} scoped={false} actions={actions()} />);
    expect(screen.getByText("Te queda este mes")).toBeTruthy();
    expect(screen.getByLabelText("1840000 pesos")).toBeTruthy();
    expect(screen.getByText("$1.840.000")).toBeTruthy();
    expect(screen.getByText("$2.310.000")).toBeTruthy();
    expect(screen.getByText("$3.420.000")).toBeTruthy();
    expect(screen.getByText("$1.250.000")).toBeTruthy();
    expect(screen.getByLabelText("Gastado 44 %, comprometido 20 %, libre 35 %")).toBeTruthy();
  });
  it("próximos pagos: vencido primero con su estado y el crédito en UVR sin UVR dice «Por definir», no $0", async () => {
    await render(<SummaryView data={dashboard} past={false} scoped={false} actions={actions()} />);
    expect(screen.getByText("Visa Bancolombia")).toBeTruthy();
    expect(screen.getByText("$850.000")).toBeTruthy();
    expect(screen.getByText("Vence 16/11")).toBeTruthy();
    expect(screen.getByText("Vence 08/11 · Vencido")).toBeTruthy();
    expect(screen.getByText("Por definir")).toBeTruthy();
  });
  it("gastos fijos: progreso, estado de cada ficha y resto por pagar", async () => {
    await render(<SummaryView data={dashboard} past={false} scoped={false} actions={actions()} />);
    expect(screen.getByText("Gastos fijos · 1 de 3 pagados")).toBeTruthy();
    expect(screen.getByLabelText("Arriendo, Vencido, 0 %")).toBeTruthy();
    expect(screen.getByLabelText("Internet, Parcial, 55 %")).toBeTruthy();
    expect(screen.getByLabelText("Agua, Pagado, 100 %")).toBeTruthy();
  });
  it("atajos: el de la plantilla manda su dato; «Otro…» no manda nada", async () => {
    const a = actions();
    await render(<SummaryView data={dashboard} past={false} scoped={false} actions={a} />);
    await fireEvent.press(screen.getByRole("button", { name: "Gasolina" }));
    expect(a.onShortcut).toHaveBeenCalledWith(dashboard.shortcuts[0]);
    await fireEvent.press(screen.getByRole("button", { name: "Otro…" }));
    expect(a.onShortcut).toHaveBeenLastCalledWith(null);
  });
  it("sin atajos todavía: los cuatro de siempre, sin monto", async () => {
    const a = actions();
    await render(<SummaryView data={emptyDashboard} past={false} scoped={false} actions={a} />);
    await fireEvent.press(screen.getByRole("button", { name: "Mercado" }));
    expect(a.onShortcut).toHaveBeenCalledWith(null, "Mercado");
  });
  it("la alerta más urgente primero, con pager; tocarla la abre", async () => {
    const a = actions();
    await render(<SummaryView data={dashboard} past={false} scoped={false} actions={a} />);
    expect(screen.getByLabelText("Urgente: Arriendo venció")).toBeTruthy();
    expect(screen.getByText("1/2")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Alerta siguiente" }));
    expect(screen.getByLabelText("Atención: Internet vence hoy")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Atención: Internet vence hoy"));
    expect(a.onAlert).toHaveBeenCalledWith(dashboard.alerts[1]);
  });
  it("primer uso: estados vacíos, nunca cifras inventadas", async () => {
    await render(<SummaryView data={emptyDashboard} past={false} scoped={false} actions={actions()} />);
    expect(screen.getByText("Registra un ingreso para empezar.")).toBeTruthy();
    expect(screen.getByText("Aún no tienes gastos fijos. Créalos en la web.")).toBeTruthy();
    expect(screen.getByText("No hay pagos de tarjetas o préstamos en los próximos 30 días.")).toBeTruthy();
    expect(screen.getByText("Todo al día · próximo pago en 6 días")).toBeTruthy();
    expect(screen.getByText("Empieza por una cuenta")).toBeTruthy();
  });
  it("«ocultar montos» cambia todo monto por ••••• y el lector dice «monto oculto»", async () => {
    await render(<SummaryView data={dashboard} past={false} scoped={false} actions={actions()} />);
    await act(() => hiddenStore.set(true));
    expect(screen.queryByText("$1.840.000")).toBeNull();
    expect(screen.queryByText("$3.420.000")).toBeNull();
    expect(screen.getAllByText("•••••").length).toBeGreaterThan(5);
    expect(screen.getAllByLabelText("monto oculto").length).toBeGreaterThan(5);
    expect(screen.queryByLabelText("1840000 pesos")).toBeNull();
  });
  it("Te queda negativo se marca y la liquidez muestra cuándo baja de cero", async () => {
    const negative = { ...dashboard, kpi: { ...dashboard.kpi, remaining: "-120000.00" } };
    await render(<SummaryView data={negative} past={false} scoped={false} actions={actions()} />);
    expect(screen.getByText("−$120.000")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Liquidez" }));
    expect(screen.getByText("A 15 días")).toBeTruthy();
    expect(screen.getByText("A 90 días")).toBeTruthy();
    expect(screen.getByText("El saldo proyectado baja de cero el 05/01/2027.")).toBeTruthy();
  });
  it("en el ámbito del hogar no hay tablero de pagos personales", async () => {
    await render(<SummaryView data={dashboard} past={false} scoped actions={actions()} />);
    expect(screen.queryByText("Próximos pagos")).toBeNull();
    expect(screen.getByText("El tablero de gastos fijos y pagos es personal; aquí ves lo del hogar.")).toBeTruthy();
  });
});

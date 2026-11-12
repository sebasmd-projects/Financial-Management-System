import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import Login from "@/app/(public)/login";

const mockSignIn = jest.fn();
let mockPhase: unknown = { name: "signed_out", notice: null };
jest.mock("@/auth/use-session", () => ({ usePhase: () => mockPhase, useSession: () => ({ signIn: mockSignIn }) }));
jest.mock("expo-router", () => ({ Redirect: () => null }));

beforeEach(() => {
  mockSignIn.mockReset();
  mockPhase = { name: "signed_out", notice: null };
});

describe("pantalla de entrada", () => {
  it("pide correo y contraseña antes de llamar al servidor", async () => {
    await render(<Login />);
    await fireEvent.press(screen.getByRole("button", { name: "Entrar" }));
    expect(screen.getByText("Escribe tu correo y tu contraseña.")).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });
  it("envía correo, contraseña y «Recordarme», y borra la contraseña tras el intento", async () => {
    mockSignIn.mockResolvedValue({ ok: false, reason: "invalid_credentials" });
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText("Correo o usuario"), " ana@example.test ");
    await fireEvent.changeText(screen.getByLabelText("Contraseña"), "secreto");
    await fireEvent.press(screen.getByRole("checkbox", { name: "Recordarme en este teléfono" }));
    await fireEvent.press(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith("ana@example.test", "secreto", true));
    expect(await screen.findByText("Correo o contraseña incorrectos.")).toBeTruthy();
    expect(screen.getByLabelText("Contraseña").props.value).toBe("");
  });
  it("la contraseña es un campo oculto y sin corrección automática", async () => {
    await render(<Login />);
    const password = screen.getByLabelText("Contraseña");
    expect(password.props.secureTextEntry).toBe(true);
    expect(password.props.autoCorrect).toBe(false);
  });
  it("muestra por qué terminó la sesión anterior", async () => {
    mockPhase = { name: "signed_out", notice: "device_expired" };
    await render(<Login />);
    expect(screen.getByText("Tu sesión en este teléfono caducó. Entra de nuevo.")).toBeTruthy();
  });
});

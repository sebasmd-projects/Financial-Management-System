import { act, render, screen } from "@testing-library/react-native";
import { AppState, Text } from "react-native";
import { PrivacyShield } from "./privacy-shield";

const mockLock = jest.fn();
const mockPrevent = jest.fn();
jest.mock("expo-screen-capture", () => ({ usePreventScreenCapture: (key: string) => mockPrevent(key) }));
jest.mock("@/auth/use-session", () => ({ useSession: () => ({ lock: mockLock }) }));

type Listener = (state: string) => void;
let listener: Listener = () => undefined;

beforeEach(() => {
  mockLock.mockClear();
  mockPrevent.mockClear();
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, fn: Listener) => {
    listener = fn;
    return { remove: jest.fn() };
  }) as never);
});

const change = async (state: string) => act(async () => listener(state));

describe("escudo de privacidad", () => {
  it("bloquea la captura de pantalla mientras está montado", async () => {
    await render(
      <PrivacyShield>
        <Text>contenido</Text>
      </PrivacyShield>,
    );
    expect(mockPrevent).toHaveBeenCalledWith("fms-app");
  });
  it("tapa con un velo opaco en cuanto la app no está en primer plano, y lo quita al volver", async () => {
    await render(
      <PrivacyShield>
        <Text>contenido</Text>
      </PrivacyShield>,
    );
    expect(screen.queryByTestId("privacy-veil", { includeHiddenElements: true })).toBeNull();
    await change("background");
    expect(screen.getByTestId("privacy-veil", { includeHiddenElements: true })).toBeTruthy();
    await change("active");
    expect(screen.queryByTestId("privacy-veil", { includeHiddenElements: true })).toBeNull();
  });
  it("bloquea al volver tras 60 s en segundo plano, y no antes", async () => {
    const now = jest.spyOn(Date, "now");
    await render(
      <PrivacyShield>
        <Text>contenido</Text>
      </PrivacyShield>,
    );
    now.mockReturnValue(1_000_000);
    await change("background");
    now.mockReturnValue(1_000_000 + 59_000);
    await change("active");
    expect(mockLock).not.toHaveBeenCalled();
    now.mockReturnValue(2_000_000);
    await change("background");
    now.mockReturnValue(2_000_000 + 60_000);
    await change("active");
    expect(mockLock).toHaveBeenCalledTimes(1);
  });
  it("«inactive» (selector de aplicaciones) no empieza el reloj, pero sí tapa", async () => {
    await render(
      <PrivacyShield>
        <Text>contenido</Text>
      </PrivacyShield>,
    );
    await change("inactive");
    expect(screen.getByTestId("privacy-veil", { includeHiddenElements: true })).toBeTruthy();
    await change("active");
    expect(mockLock).not.toHaveBeenCalled();
  });
});

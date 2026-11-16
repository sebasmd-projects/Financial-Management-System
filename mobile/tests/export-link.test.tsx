import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import Security from "@/app/(app)/security";
import { WEB_PAGES } from "@/config";
import { es } from "@/i18n/es";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock("@/auth/use-session", () => ({
  usePhase: () => ({ name: "ready", me: { user: { email: "ana@example.com" }, mfa_verified: true } }),
  useSession: () => ({ logout: jest.fn() }),
  useAllauth: () => ({ recoveryCodes: jest.fn() }),
}));
jest.mock("@/config", () => ({ ...jest.requireActual("@/config"), apiOrigin: () => "https://fms.example" }));

describe("exportar mis datos desde la app", () => {
  it("la app no descarga archivos: abre el apartado «Exportar» de la web de Finanzas", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await render(<Security />);
    expect(screen.getByText(es.export.hint)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: es.export.open }));
    expect(open).toHaveBeenCalledWith("https://fms.example/es/finanzas/perfil#export");
    expect(WEB_PAGES.export.startsWith(WEB_PAGES.profile)).toBe(true);
  });

  it("si el navegador no se puede abrir no revienta", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no browser"));
    await render(<Security />);
    await fireEvent.press(screen.getByRole("button", { name: es.export.open }));
    expect(screen.getByRole("button", { name: es.export.open })).toBeTruthy();
  });

  it("el texto de borrar ya no manda a «Exportar primero» sino al apartado de exportar", () => {
    expect(es.erase.exportBody).toContain("Exportar mis datos de Finanzas");
    expect(es.erase.exportBody).not.toContain("Exportar primero");
  });
});

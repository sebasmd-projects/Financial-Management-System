import { act, renderHook } from "@testing-library/react-native";
import { useNotificationTaps, usePushWhenReady } from "@/auth/use-push";
import { pendingStore } from "@/features/notifications/pending";

const ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OBJ = "55555555-5555-4555-8555-555555555555";
const payload = { type: "notification", notification_id: ID, path: `/notificaciones/${ID}`, object_kind: "occurrence", object_id: OBJ };

let mockPhase = "locked";
let mockTap: ((data: Record<string, unknown>) => void) | null = null;
let mockLaunched: Record<string, unknown> | null = null;
const mockNavigate = jest.fn();
const mockSync = jest.fn(async () => "on");
const mockRemove = jest.fn();
const mockNative = {
  launchedBy: () => mockLaunched,
  onTap: (listener: (data: Record<string, unknown>) => void) => {
    mockTap = listener;
    return mockRemove;
  },
};

jest.mock("expo-router", () => ({ useRouter: () => ({ navigate: mockNavigate }) }));
jest.mock("@/auth/use-session", () => ({ usePhase: () => ({ name: mockPhase }) }));
jest.mock("@/auth/runtime", () => ({ runtime: () => ({ native: mockNative, push: { sync: mockSync } }) }));
jest.mock("@/features/notifications/native", () => ({ showForegroundNotifications: jest.fn() }));

beforeEach(() => {
  mockPhase = "locked";
  mockTap = null;
  mockLaunched = null;
  mockNavigate.mockReset();
  mockSync.mockClear();
  mockRemove.mockClear();
  pendingStore.set(null);
});

describe("tocar un aviso push", () => {
  it("con la app bloqueada espera: abre el centro de avisos solo después de desbloquear, una vez", async () => {
    const taps = await renderHook(() => useNotificationTaps());
    const ready = await renderHook(() => usePushWhenReady());
    await act(() => mockTap?.(payload));
    expect(pendingStore.get()?.target).toEqual({ notificationId: ID, objectKind: "occurrence", objectId: OBJ });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();

    mockPhase = "ready";
    await ready.rerender({});
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/notifications");
    await ready.rerender({});
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledTimes(1);
    await taps.unmount();
    expect(mockRemove).toHaveBeenCalled();
  });
  it("la ruta es literal: sin id, sin monto, sin consulta", async () => {
    mockPhase = "ready";
    await renderHook(() => useNotificationTaps());
    await renderHook(() => usePushWhenReady());
    await act(() => mockTap?.(payload));
    for (const call of mockNavigate.mock.calls) expect(call).toEqual(["/notifications"]);
  });
  it("el aviso que abrió la app en frío también se atiende", async () => {
    mockLaunched = payload;
    await renderHook(() => useNotificationTaps());
    expect(pendingStore.get()?.target.notificationId).toBe(ID);
  });
  it("una carga que no es de la app (ids falsos) se ignora", async () => {
    mockPhase = "ready";
    await renderHook(() => useNotificationTaps());
    await renderHook(() => usePushWhenReady());
    await act(() => mockTap?.({ type: "notification", notification_id: "../../admin", amount: "5000000" }));
    expect(pendingStore.get()).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

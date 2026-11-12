import * as Notifications from "expo-notifications";
import { CHANNELS, createPushNative } from "./native";

jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 5, HIGH: 6, LOW: 4 },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getDevicePushTokenAsync: jest.fn(),
  addPushTokenListener: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponse: jest.fn(),
  clearLastNotificationResponse: jest.fn(),
  setNotificationHandler: jest.fn(),
}));

const names = { due: "Vencimientos", confirm: "Confirmaciones", alerts: "Alertas y presupuesto", digest: "Resúmenes", security: "Seguridad" };
const mocked = Notifications as jest.Mocked<typeof Notifications>;

describe("adaptador de expo-notifications", () => {
  it("crea los cinco canales del diseño (vencimientos y seguridad en alta)", async () => {
    await createPushNative(names).ensureChannels();
    expect(mocked.setNotificationChannelAsync.mock.calls.map((call) => [call[0], (call[1] as { name: string }).name])).toEqual([["due", "Vencimientos"], ["confirm", "Confirmaciones"], ["alerts", "Alertas y presupuesto"], ["digest", "Resúmenes"], ["security", "Seguridad"]]);
    expect(CHANNELS.filter((channel) => channel.importance === 6).map((channel) => channel.id)).toEqual(["due", "security"]);
  });
  it("usa el token NATIVO de FCM (getDevicePushTokenAsync), no el de Expo", async () => {
    mocked.getDevicePushTokenAsync.mockResolvedValue({ type: "android", data: "fcm-native-token" });
    expect(await createPushNative(names).token()).toBe("fcm-native-token");
    mocked.getDevicePushTokenAsync.mockRejectedValue(new Error("sin Google Play"));
    expect(await createPushNative(names).token()).toBeNull();
    expect((mocked as unknown as Record<string, unknown>).getExpoPushTokenAsync).toBeUndefined();
  });
  it("el permiso se lee sin pedirse; pedirlo es otra llamada", async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ status: "undetermined", canAskAgain: true, granted: false, expires: "never" } as never);
    expect(await createPushNative(names).permission()).toEqual({ status: "undetermined", canAskAgain: true });
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    mocked.requestPermissionsAsync.mockResolvedValue({ status: "granted" } as never);
    expect(await createPushNative(names).request()).toBe("granted");
  });
  it("un toque entrega solo `data` (ids), nunca el texto del aviso, y lo limpia", () => {
    let listener: (response: unknown) => void = () => undefined;
    mocked.addNotificationResponseReceivedListener.mockImplementation(((fn: (response: unknown) => void) => {
      listener = fn;
      return { remove: jest.fn() };
    }) as never);
    const seen: unknown[] = [];
    createPushNative(names).onTap((data) => seen.push(data));
    listener({ notification: { request: { content: { title: "Visa $850.000", body: "Paga $850.000", data: { type: "notification", notification_id: "x" } } } } });
    expect(seen).toEqual([{ type: "notification", notification_id: "x" }]);
    expect(mocked.clearLastNotificationResponse).toHaveBeenCalled();
  });
  it("el aviso que abrió la app en frío se consume una vez", () => {
    mocked.getLastNotificationResponse.mockReturnValue({ notification: { request: { content: { data: { type: "notification" } } } } } as never);
    expect(createPushNative(names).launchedBy()).toEqual({ type: "notification" });
    mocked.getLastNotificationResponse.mockReturnValue(null);
    expect(createPushNative(names).launchedBy()).toBeNull();
  });
});

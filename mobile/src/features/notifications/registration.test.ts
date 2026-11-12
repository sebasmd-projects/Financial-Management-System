import type { PushNative } from "./native";
import { createPushRegistration, type PushState, type RegistrationApi } from "./registration";

const ok = <T>(data: T) => ({ ok: true as const, status: 200, data });
const fail = (status = 500) => ({ ok: false as const, status, code: "x", data: undefined });
const ENDPOINT = { id: "ep-1", kind: "fcm", device_id: "dev-1" };

function setup(options: { permission?: "granted" | "denied" | "undetermined"; canAskAgain?: boolean; request?: "granted" | "denied"; token?: string | null; prefs?: { push_enabled: boolean; fcm_available: boolean }; active?: boolean; endpoints?: unknown[] } = {}) {
  let tokenListener: ((token: string) => void) | null = null;
  const stopListening = jest.fn(() => {
    tokenListener = null;
  });
  const native: PushNative = {
    permission: jest.fn(async () => ({ status: options.permission ?? "undetermined", canAskAgain: options.canAskAgain ?? true })),
    request: jest.fn(async () => options.request ?? "granted"),
    ensureChannels: jest.fn(async () => undefined),
    token: jest.fn(async () => (options.token === undefined ? "fcm-token-AAAAAAAAAAAAAAAAAAAA" : options.token)),
    onTokenChange: jest.fn((listener) => {
      tokenListener = listener;
      return stopListening;
    }),
    onTap: jest.fn(() => () => undefined),
    launchedBy: jest.fn(() => null),
    openSettings: jest.fn(),
  };
  const api = {
    get: jest.fn(async (path: string) => (path === "/push/endpoints" ? ok({ endpoints: options.endpoints ?? [ENDPOINT, { id: "ep-web", kind: "webpush", device_id: null }] }) : ok(options.prefs ?? { push_enabled: false, fcm_available: true }))),
    put: jest.fn(async (): Promise<unknown> => ok(ENDPOINT)),
    patch: jest.fn(async () => ok({})),
    delete: jest.fn(async () => ok(undefined)),
  };
  const states: PushState[] = [];
  const registration = createPushRegistration({ native, api: api as unknown as RegistrationApi, deviceId: () => "dev-1", active: () => options.active ?? true, onState: (state) => states.push(state) });
  return { registration, native, api, states, emitToken: (token: string) => tokenListener?.(token), stopListening };
}

describe("registro del token de FCM", () => {
  it("al abrir sin permiso concedido NO pide nada ni llama al servidor", async () => {
    const ctx = setup({ permission: "undetermined" });
    expect(await ctx.registration.sync()).toBe("off");
    expect(ctx.native.request).not.toHaveBeenCalled();
    expect(ctx.native.token).not.toHaveBeenCalled();
    expect(ctx.api.put).not.toHaveBeenCalled();
    expect(ctx.native.ensureChannels).toHaveBeenCalled();
  });
  it("con el permiso ya concedido registra el token nativo: PUT push/endpoints/fcm", async () => {
    const ctx = setup({ permission: "granted" });
    expect(await ctx.registration.sync()).toBe("on");
    expect(ctx.api.put).toHaveBeenCalledWith("/push/endpoints/fcm", { token: "fcm-token-AAAAAAAAAAAAAAAAAAAA", locale: "es" });
    expect(ctx.states).toEqual(["on"]);
  });
  it("permiso negado para siempre: «bloqueado», con el aviso para abrir Ajustes", async () => {
    const ctx = setup({ permission: "denied", canAskAgain: false });
    expect(await ctx.registration.sync()).toBe("blocked");
    expect(ctx.api.put).not.toHaveBeenCalled();
  });
  it("«Activar avisos»: pide el permiso, registra y enciende push_enabled en el servidor", async () => {
    const ctx = setup({ request: "granted" });
    expect(await ctx.registration.enable()).toBe("on");
    expect(ctx.native.request).toHaveBeenCalledTimes(1);
    expect(ctx.api.put).toHaveBeenCalledTimes(1);
    expect(ctx.api.patch).toHaveBeenCalledWith("/notification-prefs", { push_enabled: true });
  });
  it("si la persona no concede el permiso: no hay token ni registro", async () => {
    const ctx = setup({ request: "denied" });
    expect(await ctx.registration.enable()).toBe("blocked");
    expect(ctx.native.token).not.toHaveBeenCalled();
    expect(ctx.api.put).not.toHaveBeenCalled();
  });
  it("si el servidor no tiene FCM configurado, ni siquiera pide el permiso", async () => {
    const ctx = setup({ prefs: { push_enabled: false, fcm_available: false } });
    expect(await ctx.registration.enable()).toBe("unavailable");
    expect(ctx.native.request).not.toHaveBeenCalled();
  });
  it("sin token de Google o con el servidor caído: «failed», sin dejar nada a medias", async () => {
    expect(await setup({ permission: "granted", token: null }).registration.sync()).toBe("failed");
    const ctx = setup({ permission: "granted" });
    ctx.api.put.mockResolvedValueOnce(fail());
    expect(await ctx.registration.sync()).toBe("failed");
  });
  it("si el token rota, se registra el nuevo; con la app bloqueada no se llama al servidor", async () => {
    const live = setup({ permission: "granted" });
    await live.registration.sync();
    live.emitToken("rotated-token-BBBBBBBBBBBBBBBB");
    await Promise.resolve();
    expect(live.api.put).toHaveBeenLastCalledWith("/push/endpoints/fcm", { token: "rotated-token-BBBBBBBBBBBBBBBB", locale: "es" });

    const locked = setup({ permission: "granted", active: false });
    await locked.registration.sync();
    locked.api.put.mockClear();
    locked.emitToken("rotated-token-CCCCCCCCCCCCCCCC");
    expect(locked.api.put).not.toHaveBeenCalled();
  });
  it("cerrar sesión REVOCA el destino de este teléfono (el id viene de la respuesta del registro)", async () => {
    const ctx = setup({ permission: "granted" });
    await ctx.registration.sync();
    await ctx.registration.revoke();
    expect(ctx.api.delete).toHaveBeenCalledWith("/push/endpoints/ep-1");
    expect(ctx.api.get).not.toHaveBeenCalledWith("/push/endpoints");
    expect(ctx.stopListening).toHaveBeenCalled();
    // Ya revocado: un token nuevo no vuelve a registrarse.
    ctx.emitToken("late-token-DDDDDDDDDDDDDDDDDDDD");
    expect(ctx.api.put).toHaveBeenCalledTimes(1);
  });
  it("con la sesión recordada (sin id en memoria) busca el destino fcm de ESTE dispositivo y solo ese", async () => {
    const ctx = setup({ endpoints: [{ id: "ep-other", kind: "fcm", device_id: "dev-2" }, { id: "ep-web", kind: "webpush", device_id: null }, ENDPOINT] });
    await ctx.registration.revoke();
    expect(ctx.api.delete).toHaveBeenCalledTimes(1);
    expect(ctx.api.delete).toHaveBeenCalledWith("/push/endpoints/ep-1");
  });
  it("si no había destino, no borra nada", async () => {
    const ctx = setup({ endpoints: [{ id: "ep-other", kind: "fcm", device_id: "dev-2" }] });
    await ctx.registration.revoke();
    expect(ctx.api.delete).not.toHaveBeenCalled();
  });
});

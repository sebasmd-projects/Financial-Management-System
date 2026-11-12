import type { Biometric } from "@/lock/biometric";
import type { LoginStep } from "./allauth";
import { createSession, isReady, type Me, type SessionDeps } from "./session";
import type { TokenStore } from "./token-store";

const meReady = { user: { id: 1, display_name: "Ana", email: "a@b.co", email_verified: true }, mfa_verified: true, finance_active: true, consent: { required_version: "v2", accepted_version: "v2" }, mfa_setup_url: "", login_url: "", auth_mode: "token", device_id: "d1" } as unknown as Me;

function setup(options: { stored?: string | null; bio?: "success" | "cancelled" | "failed" | "unavailable"; capability?: "ok" | "none"; me?: Me | { status: number; code?: string }; steps?: LoginStep[]; beforeLogout?: () => Promise<void> } = {}) {
  let disk = options.stored ?? null;
  let memory: string | null = null;
  const store: TokenStore = {
    read: jest.fn(async () => disk),
    save: jest.fn(async (token: string) => ((disk = token), true)),
    clear: jest.fn(async () => void (disk = null)),
  };
  const token = { get: () => memory, set: (value: string) => void (memory = value), clear: () => void (memory = null) };
  const biometric: Biometric = { capability: async () => options.capability ?? "ok", authenticate: jest.fn(async () => options.bio ?? "success") };
  const steps = [...(options.steps ?? [])];
  const allauth = { login: jest.fn(async () => steps.shift()!), submitCode: jest.fn(async () => steps.shift()!), logout: jest.fn(async () => undefined) };
  const meReply = options.me ?? meReady;
  const fms = { get: jest.fn(async () => ("status" in meReply ? { ok: false as const, status: meReply.status, code: meReply.code ?? "" } : { ok: true as const, data: meReply })) } as unknown as SessionDeps["api"] extends () => infer R ? R extends { fms: infer F } ? F : never : never;
  const session = createSession({ store, token: token as never, biometric, api: () => ({ fms, allauth }), beforeLogout: options.beforeLogout });
  const wiped = jest.fn();
  session.onWipe(wiped);
  return { session, store, token, biometric, allauth, fms, wiped, disk: () => disk, memory: () => memory };
}

describe("arranque", () => {
  it("sin token guardado: a iniciar sesión", async () => {
    const { session } = setup();
    await session.boot();
    expect(session.getPhase()).toEqual({ name: "signed_out", notice: null });
  });
  it("con token guardado: bloqueado, y el token NO se carga en memoria hasta la huella", async () => {
    const { session, memory } = setup({ stored: "tok" });
    await session.boot();
    expect(session.getPhase().name).toBe("locked");
    expect(memory()).toBeNull();
  });
  it("sin bloqueo de pantalla en el teléfono no se usa la app", async () => {
    const { session } = setup({ stored: "tok", capability: "none" });
    await session.boot();
    expect(session.getPhase()).toEqual({ name: "signed_out", notice: "device_unsecured" });
    expect(await session.signIn("a@b.co", "pw", false)).toEqual({ ok: false, reason: "device_unsecured" });
  });
});

describe("inicio de sesión", () => {
  it("contraseña + código: pasa por el segundo factor y llega a ready", async () => {
    const { session, allauth, fms } = setup({ steps: [{ kind: "second_factor", via: "mfa", token: "pending" }, { kind: "authenticated", token: "final" }] });
    expect(await session.signIn("a@b.co", "pw", false)).toEqual({ ok: true });
    expect(session.getPhase()).toEqual({ name: "second_factor", via: "mfa", remember: false });
    expect(await session.submitCode("123456")).toEqual({ ok: true });
    expect(allauth.submitCode).toHaveBeenCalledWith("mfa", "123456", false);
    expect(fms.get).toHaveBeenCalledWith("/me");
    expect(session.getPhase().name).toBe("ready");
  });
  it("«Recordarme»: guarda el token (el definitivo, no el pendiente); sin él no se guarda nada y se borra lo viejo", async () => {
    const remembered = setup({ steps: [{ kind: "second_factor", via: "staff", token: "pending" }, { kind: "authenticated", token: "final" }] });
    await remembered.session.signIn("a@b.co", "pw", true);
    await remembered.session.submitCode("1");
    expect(remembered.store.save).toHaveBeenCalledWith("final");
    expect(remembered.disk()).toBe("final");
    expect(remembered.allauth.submitCode).toHaveBeenCalledWith("staff", "1", true);

    const forgetful = setup({ stored: "old", steps: [{ kind: "authenticated", token: "t" }] });
    await forgetful.session.signIn("a@b.co", "pw", false);
    expect(forgetful.store.save).not.toHaveBeenCalled();
    expect(forgetful.disk()).toBeNull();
    expect(forgetful.memory()).toBe("t");
  });
  it("errores: el motivo llega a la pantalla y no se cambia de estado", async () => {
    const { session } = setup({ steps: [{ kind: "failed", reason: "invalid_credentials" }] });
    await session.boot();
    expect(await session.signIn("a@b.co", "mal", false)).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(session.getPhase().name).toBe("signed_out");
  });
  it("un paso que la app no soporta no deja token a medias", async () => {
    const { session, memory } = setup({ steps: [{ kind: "unsupported_flow", flow: "verify_email" }] });
    expect(await session.signIn("a@b.co", "pw", false)).toEqual({ ok: false, reason: "unsupported_flow" });
    expect(memory()).toBeNull();
  });
  it("si el segundo factor caducó (410) vuelve a iniciar sesión con aviso", async () => {
    const { session } = setup({ steps: [{ kind: "second_factor", via: "mfa", token: "p" }, { kind: "failed", reason: "expired" }] });
    await session.signIn("a@b.co", "pw", false);
    expect(await session.submitCode("1")).toEqual({ ok: false, reason: "expired" });
    expect(session.getPhase()).toEqual({ name: "signed_out", notice: "expired" });
  });
  it("cancelar el segundo factor suelta el token pendiente", async () => {
    const { session, memory } = setup({ steps: [{ kind: "second_factor", via: "mfa", token: "p" }] });
    await session.signIn("a@b.co", "pw", false);
    session.cancelSecondFactor();
    expect(memory()).toBeNull();
    expect(session.getPhase().name).toBe("signed_out");
  });
});

describe("estado de la cuenta", () => {
  it.each([
    ["sin segundo factor en la sesión", { ...meReady, mfa_verified: false }],
    ["sin activar", { ...meReady, finance_active: false }],
    ["textos legales nuevos", { ...meReady, consent: { required_version: "v3", accepted_version: "v2" } }],
  ])("%s → setup", async (_name, me) => {
    const { session } = setup({ me: me as Me, steps: [{ kind: "authenticated", token: "t" }] });
    await session.signIn("a@b.co", "pw", false);
    expect(session.getPhase()).toMatchObject({ name: "setup" });
    expect(isReady(me as Me)).toBe(false);
  });
  it("si /me falla sin sesión terminada, load_failed con reintento", async () => {
    const { session, fms } = setup({ me: { status: 0 }, steps: [{ kind: "authenticated", token: "t" }] });
    await session.signIn("a@b.co", "pw", false);
    expect(session.getPhase()).toEqual({ name: "load_failed", network: true });
    (fms.get as jest.Mock).mockResolvedValueOnce({ ok: true, data: meReady });
    await session.refresh();
    expect(session.getPhase().name).toBe("ready");
  });
});

describe("bloqueo", () => {
  async function ready(remember: boolean) {
    const ctx = setup({ steps: [{ kind: "authenticated", token: "t" }] });
    await ctx.session.signIn("a@b.co", "pw", remember);
    return ctx;
  }
  it("bloquear borra lo que haya en memoria; con «Recordarme» también saca el token de la memoria", async () => {
    const ctx = await ready(true);
    ctx.session.lock();
    expect(ctx.session.getPhase().name).toBe("locked");
    expect(ctx.wiped).toHaveBeenCalledTimes(1);
    expect(ctx.memory()).toBeNull();
    expect(ctx.disk()).toBe("t");
  });
  it("sin «Recordarme» el token se queda en memoria (no hay otro sitio) pero los datos se borran igual", async () => {
    const ctx = await ready(false);
    ctx.session.lock();
    expect(ctx.wiped).toHaveBeenCalledTimes(1);
    expect(ctx.memory()).toBe("t");
  });
  it("desbloquear exige la huella; si falla o se cancela sigue bloqueado y no se lee el llavero", async () => {
    const ctx = setup({ stored: "tok", bio: "cancelled" });
    await ctx.session.boot();
    expect(await ctx.session.unlock("x")).toBe("cancelled");
    expect(ctx.session.getPhase().name).toBe("locked");
    expect(ctx.store.read).toHaveBeenCalledTimes(1); // solo el del arranque
    expect(ctx.fms.get).not.toHaveBeenCalled();
  });
  it("desbloquear con éxito lee el token, carga la cuenta y abre", async () => {
    const ctx = setup({ stored: "tok" });
    await ctx.session.boot();
    expect(await ctx.session.unlock("x")).toBe("success");
    expect(ctx.memory()).toBe("tok");
    expect(ctx.session.getPhase().name).toBe("ready");
  });
  it("bloquear en pantallas de entrada no hace nada", async () => {
    const { session, wiped } = setup();
    await session.boot();
    session.lock();
    expect(session.getPhase().name).toBe("signed_out");
    expect(wiped).not.toHaveBeenCalled();
  });
});

describe("fin de sesión", () => {
  it.each(["device_expired", "revoked", "expired", "gone"] as const)("expire(%s): borra memoria, token y llavero, y vuelve al inicio con el motivo", async (reason) => {
    const ctx = setup({ steps: [{ kind: "authenticated", token: "t" }] });
    await ctx.session.signIn("a@b.co", "pw", true);
    ctx.session.expire(reason);
    expect(ctx.session.getPhase()).toEqual({ name: "signed_out", notice: reason });
    expect(ctx.memory()).toBeNull();
    expect(ctx.disk()).toBeNull();
    expect(ctx.wiped).toHaveBeenCalled();
  });
  it("un 401 a mitad de cargar /me no lo pisa un resultado tardío", async () => {
    const ctx = setup({ steps: [{ kind: "authenticated", token: "t" }] });
    (ctx.fms.get as jest.Mock).mockImplementationOnce(async () => {
      ctx.session.expire("device_expired");
      return { ok: false, status: 401, code: "device_expired" };
    });
    await ctx.session.signIn("a@b.co", "pw", false);
    expect(ctx.session.getPhase()).toEqual({ name: "signed_out", notice: "device_expired" });
  });
  it("cerrar sesión avisa al servidor y limpia todo", async () => {
    const ctx = setup({ steps: [{ kind: "authenticated", token: "t" }] });
    await ctx.session.signIn("a@b.co", "pw", true);
    await ctx.session.logout();
    expect(ctx.allauth.logout).toHaveBeenCalled();
    expect(ctx.session.getPhase()).toEqual({ name: "signed_out", notice: "logged_out" });
    expect(ctx.disk()).toBeNull();
    expect(ctx.memory()).toBeNull();
  });
});

describe("cerrar sesión y los avisos push", () => {
  it("antes de invalidar la sesión espera a `beforeLogout` (revocar el destino de push)", async () => {
    const order: string[] = [];
    const ctx = setup({ stored: "tok", steps: [], beforeLogout: async () => void order.push("revoke") });
    await ctx.session.boot();
    await ctx.session.unlock("x");
    ctx.allauth.logout.mockImplementation(async () => void order.push("logout"));
    await ctx.session.logout();
    expect(order).toEqual(["revoke", "logout"]);
    expect(ctx.session.getPhase()).toEqual({ name: "signed_out", notice: "logged_out" });
  });
  it("si revocar falla, la sesión se cierra igual", async () => {
    const ctx = setup({ stored: "tok", beforeLogout: async () => Promise.reject(new Error("sin red")) });
    await ctx.session.boot();
    await ctx.session.unlock("x");
    await ctx.session.logout();
    expect(ctx.allauth.logout).toHaveBeenCalled();
    expect(ctx.session.getPhase().name).toBe("signed_out");
  });
});

import { createReauth } from "./reauth";

describe("aviso de reautenticación", () => {
  it("varias peticiones comparten un solo aviso y reciben el mismo resultado", async () => {
    const reauth = createReauth();
    const a = reauth.request();
    const b = reauth.request();
    expect(a).toBe(b);
    expect(reauth.isOpen()).toBe(true);
    reauth.settle(true);
    expect(await a).toBe(true);
    expect(reauth.isOpen()).toBe(false);
  });
  it("cancelar resuelve false y permite abrir otro aviso después", async () => {
    const reauth = createReauth();
    const first = reauth.request();
    reauth.settle(false);
    expect(await first).toBe(false);
    const second = reauth.request();
    expect(reauth.isOpen()).toBe(true);
    reauth.settle(true);
    expect(await second).toBe(true);
  });
  it("avisa a quien escucha al abrir y al cerrar", () => {
    const reauth = createReauth();
    const listener = jest.fn();
    reauth.subscribe(listener);
    void reauth.request();
    reauth.settle(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, isThemePreference, nextTheme, readThemePreference, THEME_INIT_SCRIPT, THEME_KEY, writeThemePreference } from "./storage";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("preferencia de tema (lo único que va a localStorage)", () => {
  it("ciclo sistema → claro → oscuro → sistema", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
  });
  it("guarda solo claro u oscuro, bajo una sola clave; sistema la borra", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    writeThemePreference("dark");
    expect([...storage.data]).toEqual([[THEME_KEY, "dark"]]);
    writeThemePreference("system");
    expect(storage.data.size).toBe(0);
  });
  it("ignora un valor raro guardado", () => {
    vi.stubGlobal("localStorage", fakeStorage({ [THEME_KEY]: "<script>" }));
    expect(readThemePreference()).toBe("system");
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("blue")).toBe(false);
  });
  it("si el almacenamiento falla (modo privado), no rompe", () => {
    const broken = new Proxy({}, { get: () => () => { throw new Error("bloqueado"); } });
    vi.stubGlobal("localStorage", broken);
    expect(readThemePreference()).toBe("system");
    expect(() => writeThemePreference("dark")).not.toThrow();
  });
  it("aplica data-theme en <html>", () => {
    const attrs = new Map<string, string>();
    vi.stubGlobal("document", { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v), removeAttribute: (k: string) => attrs.delete(k) } });
    applyTheme("dark");
    expect(attrs.get("data-theme")).toBe("dark");
    applyTheme("system");
    expect(attrs.has("data-theme")).toBe(false);
  });
  it("el script de arranque solo lee la clave y solo acepta light/dark", () => {
    expect(THEME_INIT_SCRIPT).toContain(`localStorage.getItem("fms-theme")`);
    expect(THEME_INIT_SCRIPT).not.toContain("setItem");
    const attrs = new Map<string, string>();
    vi.stubGlobal("localStorage", fakeStorage({ [THEME_KEY]: "dark" }));
    vi.stubGlobal("document", { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v) } });
    new Function(THEME_INIT_SCRIPT)();
    expect(attrs.get("data-theme")).toBe("dark");
    attrs.clear();
    vi.stubGlobal("localStorage", fakeStorage({ [THEME_KEY]: "evil" }));
    new Function(THEME_INIT_SCRIPT)();
    expect(attrs.size).toBe(0);
  });
});

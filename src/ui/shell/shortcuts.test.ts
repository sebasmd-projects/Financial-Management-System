import { describe, expect, it } from "vitest";
import { resolveShortcut, type KeyInfo } from "./shortcuts";

const key = (k: string, extra: Partial<KeyInfo> = {}): KeyInfo => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, typing: false, ...extra });

describe("atajos de teclado (diseño §6)", () => {
  it("N abre el alta", () => {
    expect(resolveShortcut(key("n"), false).action).toEqual({ type: "new" });
    expect(resolveShortcut(key("N", { shiftKey: true }), false).action).toBeNull();
  });
  it("Ctrl/⌘+K abre el buscador, incluso escribiendo", () => {
    expect(resolveShortcut(key("k", { ctrlKey: true }), false)).toMatchObject({ action: { type: "search" }, preventDefault: true });
    expect(resolveShortcut(key("k", { metaKey: true, typing: true }), false).action).toEqual({ type: "search" });
  });
  it("G y luego R/M/P navegan", () => {
    const first = resolveShortcut(key("g"), false);
    expect(first).toMatchObject({ action: null, pendingG: true });
    expect(resolveShortcut(key("r"), true).action).toEqual({ type: "go", to: "/" });
    expect(resolveShortcut(key("m"), true).action).toEqual({ type: "go", to: "/movimientos" });
    expect(resolveShortcut(key("p"), true).action).toEqual({ type: "go", to: "/pagos" });
    expect(resolveShortcut(key("p"), false).action).toBeNull();
    expect(resolveShortcut(key("x"), true)).toMatchObject({ action: null, pendingG: false });
  });
  it("no roba teclas al escribir ni con modificadores", () => {
    expect(resolveShortcut(key("n", { typing: true }), false).action).toBeNull();
    expect(resolveShortcut(key("g", { typing: true }), false).pendingG).toBe(false);
    expect(resolveShortcut(key("n", { ctrlKey: true }), false).action).toBeNull();
    expect(resolveShortcut(key("n", { altKey: true }), false).action).toBeNull();
  });
});

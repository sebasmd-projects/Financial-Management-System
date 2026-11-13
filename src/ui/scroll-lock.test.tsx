// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { es } from "@/i18n/dictionaries/es";
import { I18nProvider } from "@/i18n/provider";
import { Modal } from "@/features/finance/kit";
import { lockPageScroll } from "./scroll-lock";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const css = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const root = document.documentElement;
afterEach(() => { root.removeAttribute("style"); delete root.dataset.scrollLocked; });

describe("bloqueo del desplazamiento de la página", () => {
  it("bloquea, restaura lo que había y cuenta los bloqueos anidados", () => {
    root.style.overflow = "auto";
    const a = lockPageScroll();
    const b = lockPageScroll();
    expect(root.style.overflow).toBe("hidden");
    a();
    expect(root.style.overflow).toBe("hidden");
    b();
    b();
    expect(root.style.overflow).toBe("auto");
    expect(root.dataset.scrollLocked).toBeUndefined();
  });

  it("el Modal bloquea al abrirse y libera al cerrarse", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const r = createRoot(host);
    const render = (open: boolean) => act(() => r.render(<I18nProvider locale="es" dict={es}><Modal open={open} title="Agregar" onClose={() => undefined}>x</Modal></I18nProvider>));
    render(false);
    expect(root.style.overflow).toBe("");
    render(true);
    expect(root.style.overflow).toBe("hidden");
    render(false);
    expect(root.style.overflow).toBe("");
    act(() => r.unmount());
    host.remove();
  });
});

describe("hojas modales: contención y ancho", () => {
  const globals = css("../app/globals.css");
  const finance = css("../features/finance/finance.css");
  it("la hoja se acota al área visible y no encadena el desplazamiento", () => {
    expect(globals).toMatch(/\.sheet\[open\]\s*\{[^}]*max-height:\s*min\(92dvh, calc\(100dvh - env\(safe-area-inset-top[^}]*overscroll-behavior:\s*contain/s);
    expect(globals).toMatch(/\.sheet__list\s*\{[^}]*overscroll-behavior:\s*contain/);
    expect(finance).toMatch(/\.sheet__body\s*\{[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain/);
    expect(finance).toMatch(/\.sheet__body\s*\{[^}]*overflow-x:\s*hidden/);
  });
  it("los botones del formulario quedan pegados abajo y las columnas pueden encogerse (320 px)", () => {
    expect(finance).toMatch(/\.sheet__body \.fin-form-actions\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0/);
    expect(finance).toMatch(/\.fin-grid-2\s*\{[^}]*minmax\(0, 1fr\)/);
    expect(finance).toMatch(/\.help-tip__text\s*\{[^}]*min-width:\s*0/);
  });
  it("el teclado reduce el área de diseño (resizes-content)", () => {
    expect(readFileSync(join(process.cwd(), "src/app/[locale]/layout.tsx"), "utf8")).toContain('interactiveWidget: "resizes-content"');
  });
});

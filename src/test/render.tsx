/**
 * Utilidades para probar pantallas con datos simulados (`mockFetch`): montan la pantalla con el diccionario, esperan a que
 * lleguen las respuestas y dejan el DOM para inspeccionarlo. Nada de red real.
 */
import type { ReactElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { es } from "@/i18n/dictionaries/es";
import { I18nProvider } from "@/i18n/provider";
import { mockFetch, type MockReply } from "./mock-fetch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export const wait = (ms = 30) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

export interface Mounted {
  host: HTMLDivElement;
  root: Root;
  mock: ReturnType<typeof mockFetch>;
  text: () => string;
  /** El texto que ve una persona: sin los valores completos que solo lee el lector de pantalla (`visually-hidden`). */
  visible: () => string;
  unmount: () => void;
}

export async function mountScreen(element: ReactElement, routes: Record<string, MockReply>, locale: "es" | "en" = "es"): Promise<Mounted> {
  const host = document.createElement("div");
  document.body.append(host);
  document.cookie = "csrftoken=tok-test";
  const mock = mockFetch(routes);
  vi.stubGlobal("fetch", mock.fetch);
  const root = createRoot(host);
  act(() => root.render(<I18nProvider locale={locale} dict={locale === "es" ? es : en}>{element}</I18nProvider>));
  await wait();
  return {
    host,
    root,
    mock,
    text: () => host.textContent ?? "",
    visible: () => {
      const clone = host.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(".visually-hidden").forEach((el) => el.remove());
      return clone.textContent ?? "";
    },
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

/** Escribe en un campo de React (dispara el evento que React escucha). */
export function typeInto(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

export function click(element: Element | null) {
  if (!element) throw new Error("No se encontró el elemento");
  act(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

export function byText<T extends Element>(host: ParentNode, selector: string, text: string): T {
  const found = [...host.querySelectorAll<T>(selector)].find((el) => el.textContent?.includes(text));
  if (!found) throw new Error(`No hay ${selector} con «${text}»`);
  return found;
}

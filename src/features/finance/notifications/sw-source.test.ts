import { describe, expect, it } from "vitest";
import { SERVICE_WORKER_SOURCE as source } from "./sw-source";

describe("service worker de avisos", () => {
  it("compila como JavaScript", () => {
    expect(() => new Function(source)).not.toThrow();
  });
  it("no intercepta la red ni guarda nada: sin fetch, caché, IndexedDB ni almacenamiento", () => {
    expect(source).not.toMatch(/addEventListener\(\s*["']fetch["']/);
    expect(source).not.toMatch(/\bcaches\b|indexedDB|localStorage|sessionStorage|importScripts|XMLHttpRequest|\bfetch\s*\(/);
  });
  it("solo atiende el ciclo de vida, el push y el clic", () => {
    const events = [...source.matchAll(/addEventListener\("(\w+)"/g)].map((m) => m[1]);
    expect(events.sort()).toEqual(["activate", "install", "notificationclick", "push"]);
  });
  it("el push se muestra y se descarta: título y texto acotados, sin guardar la carga", () => {
    const shown: { title: string; options: { body: string } }[] = [];
    const listeners: Record<string, (event: unknown) => void> = {};
    const self = {
      addEventListener: (name: string, fn: (event: unknown) => void) => { listeners[name] = fn; },
      registration: { scope: "https://x.test/es/finanzas/", showNotification: (title: string, options: { body: string }) => { shown.push({ title, options }); return Promise.resolve(); } },
      skipWaiting: () => undefined,
      clients: { claim: () => Promise.resolve() },
    };
    new Function("self", source)(self);
    let waited: Promise<unknown> | undefined;
    listeners.push({ data: { json: () => ({ title: "Visa vence en 5 días", body: "Abre la aplicación para ver el detalle.", notification_id: "n1", extra: "x".repeat(500) }) }, waitUntil: (p: Promise<unknown>) => { waited = p; } });
    expect(waited).toBeDefined();
    expect(shown).toEqual([{ title: "Visa vence en 5 días", options: { body: "Abre la aplicación para ver el detalle." } }]);
    // Una carga ilegible o sin datos igual muestra un aviso genérico (userVisibleOnly), sin texto inventado.
    listeners.push({ data: { json: () => { throw new Error("no json"); } }, waitUntil: () => undefined });
    expect(shown[1]).toEqual({ title: "Finanzas", options: { body: "" } });
  });
});

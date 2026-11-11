// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { act } from "react";
import { CustomRules } from "./custom-rules";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/es/finanzas/configuracion/reglas",
}));

const FIELDS_CARD = [
  { key: "utilization", kind: "percent", label: "Usado ÷ cupo (%)", operators: ["gt", "gte", "lt", "lte", "eq", "ne"], choices: [] },
  { key: "used", kind: "amount", label: "Usado", operators: ["gt", "gte", "lt", "lte", "eq", "ne"], choices: [] },
];
const CATALOG = {
  triggers: [
    { key: "card_utilization", label: "Utilización de una tarjeta", subject: "card", condition_fields: FIELDS_CARD },
    { key: "budget_usage", label: "Avance de un presupuesto", subject: "budget", condition_fields: [{ key: "state", kind: "option", label: "Estado", operators: ["eq", "ne"], choices: ["normal", "attention", "exceeded"] }] },
  ],
  actions: ["notify"],
  channels: ["app", "email", "push"],
  severities: ["info", "warning", "critical"],
  max_conditions: 5,
  max_title: 40,
  cooldown_days: [1, 90],
};
const RULE = { id: "r1", name: "Tarjeta al límite", enabled: true, trigger: "card_utilization", conditions: [{ field: "utilization", op: "gte", value: "70.00" }], action: "notify", channels: ["push"], severity: "warning", title: "Visa al 70 %", cooldown_days: 7, last_fired_on: null, created_at: "2026-11-10T13:00:00Z" };
const DRY = { trigger: "card_utilization", evaluated: 2, matched: 1, would_notify: 1, rows: [{ subject_id: "c1", label: "Visa Bancolombia", matched: true, values: { utilization: "78.50", used: "7850000.00" } }, { subject_id: "c2", label: "Mastercard", matched: false, values: { utilization: "12.00", used: null } }], notification_id: null, truncated: false };
const page = (results: unknown[]) => ({ status: 200, json: { count: results.length, page: 1, page_size: 100, results } });
const BASE = { "GET /api/fms/v1/automation/catalog": { status: 200, json: CATALOG } };

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
});

describe("reglas propias (corte 3.1)", () => {
  it("sin reglas muestra el estado vacío con la invitación a crear la primera", async () => {
    view = await mountScreen(<CustomRules />, { ...BASE, "GET /api/fms/v1/automation/rules?page_size=100": page([]) });
    expect(view.visible()).toContain("Aún no tienes reglas propias");
    expect(view.visible()).toContain("Nueva regla");
  });

  it("una regla «si utilización ≥ 70 % → push» se arma sin código, se prueba sin guardar y se crea con Idempotency-Key", async () => {
    let created = false;
    view = await mountScreen(<CustomRules />, {
      ...BASE,
      "GET /api/fms/v1/automation/rules?page_size=100": () => page(created ? [RULE] : []),
      "POST /api/fms/v1/automation/rules/preview": { status: 200, json: DRY },
      "POST /api/fms/v1/automation/rules": () => {
        created = true;
        return { status: 201, json: RULE };
      },
    });
    click(byText(view.host, "button", "Nueva regla"));
    await wait();
    const dialog = () => view!.host.querySelector("dialog")!;
    const inputs = () => [...dialog().querySelectorAll<HTMLInputElement>("input[type=text]")];
    // nombre, y el valor de la condición (el primer campo del disparador es un porcentaje)
    typeInto(inputs()[0], "Tarjeta al límite");
    const selects = [...dialog().querySelectorAll<HTMLSelectElement>("select")];
    const operator = selects.find((s) => [...s.options].some((o) => o.value === "gte"))!;
    typeInto(operator, "gte");
    const value = inputs().find((i) => i.inputMode === "decimal")!;
    typeInto(value, "70");
    // el canal push (la app ya viene marcada) y quitar «En la aplicación»
    const checks = [...dialog().querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
    const labelOf = (c: HTMLInputElement) => c.closest("label")!.textContent;
    click(checks.find((c) => labelOf(c) === "Push")!);
    click(checks.find((c) => labelOf(c)!.startsWith("En la aplicación"))!);
    await wait();

    // «Probar ahora» dentro del formulario: evalúa la definición SIN guardar
    click(byText(dialog(), "button", "Probar ahora"));
    await wait();
    const preview = view.mock.calls.find((c) => c.url.endsWith("/automation/rules/preview"))!;
    expect(preview.body).toEqual({ trigger: "card_utilization", conditions: [{ field: "utilization", op: "gte", value: "70" }] });
    expect(view.mock.calls.some((c) => c.method === "POST" && c.url.endsWith("/automation/rules"))).toBe(false);
    const dry = view.host.querySelector("[data-testid=dry-run]")!.textContent!;
    expect(dry).toContain("Cumplen 1 de 2");
    expect(dry).toContain("Visa Bancolombia");
    expect(dry).toContain("Cumple");
    expect(dry).toContain("No cumple");
    expect(dry).toContain("78,5 %");
    expect(dry).toContain("$7.850.000");

    click(byText(dialog(), "button", "Crear regla"));
    await wait(60);
    const post = view.mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/automation/rules"))!;
    expect(post.body).toMatchObject({ name: "Tarjeta al límite", trigger: "card_utilization", conditions: [{ field: "utilization", op: "gte", value: "70" }], channels: ["push"], severity: "info", cooldown_days: 7, enabled: true });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    expect(view.visible()).toContain("Regla «Tarjeta al límite» creada.");
    expect(view.visible()).toContain("Utilización de una tarjeta");
  });

  it("no se guarda sin un valor válido ni sin canal; no sale ninguna petición", async () => {
    view = await mountScreen(<CustomRules />, { ...BASE, "GET /api/fms/v1/automation/rules?page_size=100": page([]) });
    click(byText(view.host, "button", "Nueva regla"));
    await wait();
    const dialog = view.host.querySelector("dialog")!;
    typeInto(dialog.querySelector<HTMLInputElement>("input[type=text]")!, "Mi regla");
    typeInto([...dialog.querySelectorAll<HTMLInputElement>("input[type=text]")].find((i) => i.inputMode === "decimal")!, "abc");
    click(byText(dialog, "button", "Crear regla"));
    await wait();
    expect(view.visible()).toContain("Escribe un porcentaje entre 0 y 1000");
    expect(view.mock.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("«Probar ahora» de una regla guardada, con aviso de prueba opcional: UNA petición con Idempotency-Key, y dice dónde verlo", async () => {
    view = await mountScreen(<CustomRules />, {
      ...BASE,
      "GET /api/fms/v1/automation/rules?page_size=100": page([RULE]),
      "POST /api/fms/v1/automation/rules/r1/test": { status: 201, json: { ...DRY, notification_id: "n1" } },
    });
    expect(view.visible()).toContain("Tarjeta al límite");
    expect(view.visible()).toContain("Usado ÷ cupo (%) ≥ 70 %");
    click(byText(view.host, "button", "Probar ahora"));
    await wait();
    const dialog = view.host.querySelector("dialog[open]")!;
    click(dialog.querySelector<HTMLInputElement>("input[type=checkbox]")!);
    await act(async () => byText<HTMLButtonElement>(dialog, "button", "Probar ahora").click());
    await wait();
    const calls = view.mock.calls.filter((c) => c.method === "POST");
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ send_notification: true });
    expect(calls[0].headers.get("Idempotency-Key")).toBeTruthy();
    expect(view.visible()).toContain("Se creó el aviso de prueba");
    expect(view.host.querySelector("dialog[open] a")!.getAttribute("href")).toBe("/es/finanzas/notificaciones");
  });

  it("un valor o una opción fuera del catálogo que devuelve el servidor se dice con un texto propio, sin repetir lo escrito", async () => {
    view = await mountScreen(<CustomRules />, {
      ...BASE,
      "GET /api/fms/v1/automation/rules?page_size=100": page([]),
      "POST /api/fms/v1/automation/rules": { status: 422, json: { code: "invalid_condition_value", detail: "invalid condition value" } },
    });
    click(byText(view.host, "button", "Nueva regla"));
    await wait();
    const dialog = view.host.querySelector("dialog")!;
    typeInto(dialog.querySelector<HTMLInputElement>("input[type=text]")!, "R");
    typeInto([...dialog.querySelectorAll<HTMLInputElement>("input[type=text]")].find((i) => i.inputMode === "decimal")!, "70");
    click(byText(dialog, "button", "Crear regla"));
    await wait();
    expect(view.visible()).toContain("El valor de una condición no es válido para ese campo.");
  });
});

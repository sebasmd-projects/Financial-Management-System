// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountScreen, wait, type Mounted } from "@/test/render";
import { RecurrenceSuggestions } from "./recurrence-suggestions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
  usePathname: () => "/es/finanzas",
  useSearchParams: () => new URLSearchParams(),
}));

const SUGGESTION = {
  counterparty: { id: "p-1", name: "Mi Madre" },
  type: "expense" as const,
  account_id: "a-1",
  amount: "500000",
  frequency: "every_n_days" as const,
  interval_days: 15,
  interval: 15,
  day: null,
  last_day: false,
  weekday: null,
  start_date: "2026-10-16",
  occurrences: 4,
  dates: ["2026-09-01", "2026-09-16", "2026-10-01", "2026-10-16"],
  rows: [3, 4],
  movement_ids: ["m-1", "m-2", "m-3", "m-4"],
  category_id: null,
};

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});
const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
const click = (el: Element | undefined) => act(() => { (el as HTMLElement).click(); });

describe("Recurrentes detectadas", () => {
  it("antes de importar solo avisa: no ofrece crear nada", async () => {
    view = await mountScreen(<RecurrenceSuggestions suggestions={[SUGGESTION]} canCreate={false} />, {});
    expect(view.visible()).toContain("Crear recurrente: $500.000 cada 15 días a Mi Madre");
    expect(view.visible()).toContain("Después de importar podrás crear estas recurrentes.");
    expect(button("Crear recurrente")).toBeUndefined();
  });

  it("tras importar, «Crear recurrente» manda lo confirmado (con los pagos que se enlazan) y nunca antes", async () => {
    view = await mountScreen(<RecurrenceSuggestions suggestions={[SUGGESTION]} canCreate />, {
      "POST /api/fms/v1/recurrences/detected": { status: 201, json: { recurrence: { id: "r-1", name: "Mi Madre" }, linked: 4 } },
    });
    expect(view.mock.calls.filter((c) => c.method === "POST")).toHaveLength(0);
    click(button("Crear recurrente"));
    await wait();
    const post = view.mock.calls.find((c) => c.method === "POST");
    expect(post?.url).toBe("/api/fms/v1/recurrences/detected");
    expect(post?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(post?.body).toMatchObject({ counterparty_id: "p-1", expected_amount: "500000", frequency: "every_n_days", interval: 15, movement_ids: ["m-1", "m-2", "m-3", "m-4"] });
    expect(view.visible()).toContain("Recurrente «Mi Madre» creada; 4 pagos anteriores quedaron enlazados.");
  });

  it("«Ahora no» la descarta sin crear nada", async () => {
    view = await mountScreen(<RecurrenceSuggestions suggestions={[SUGGESTION]} canCreate />, {});
    click(button("Ahora no"));
    await wait();
    expect(view.mock.calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(view.visible()).not.toContain("Mi Madre");
  });
});

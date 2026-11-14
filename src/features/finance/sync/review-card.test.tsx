// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountScreen, type Mounted } from "@/test/render";
import { ReviewCard } from "./review-card";
import { ReviewCountProvider } from "./review-count";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas" }));

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});
const summary = (proposed: number) => ({ "GET /api/fms/v1/sync/events/summary": { status: 200, json: { proposed } } });

describe("contador de «Por revisar» en el Resumen", () => {
  it("dice cuántos hay y lleva a la bandeja, sin ningún dato del movimiento", async () => {
    view = await mountScreen(
      <ReviewCountProvider pathname="/es/finanzas">
        <ReviewCard />
      </ReviewCountProvider>,
      summary(2),
    );
    expect(view.visible()).toContain("2 movimientos por revisar");
    expect(view.host.querySelector("a")?.getAttribute("href")).toBe("/es/finanzas/movimientos/por-revisar");
    expect(view.mock.calls).toHaveLength(1);
  });
  it("en singular, y en inglés", async () => {
    view = await mountScreen(
      <ReviewCountProvider pathname="/en/finance">
        <ReviewCard />
      </ReviewCountProvider>,
      summary(1),
      "en",
    );
    expect(view.visible()).toContain("1 movement to review");
    expect(view.host.querySelector("a")?.getAttribute("href")).toBe("/en/finance/transactions/to-review");
  });
  it("sin nada por revisar, ni se pinta", async () => {
    view = await mountScreen(
      <ReviewCountProvider pathname="/es/finanzas">
        <ReviewCard />
      </ReviewCountProvider>,
      summary(0),
    );
    expect(view.host.innerHTML).toBe("");
  });
});

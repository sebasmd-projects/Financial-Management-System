// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearDrill, stageDrill } from "../drill";
import { mountScreen, type Mounted } from "@/test/render";
import { MovementsScreen } from "./movements-screen";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas" }));

let mounted: Mounted | null = null;
afterEach(() => {
  clearDrill();
  mounted?.unmount();
  mounted = null;
  vi.unstubAllGlobals();
});

describe("Movimientos con un filtro de «Ver movimientos»", () => {
  it("lo lista con POST movements/search: el filtro (monto máximo incluido) va en el cuerpo y la URL no lleva nada", async () => {
    stageDrill({ type: "expense", from: "2026-11-01", to: "2026-11-30", counterparty: "p-1", classification: "discretionary", max_amount: "20000" });
    mounted = await mountScreen(<MovementsScreen preset="expense" routeId="movimientos-egresos" />, {
      "POST /api/fms/v1/movements/search": { status: 200, json: { count: 0, page: 1, page_size: 50, results: [] } },
    });
    const search = mounted.mock.calls.find((c) => c.url === "/api/fms/v1/movements/search")!;
    expect(search.body).toMatchObject({ type: "expense", from: "2026-11-01", to: "2026-11-30", counterparty: "p-1", classification: "discretionary", max_amount: "20000", page: 1 });
    expect(search.headers.has("Idempotency-Key")).toBe(false);
    for (const call of mounted.mock.calls) expect(call.url).not.toMatch(/\?.*(amount|20000)/);
    expect(mounted.text()).toContain("Filtro aplicado");
  });
});

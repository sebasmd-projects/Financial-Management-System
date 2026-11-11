// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";
import { exportFileName, saveBlob } from "./download";

describe("descarga de exportaciones", () => {
  it("la URL de objeto se revoca justo después de disparar la descarga, y nada queda en el documento", () => {
    const order: string[] = [];
    const urls = { createObjectURL: vi.fn(() => (order.push("create"), "blob:x")), revokeObjectURL: vi.fn(() => order.push("revoke")) };
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => void order.push("click"));
    saveBlob(new Blob(["a"]), "informe.csv", document, urls);
    expect(order).toEqual(["create", "click", "revoke"]);
    expect(urls.revokeObjectURL).toHaveBeenCalledWith("blob:x");
    expect(document.querySelector("a[download]")).toBeNull();
    click.mockRestore();
  });
  it("el nombre solo lleva caracteres seguros", () => {
    expect(exportFileName("income_statement/../x", "xlsx", "2026-11-11")).toBe("income_statement----x-2026-11-11.xlsx");
    expect(exportFileName("cash_flow", "pdf", "2026-11-11")).toBe("cash_flow-2026-11-11.pdf");
  });
  it("el cliente entrega el archivo como Blob, con CSRF y sin pasar por JSON; el error sigue siendo JSON", async () => {
    const calls: { headers: Headers; body: unknown }[] = [];
    let ok = true;
    const fetchFn = (async (_url: RequestInfo | URL, init: RequestInit = {}) => {
      calls.push({ headers: new Headers(init.headers), body: init.body });
      return ok ? new Response("a,b\n1,2\n", { status: 200, headers: { "Content-Type": "text/csv" } }) : new Response(JSON.stringify({ code: "throttled" }), { status: 429, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    const client = createApiClient({ fetch: fetchFn, readCookie: () => "tok", onUnauthorized: () => undefined });
    const good = await client.post<Blob>("/reports/cash_flow/export", { format: "csv" }, { asBlob: true });
    expect(good.ok && (await good.data.text())).toBe("a,b\n1,2\n");
    expect(calls[0].headers.get("X-CSRFToken")).toBe("tok");
    expect(calls[0].headers.get("Accept")).toBe("*/*");
    ok = false;
    const bad = await client.post<Blob>("/reports/cash_flow/export", { format: "csv" }, { asBlob: true });
    expect(bad).toMatchObject({ ok: false, status: 429, code: "throttled" });
  });
});

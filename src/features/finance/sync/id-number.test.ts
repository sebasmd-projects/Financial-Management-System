import { describe, expect, it, vi } from "vitest";
import { idNumberApi, parseIdNumber } from "./id-number";

describe("la cédula", () => {
  it("de 4 a 20 letras o cifras; ignora puntos, guiones y espacios", () => {
    expect(parseIdNumber("1.020.304.050")).toBe("1020304050");
    expect(parseIdNumber(" 12 34 ")).toBe("1234");
    for (const bad of ["", "123", "x".repeat(21), "12$45", "12/34"]) expect(parseIdNumber(bad)).toBeNull();
  });
  it("guardar y ver van con cuerpo, nunca en la URL", async () => {
    const ok = async () => ({ ok: true as const, status: 200, data: {} });
    const client = { put: vi.fn(ok), delete: vi.fn(ok), post: vi.fn(ok) };
    const api = idNumberApi(client as never);
    await api.save("1020304050");
    await api.reveal();
    await api.clear();
    expect(client.put).toHaveBeenCalledWith("/sync/settings/document", { document: "1020304050" }, undefined);
    expect(client.post).toHaveBeenCalledWith("/sync/settings/document/reveal", undefined, undefined);
    expect(client.delete).toHaveBeenCalledWith("/sync/settings/document", undefined);
    const urls = [...client.put.mock.calls, ...client.post.mock.calls, ...client.delete.mock.calls].map((call) => String((call as unknown[])[0]));
    expect(urls.some((url) => url.includes("1020304050"))).toBe(false);
  });
});

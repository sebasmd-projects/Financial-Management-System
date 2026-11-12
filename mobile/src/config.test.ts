import { resolveApiOrigin } from "./config";

describe("origen de la API", () => {
  it("acepta https y lo normaliza a origen", () => {
    expect(resolveApiOrigin("https://example.test", false)).toBe("https://example.test");
    expect(resolveApiOrigin("https://example.test/", false)).toBe("https://example.test");
  });
  it("rechaza http en release, aunque sea local", () => {
    expect(() => resolveApiOrigin("http://10.0.2.2:8000", false)).toThrow();
    expect(() => resolveApiOrigin("http://example.test", true)).toThrow();
  });
  it("en depuración admite http solo para el emulador o localhost", () => {
    expect(resolveApiOrigin("http://10.0.2.2:8000", true)).toBe("http://10.0.2.2:8000");
    expect(resolveApiOrigin("http://localhost:8000", true)).toBe("http://localhost:8000");
  });
  it("rechaza rutas, credenciales, consulta y valores que no son texto", () => {
    for (const bad of ["https://example.test/api", "https://u:p@example.test", "https://example.test?x=1", "no-url", 42, undefined]) {
      expect(() => resolveApiOrigin(bad, false)).toThrow();
    }
  });
});

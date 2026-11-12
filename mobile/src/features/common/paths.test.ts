import { paths, query } from "./paths";

describe("rutas de la API: nada de montos en la URL", () => {
  it("rechaza las claves que llevan montos", () => {
    for (const key of ["amount", "min_amount", "max_amount", "balance", "total", "price", "value"]) expect(() => query({ [key]: "100" })).toThrow(/Montos fuera de la URL/);
  });
  it("arma la consulta sin vacíos", () => {
    expect(query({ period: "2026-11", unread: true, none: null, empty: "" })).toBe("?period=2026-11&unread=true");
    expect(paths.notifications(true)).toBe("/notifications?unread=true");
    expect(paths.summaryBoth("h1", "2026-10")).toBe("/summary?scope=both&household_id=h1&period=2026-10");
  });
  it("las rutas con ids los codifican", () => {
    expect(paths.pushEndpoint("a/b")).toBe("/push/endpoints/a%2Fb");
  });
});

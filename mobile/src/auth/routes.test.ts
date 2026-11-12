import { allows, destinationFor } from "./routes";
import type { Me, Phase } from "./session";

const me = {} as Me;
const phases: Phase[] = [
  { name: "booting" },
  { name: "signed_out", notice: null },
  { name: "locked" },
  { name: "second_factor", via: "mfa", remember: false },
  { name: "loading" },
  { name: "load_failed", network: true },
  { name: "setup", me },
  { name: "ready", me },
];

describe("rutas por estado de la sesión", () => {
  it("cada estado tiene su destino, y ninguno lleva parámetros", () => {
    expect(phases.map((phase) => [phase.name, destinationFor(phase)])).toEqual([
      ["booting", null],
      ["signed_out", "/login"],
      ["locked", null],
      ["second_factor", "/otp"],
      ["loading", null],
      ["load_failed", "/home"],
      ["setup", "/setup"],
      ["ready", "/home"],
    ]);
  });
  it("bloqueado o cargando no se puede ver ninguna área", () => {
    for (const name of ["booting", "locked", "loading"]) {
      const phase = phases.find((p) => p.name === name)!;
      expect(["public", "otp", "setup", "app"].some((area) => allows(phase, area as "public"))).toBe(false);
    }
  });
  it("el área de la app solo con la cuenta lista", () => {
    expect(phases.filter((p) => allows(p, "app")).map((p) => p.name)).toEqual(["load_failed", "ready"]);
    expect(phases.filter((p) => allows(p, "setup")).map((p) => p.name)).toEqual(["setup"]);
  });
});

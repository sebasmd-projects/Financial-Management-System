import { describeDevice, type Device } from "./logic";

const base: Device = { id: "1", platform: "android", model: "Pixel 8", app_version: "0.1.0", remember: true, created_at: "2026-11-10T12:00:00Z", last_seen_at: "2026-11-11T03:30:00Z", current: false };

describe("dispositivos", () => {
  it("muestra modelo, versión y último uso en hora de Bogotá (UTC−5)", () => {
    expect(describeDevice(base)).toEqual({ title: "Pixel 8", detail: "v0.1.0 · Último uso 10/11/2026 22:30 · Recordado" });
  });
  it("sin modelo cae al nombre de la plataforma; sin «recordarme» no lo dice", () => {
    expect(describeDevice({ ...base, model: "", remember: false })).toEqual({ title: "Android", detail: "v0.1.0 · Último uso 10/11/2026 22:30" });
  });
});

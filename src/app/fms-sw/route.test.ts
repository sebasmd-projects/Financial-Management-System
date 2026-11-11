import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("/_fms/sw.js", () => {
  it("es JavaScript que se revalida siempre y permite el alcance del idioma", async () => {
    const response = GET();
    expect(response.headers.get("Content-Type")).toContain("text/javascript");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(response.headers.get("Service-Worker-Allowed")).toBe("/");
    expect(await response.text()).toContain("showNotification");
  });
});

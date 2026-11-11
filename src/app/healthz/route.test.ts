import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /finanzas/healthz", () => {
  it("200 «ok», texto plano y sin caché", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

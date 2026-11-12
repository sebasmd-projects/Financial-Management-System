import { activationErrorKey, otpauthUrl } from "./logic";

describe("activación", () => {
  it("solo los 403 conocidos tienen texto propio", () => {
    expect(activationErrorKey(403, "mfa_required")).toBe("mfa_required");
    expect(activationErrorKey(403, "consent_mismatch")).toBe("consent_mismatch");
    expect(activationErrorKey(400, "mfa_required")).toBeNull();
    expect(activationErrorKey(403, "otra_cosa")).toBeNull();
  });
  it("el enlace otpauth codifica cuenta y clave", () => {
    const url = otpauthUrl("ABC DEF", "a+b@c.co", "sitio.test");
    expect(url).toBe("otpauth://totp/sitio.test:a%2Bb%40c.co?secret=ABC%20DEF&issuer=sitio.test&digits=6&period=30");
  });
});

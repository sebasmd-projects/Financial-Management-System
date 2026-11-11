import { describe, expect, it } from "vitest";
import { payloadOf, pushScope, urlBase64ToBytes } from "./push";

describe("Web Push", () => {
  it("el alcance es el de la app en cada idioma, no el de todo el sitio", () => {
    expect(pushScope("es")).toBe("/es/finanzas/");
    expect(pushScope("en")).toBe("/en/finance/");
  });
  it("la clave VAPID base64url pasa a bytes", () => {
    expect([...urlBase64ToBytes("AQID")]).toEqual([1, 2, 3]);
    expect([...urlBase64ToBytes("-_8")]).toEqual([251, 255]);
  });
  it("solo se envía el endpoint y las dos claves; sin claves no hay carga", () => {
    const full = { toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "P", auth: "A" }, expirationTime: null }) } as unknown as PushSubscription;
    expect(payloadOf(full)).toEqual({ endpoint: "https://push.example/abc", p256dh: "P", auth: "A" });
    const bare = { toJSON: () => ({ endpoint: "https://push.example/abc" }) } as unknown as PushSubscription;
    expect(payloadOf(bare)).toBeNull();
  });
});

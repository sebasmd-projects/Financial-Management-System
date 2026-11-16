import { describe, expect, it } from "vitest";
import { fold, identifierText, takenName } from "./counterparties";

const T = { channels: { nequi: "Nequi", qr: "QR" }, identifier: "{channel} ··{last4}" };

describe("contrapartes (núcleo común)", () => {
  it("muestra canal y últimos 4, o solo el canal", () => {
    expect(identifierText({ channel: "nequi", last4: "0001" }, T)).toBe("Nequi ··0001");
    expect(identifierText({ channel: "qr", last4: "" }, T)).toBe("QR");
    expect(identifierText({ channel: "otro", last4: "9999" }, T)).toBe("otro ··9999");
  });
  it("lee el nombre actual del 409 y nada más", () => {
    expect(takenName({ code: "identifier_taken", current_name: "Mi Madre" })).toBe("Mi Madre");
    expect(takenName({ current_name: 3 })).toBeNull();
    expect(takenName(null)).toBeNull();
  });
  it("compara nombres sin tildes", () => {
    expect(fold(" Mamá  Yennis")).toBe("mama yennis");
  });
});

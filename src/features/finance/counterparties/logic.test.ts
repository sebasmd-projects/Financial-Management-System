import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { en } from "@/i18n/dictionaries/en";
import { detectedBody, fold, identifierText, suggestionLine, takenName } from "./logic";

const SUGGESTION = {
  counterparty: { id: "p-1", name: "Mi Madre" },
  type: "expense" as const,
  account_id: "a-1",
  amount: "500000",
  frequency: "every_n_days" as const,
  interval_days: 15,
  interval: 15,
  day: null,
  last_day: false,
  weekday: null,
  start_date: "2026-10-16",
  occurrences: 4,
  dates: ["2026-09-01", "2026-09-16", "2026-10-01", "2026-10-16"],
  rows: [],
  movement_ids: ["m-1", "m-2"],
  category_id: null,
};

describe("contrapartes por cuenta", () => {
  it("muestra el canal y solo los últimos 4 dígitos", () => {
    expect(identifierText({ channel: "nequi", last4: "0001" }, es.fin.cp)).toBe("Nequi ··0001");
    expect(identifierText({ channel: "qr", last4: "" }, en.fin.cp)).toBe("QR");
    expect(identifierText({ channel: "raro", last4: "1234" }, es.fin.cp)).toBe("raro ··1234");
  });

  it("lee el nombre actual de un 409 identifier_taken", () => {
    expect(takenName({ code: "identifier_taken", current_name: "Mi Madre" })).toBe("Mi Madre");
    expect(takenName({ code: "x" })).toBeNull();
    expect(takenName(undefined)).toBeNull();
  });

  it("compara nombres sin tildes ni mayúsculas", () => {
    expect(fold("  Mamá   Yennis ")).toBe("mama yennis");
  });

  it("escribe la sugerencia con el monto como cadena decimal, nunca Number", () => {
    expect(suggestionLine(SUGGESTION, es.fin.cp)).toBe("Crear recurrente: $500.000 cada 15 días a Mi Madre");
    expect(suggestionLine({ ...SUGGESTION, frequency: "monthly" }, en.fin.cp)).toBe("Create recurring: $500.000 every month to Mi Madre");
  });

  it("arma el cuerpo de creación con los movimientos que cuadran", () => {
    const body = detectedBody(SUGGESTION);
    expect(body).toMatchObject({ counterparty_id: "p-1", expected_amount: "500000", frequency: "every_n_days", interval: 15, start_date: "2026-10-16", movement_ids: ["m-1", "m-2"] });
    expect(typeof body.expected_amount).toBe("string");
  });
});

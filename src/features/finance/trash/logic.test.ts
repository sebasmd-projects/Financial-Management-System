import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { en } from "@/i18n/dictionaries/en";
import { affectedLabel, affectedLines, daysLeftText, deletedByText } from "./logic";

const T = es.fin.trash;
const E = en.fin.trash;

describe("«qué se verá afectado»", () => {
  it("usa el singular con 1 y el plural con el resto", () => {
    expect(affectedLabel("movements", 1, T.affected)).toBe("1 movimiento");
    expect(affectedLabel("movements", 12, T.affected)).toBe("12 movimientos");
    expect(affectedLabel("movements", 3, E.affected)).toBe("3 transactions");
  });
  it("una clave nueva del servidor se muestra tal cual, sin romper", () => {
    expect(affectedLabel("toString", 2, T.affected)).toBe("2 toString");
    expect(affectedLabel("algo_nuevo", 2, T.affected)).toBe("2 algo_nuevo");
  });
  it("lo que se suelta (categoría, medio de pago) se dice como tal", () => {
    const lines = affectedLines({ affected: { movements_uncategorized: 4, payment_methods: 1 } }, T.affected);
    expect(lines).toEqual(["1 medio de pago", "4 movimientos pasarán a «Sin categoría»"]);
  });
});

describe("la papelera", () => {
  it("dice cuántos días quedan y, el último, que se borra hoy", () => {
    expect(daysLeftText({ days_left: 12 }, T)).toBe("Quedan 12 días para restaurarlo");
    expect(daysLeftText({ days_left: 1 }, T)).toBe("Queda 1 día para restaurarlo");
    expect(daysLeftText({ days_left: 0 }, T)).toBe("Se borra de verdad hoy");
    expect(daysLeftText({ days_left: 9 }, E)).toBe("9 days left to restore it");
  });
  it("dice quién y cuándo eliminó, en fecha de Bogotá", () => {
    expect(deletedByText({ deleted_at: "2026-11-15T03:00:00Z", deleted_by: { id: 1, name: "Ana" } }, T)).toBe("Eliminado por Ana el 14/11/2026");
    expect(deletedByText({ deleted_at: "2026-11-15T03:00:00Z", deleted_by: null }, T)).toBe("Eliminado el 14/11/2026");
  });
});

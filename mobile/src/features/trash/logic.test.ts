import type { ApiResult } from "@core/api/client";
import { trashApi } from "@core/trash";
import { es } from "@/i18n/es";
import { affectedLabel, affectedLines, daysLeftText, deletedByText, scopedClient } from "./logic";

const T = es.trash;

describe("qué se verá afectado", () => {
  it("singular y plural", () => {
    expect(affectedLabel("movements", 1, T.affected)).toBe("1 movimiento");
    expect(affectedLabel("movements", 4, T.affected)).toBe("4 movimientos");
  });
  it("una clave nueva del servidor no rompe", () => {
    expect(affectedLabel("toString", 2, T.affected)).toBe("2 toString");
  });
  it("lo que cae se ordena y lo suelto se dice como tal", () => {
    expect(affectedLines({ affected: { payment_methods: 1, movements: 3, movements_uncategorized: 2, budgets: 0 } }, T.affected)).toEqual(["3 movimientos", "1 medio de pago", "2 movimientos pasarán a «Sin categoría»"]);
  });
});

describe("la Papelera", () => {
  it("días restantes", () => {
    expect(daysLeftText({ days_left: 30 }, T)).toBe("Quedan 30 días para restaurarlo");
    expect(daysLeftText({ days_left: 1 }, T)).toBe("Queda 1 día para restaurarlo");
    expect(daysLeftText({ days_left: 0 }, T)).toBe("Se borra de verdad hoy");
  });
  it("quién y cuándo, en hora de Bogotá", () => {
    expect(deletedByText({ deleted_at: "2026-11-15T03:00:00Z", deleted_by: { id: 1, name: "Ana" } }, T)).toBe("Eliminado por Ana el 14/11/2026");
    expect(deletedByText({ deleted_at: "2026-11-15T03:00:00Z", deleted_by: null }, T)).toBe("Eliminado el 14/11/2026");
  });
});

describe("el cliente con ámbito", () => {
  function fake() {
    const calls: string[] = [];
    const ok = <R,>(data: R): ApiResult<R> => ({ ok: true, status: 200, data });
    return {
      calls,
      raw: {
        get: async <R,>(path: string) => (calls.push(`GET ${path}`), ok({} as R)),
        post: async <R,>(path: string) => (calls.push(`POST ${path}`), ok({} as R)),
      },
    };
  }
  it("en lo personal las rutas van tal cual", async () => {
    const { raw, calls } = fake();
    const api = trashApi(scopedClient(raw, { kind: "personal" }));
    await api.preview("movement", "m1");
    await api.remove("movement", "m1", null, "k");
    await api.restore("d1");
    expect(calls).toEqual(["GET /deletions/preview?kind=movement&id=m1", "POST /deletions", "POST /deletions/d1/restore"]);
  });
  it("en un Hogar cuelgan de households/{id}", async () => {
    const { raw, calls } = fake();
    const api = trashApi(scopedClient(raw, { kind: "household", id: "h1" }));
    await api.list();
    await api.restore("d1");
    expect(calls).toEqual(["GET /households/h1/deletions", "POST /households/h1/deletions/d1/restore"]);
  });
});

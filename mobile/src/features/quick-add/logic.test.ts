import { defaultAccount, movementAccounts, type Account } from "./logic";

const account = (over: Partial<Account>): Account => ({ id: "x", name: "A", kind: "savings", last4: null, status: "active", is_default: false, ...over }) as Account;

describe("cuentas del registro rápido", () => {
  const nuSavings = account({ id: "a", name: "Nu", kind: "savings", last4: "2395" });
  const nuCard = account({ id: "b", name: "Nu", kind: "credit_card", last4: "7048", is_default: true });
  const other = account({ id: "c", name: "Bancolombia" });

  it("distingue los nombres repetidos sin renombrar y deja los únicos cortos", () => {
    expect(movementAccounts([nuSavings, nuCard, other]).map((a) => a.name)).toEqual(["Nu · Tarjeta ••7048", "Nu · Ahorros ••2395", "Bancolombia"]);
  });
  it("la predeterminada viene primero y preseleccionada", () => {
    const usable = movementAccounts([nuSavings, other, nuCard]);
    expect(usable[0].id).toBe("b");
    expect(defaultAccount(usable, [])).toBe("b");
  });
  it("sin predeterminada, la primera", () => {
    expect(defaultAccount(movementAccounts([other, nuSavings]), [])).toBe("c");
  });
});
